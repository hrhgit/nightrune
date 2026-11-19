// The factory runner: takes the oldest open issue labelled `ready-for-agent`, has the area's coding
// agent implement it in its own worktree, runs the checks, opens a PR, waits for Qodo's review of the
// PR head, sends valid findings back to the agent, and stops with a verdict from factory/verdict.ts.
// It never merges. One run at a time (lock file). Every run writes factory/runs/<issue>-<time>.json.
//
//   npm run factory                 one poll: the oldest ready-for-agent issue, if any
//   npm run factory -- --issue 21   that issue, even without the label
//   npm run factory -- --dry        show the ticket it would take and its gate G0, change nothing
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { areaOf, criteria, outside, type Ticket } from './ticket.ts';
import { blocking, forHuman, judge, type Finding, type Judgement, type RunFacts } from './verdict.ts';

interface Area {
  readonly executor: 'codex' | 'claude';
  readonly paths: readonly string[];
}
interface Config {
  readonly repo: string;
  readonly labels: { readonly trigger: string; readonly working: string; readonly done: string; readonly help: string };
  readonly maxAttempts: number;
  readonly agentTimeoutMinutes: number;
  readonly reviewTimeoutMinutes: number;
  readonly areas: Readonly<Record<string, Area>>;
  readonly executors: { readonly codex: { readonly model: string; readonly effort: string }; readonly claude: { readonly model: string } };
}

const ROOT = join(import.meta.dirname, '..');
const CFG = JSON.parse(readFileSync(join(ROOT, 'factory', 'config.json'), 'utf8')) as Config;
const WORK = join(homedir(), '.nightrune-factory');
const LOCK = join(WORK, 'lock');
const QUESTION = '.factory-question.md';
const DISAGREE = '.factory-disagree.md';
const startedAt = new Date();
const runId = startedAt.toISOString().replace(/[:.]/g, '-');
const events: { readonly at: string; readonly step: string; readonly detail?: unknown }[] = [];
let logFile = '';

function note(step: string, detail?: unknown): void {
  const at = new Date().toISOString();
  events.push(detail === undefined ? { at, step } : { at, step, detail });
  const line = `[${at}] ${step}${detail === undefined ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}\n`;
  process.stdout.write(line);
  if (logFile) writeFileSync(logFile, line, { flag: 'a' });
}

function run(cmd: string, args: readonly string[], opts: { cwd?: string; input?: string; timeoutMin?: number } = {}): SpawnSyncReturns<string> {
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? ROOT, input: opts.input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: (opts.timeoutMin ?? 10) * 60_000 });
  if (logFile) writeFileSync(logFile, `$ ${cmd} ${args.join(' ').slice(0, 300)}\n${r.stdout ?? ''}${r.stderr ?? ''}\n[exit ${r.status ?? r.signal}]\n`, { flag: 'a' });
  return r;
}
function must(cmd: string, args: readonly string[], opts: { cwd?: string; input?: string; timeoutMin?: number } = {}): string {
  const r = run(cmd, args, opts);
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(' ')} failed (${r.status ?? r.signal}): ${(r.stderr || r.stdout).slice(-800)}`);
  return r.stdout;
}
const gh = (...args: string[]): string => must('gh', args);
const tail = (s: string, n = 60): string => s.split('\n').slice(-n).join('\n');

function qodoBin(): string {
  const local = join(process.env.QODO_HOME ?? join(homedir(), '.qodo'), 'bin', 'qodo');
  return run('qodo', ['--version']).status === 0 ? 'qodo' : local;
}

// ---------- the ticket ----------

function pickTicket(issue: number | undefined): Ticket | null {
  const fields = 'number,title,body,labels';
  if (issue !== undefined) {
    const t = JSON.parse(gh('issue', 'view', String(issue), '--repo', CFG.repo, '--json', fields)) as { number: number; title: string; body: string; labels: { name: string }[] };
    return { ...t, labels: t.labels.map((l) => l.name) };
  }
  const list = JSON.parse(gh('issue', 'list', '--repo', CFG.repo, '--label', CFG.labels.trigger, '--state', 'open', '--limit', '50', '--json', fields)) as { number: number; title: string; body: string; labels: { name: string }[] }[];
  const oldest = list.sort((a, b) => a.number - b.number)[0];
  return oldest === undefined ? null : { ...oldest, labels: oldest.labels.map((l) => l.name) };
}

/** Returns the error text, or null if GitHub accepted the change. */
function relabel(issue: number, add: string[], remove: string[]): string | null {
  const args = ['issue', 'edit', String(issue), '--repo', CFG.repo];
  for (const a of add) args.push('--add-label', a);
  for (const r of remove) args.push('--remove-label', r);
  const r = run('gh', args);
  return r.status === 0 ? null : `gh issue edit failed: ${(r.stderr || r.stdout).trim().slice(-300)}`;
}

function openPr(branch: string): string | null {
  const list = JSON.parse(gh('pr', 'list', '--repo', CFG.repo, '--head', branch, '--state', 'open', '--json', 'url')) as { url: string }[];
  return list[0]?.url ?? null;
}

// ---------- the agent ----------

function runAgent(executor: Area['executor'], prompt: string, dir: string): string {
  const reportFile = `${dir}.report.md`; // outside the worktree, so it can never be committed
  rmSync(reportFile, { force: true });
  note('agent start', { executor, chars: prompt.length });
  const t = CFG.agentTimeoutMinutes;
  const r =
    executor === 'codex'
      ? run('codex', ['exec', '-C', dir, '-m', CFG.executors.codex.model, '-c', `model_reasoning_effort="${CFG.executors.codex.effort}"`, '-s', 'workspace-write', '--skip-git-repo-check', '-o', reportFile, '-'], { cwd: dir, input: prompt, timeoutMin: t })
      : run(
          'claude',
          ['-p', '--model', CFG.executors.claude.model, '--permission-mode', 'acceptEdits', '--output-format', 'text', '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(npm run check)', 'Bash(npm run test*)', 'Bash(npm run scenes*)', 'Bash(npx vitest *)', 'Bash(npx tsc *)', 'Bash(npx eslint *)', 'Bash(git diff*)', 'Bash(git status*)'],
          { cwd: dir, input: prompt, timeoutMin: t },
        );
  const report = existsSync(reportFile) ? readFileSync(reportFile, 'utf8') : r.stdout;
  note('agent end', { exit: r.status ?? r.signal, reportChars: report.length });
  return report.trim();
}

function readAndRemove(dir: string, name: string): string | null {
  const p = join(dir, name);
  if (!existsSync(p)) return null;
  const text = readFileSync(p, 'utf8').trim();
  rmSync(p);
  return text || null;
}

const lines = (s: string): string[] => s.split('\n').filter((l) => l !== '' && !l.startsWith('.factory-'));

/** Every file that differs from the base: committed, staged, unstaged or untracked. */
function changedFiles(dir: string, base: string): string[] {
  const tracked = lines(must('git', ['diff', '--name-only', base], { cwd: dir }));
  const untracked = lines(must('git', ['ls-files', '--others', '--exclude-standard'], { cwd: dir }));
  return [...new Set([...tracked, ...untracked])].sort();
}
/** Files not yet committed. */
const uncommitted = (dir: string): string[] => lines(must('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: dir }).replace(/^.{3}/gm, ''));
const headOf = (dir: string): string => must('git', ['rev-parse', 'HEAD'], { cwd: dir }).trim();

function checks(dir: string): { ok: boolean; output: string } {
  const r = run('npm', ['run', 'check'], { cwd: dir, timeoutMin: 20 });
  return { ok: r.status === 0, output: tail(`${r.stdout}${r.stderr}`) };
}

const RULES_OF_THE_RUN = (area: Area) => `
Rules for this run:
- Read AGENTS.md and RULES.md first; they are the project rules. CLAUDE.md does not apply to you.
- Change only files under: ${area.paths.join(', ')}. Anything else fails the run.
- Where a criterion can be tested, write the test first and see it fail.
- Run \`npm run check\` and make it pass. Do not commit, push, or open a PR; the factory does that.
- If a criterion is ambiguous or conflicts with RULES.md, do not guess: write your question to ${QUESTION} in the repository root and stop.
- End with a short report: each acceptance criterion and how you checked it. Your report goes into the PR as information; the verdict comes from the checks and the review, not from it.`;

function implementPrompt(t: Ticket, area: Area): string {
  return `You are the coding agent of the Nightrune software factory, implementing GitHub issue #${t.number} in this repository.

# Issue #${t.number}: ${t.title}

${t.body}
${RULES_OF_THE_RUN(area)}`;
}

function retryChecksPrompt(t: Ticket, area: Area, outsideFiles: readonly string[], output: string): string {
  return `You are continuing work on issue #${t.number} (${t.title}) in this repository. The factory's checks did not pass.
${outsideFiles.length ? `\nThese files are outside your area; revert your changes to them: ${outsideFiles.join(', ')}\n` : ''}${output ? `\nThe end of \`npm run check\`:\n\n\`\`\`\n${output}\n\`\`\`\n` : ''}
Fix the cause, then run \`npm run check\` again.
${RULES_OF_THE_RUN(area)}`;
}

function findingsPrompt(t: Ticket, area: Area, open: Finding[], full: Map<string, unknown>): string {
  return `You are continuing work on issue #${t.number} (${t.title}). Qodo reviewed the PR and these findings are open:

${open.map((f) => `## ${f.id}: ${f.title} (${f.action_level})\n\n${JSON.stringify(full.get(f.id), null, 2)}`).join('\n\n')}

Investigate each one against the code and the issue. Fix the ones that are real. For any you are sure is wrong, do not change code for it: write the finding id and your evidence to ${DISAGREE}; a person will decide.
${RULES_OF_THE_RUN(area)}`;
}

// ---------- the review ----------

interface Review {
  readonly status: string;
  readonly commitSha: string;
}

function readReview(prUrl: string): { review: Review | null; findings: Finding[]; raw: Map<string, unknown> } {
  const r = run(qodoBin(), ['read', 'pr-review-session', 'findings', '--pr-url', prUrl, '--json']);
  if (r.status !== 0) return { review: null, findings: [], raw: new Map() };
  const d = JSON.parse(r.stdout) as { review_session: { status: string; commit_sha: string } | null; findings: (Finding & Record<string, unknown>)[] };
  const raw = new Map<string, unknown>(d.findings.map((f) => [f.id, { title: f.title, description: f.description, location: f.location, category: f.category }]));
  return { review: d.review_session && { status: d.review_session.status, commitSha: d.review_session.commit_sha }, findings: d.findings, raw };
}

async function waitForReview(prUrl: string, head: string): Promise<ReturnType<typeof readReview>> {
  const deadline = Date.now() + CFG.reviewTimeoutMinutes * 60_000;
  let last = readReview(prUrl);
  while (Date.now() < deadline) {
    last = readReview(prUrl);
    const s = last.review;
    if (s?.commitSha === head && s.status !== 'started') break;
    await new Promise((res) => setTimeout(res, 30_000));
  }
  note('review', { status: last.review?.status ?? null, commit: last.review?.commitSha ?? null, head, findings: last.findings.length });
  return last;
}

// ---------- the run ----------

/** Creates the lock file exclusively; a lock left by a dead process is taken over once. */
function takeLock(): boolean {
  const create = (): boolean => {
    try {
      writeFileSync(LOCK, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      return false;
    }
  };
  if (create()) return true;
  let pid = 0;
  try {
    pid = Number(readFileSync(LOCK, 'utf8'));
  } catch {
    // removed between the two calls
  }
  // Alive only if that pid is still a factory run: a dead run's pid can be reused by another process.
  const command = pid > 0 ? run('ps', ['-o', 'command=', '-p', String(pid)]).stdout : '';
  if (command.includes('factory/run.ts')) return false;
  rmSync(LOCK, { force: true });
  return create();
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { issue: { type: 'string' }, dry: { type: 'boolean' } } });
  mkdirSync(WORK, { recursive: true });
  if (!takeLock()) return void console.log('factory: another run is still going');
  try {
    const ticket = pickTicket(values.issue === undefined ? undefined : Number(values.issue));
    if (ticket === null) return void console.log(`factory: no open issue labelled ${CFG.labels.trigger}`);
    if (values.dry === true) {
      const area = areaOf(ticket.labels, Object.keys(CFG.areas));
      return void console.log(JSON.stringify({ issue: ticket.number, title: ticket.title, area, executor: area === null ? null : CFG.areas[area]?.executor, criteria: criteria(ticket.body) }, null, 2));
    }
    mkdirSync(join(ROOT, '.factory', 'logs'), { recursive: true });
    logFile = join(ROOT, '.factory', 'logs', `${ticket.number}-${runId}.log`);
    await work(ticket);
  } finally {
    rmSync(LOCK, { force: true });
  }
}

async function work(t: Ticket): Promise<void> {
  note('ticket', { number: t.number, title: t.title, labels: t.labels });
  const crit = criteria(t.body);
  const areaName = areaOf(t.labels, Object.keys(CFG.areas));
  const area = areaName === null ? undefined : CFG.areas[areaName];
  const facts: { -readonly [K in keyof RunFacts]: RunFacts[K] } = {
    ticketOk: crit.length > 0 && area !== undefined,
    question: null,
    outsideArea: [],
    emptyChange: false,
    checksPassed: null,
    review: null,
    headSha: null,
    findings: [],
    attempts: 0,
    maxAttempts: CFG.maxAttempts,
    stalled: false,
    stoppedBy: null,
  };
  const record: Record<string, unknown> = { run: runId, issue: t.number, title: t.title, criteria: crit.length, area: areaName, startedAt: startedAt.toISOString() };
  if (!facts.ticketOk || area === undefined) return finish(t, facts, record, null, '');

  try {
    const branch = `agent/issue-${t.number}`;
    const existing = openPr(branch);
    if (existing !== null) {
      facts.stoppedBy = `an open PR already exists for this issue (${existing}); close it or take the ${CFG.labels.trigger} label off`;
      return finish(t, facts, record, existing, '');
    }
    const claimed = relabel(t.number, [CFG.labels.working], [CFG.labels.trigger, CFG.labels.help, CFG.labels.done]);
    if (claimed !== null) throw new Error(`could not claim the issue: ${claimed}`);
    const executor = area.executor;
    record.executor = executor;
    record.model = executor === 'codex' ? `${CFG.executors.codex.model} (${CFG.executors.codex.effort})` : CFG.executors.claude.model;

    const dir = join(WORK, `issue-${t.number}`);
    // --prune drops tracking refs of deleted branches, so the push lease below is not stale.
    must('git', ['fetch', '--prune', 'origin']);
    run('git', ['worktree', 'remove', '--force', dir]);
    rmSync(dir, { recursive: true, force: true });
    must('git', ['worktree', 'add', '-B', branch, dir, 'origin/main']);
    const base = must('git', ['rev-parse', 'origin/main']).trim();
    record.base = base;
    note('worktree', { dir, branch, base: record.base });
    must('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, timeoutMin: 15 });

    // Implement, then retry on failed checks, up to the limit.
    let report = '';
    let prompt = implementPrompt(t, area);
    let lastChecks = { ok: false, output: '' };
    while (facts.attempts < CFG.maxAttempts) {
      facts.attempts += 1;
      report = runAgent(executor, prompt, dir);
      facts.question = readAndRemove(dir, QUESTION);
      if (facts.question !== null) break;
      if (headOf(dir) !== base) {
        facts.stoppedBy = 'the agent made its own commits; only the factory commits';
        break;
      }
      const files = changedFiles(dir, base);
      facts.emptyChange = files.length === 0;
      if (facts.emptyChange) break;
      facts.outsideArea = outside(files, area.paths);
      lastChecks = checks(dir);
      facts.checksPassed = lastChecks.ok;
      note('checks', { attempt: facts.attempts, passed: lastChecks.ok, outside: facts.outsideArea });
      if (lastChecks.ok && facts.outsideArea.length === 0) break;
      prompt = retryChecksPrompt(t, area, facts.outsideArea, lastChecks.ok ? '' : lastChecks.output);
    }
    record.implementAttempts = facts.attempts;
    if (facts.stoppedBy !== null || facts.question !== null || facts.emptyChange || facts.outsideArea.length > 0 || facts.checksPassed !== true) {
      return finish(t, facts, record, null, report, lastChecks.output);
    }

    // Commit, push, open the PR.
    const commit = (message: string): string => {
      must('git', ['add', '-A', '--', '.', ':(exclude).factory-*'], { cwd: dir });
      const trailer = executor === 'claude' ? 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>' : `Implemented-By: Codex (${CFG.executors.codex.model})`;
      must('git', ['commit', '-q', '-m', `${message}\n\nFactory run ${runId}, issue #${t.number}.\n\n${trailer}`], { cwd: dir });
      must('git', ['push', '-q', '--force-with-lease', '-u', 'origin', branch], { cwd: dir });
      return headOf(dir);
    };
    facts.headSha = commit(`Agent: ${t.title} (#${t.number})`);
    const body = `Closes #${t.number}

  Opened by the Nightrune factory (\`factory/run.ts\`, run \`${runId}\`). Implemented by **${executor}** (${String(record.model)}). The factory's verdict comes from \`factory/verdict.ts\` (checks, area, Qodo review of the PR head), not from the agent's report.

  ## Acceptance criteria (from the issue)

  ${crit.map((c) => `- [ ] ${c}`).join('\n')}

  ## Factory checks

  - Files changed only inside area \`${areaName}\`: yes
  - \`npm run check\`: passed (attempt ${facts.attempts} of ${CFG.maxAttempts})

  ## Agent's report (information only)

  ${report || '(no report)'}

  🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
    const prUrl = must('gh', ['pr', 'create', '--repo', CFG.repo, '--head', branch, '--base', 'main', '--title', `${t.title} (#${t.number})`, '--body-file', '-'], { cwd: dir, input: body }).trim();
    record.pr = prUrl;
    note('pr', prUrl);
    facts.attempts = 0; // from here on, attempts counts review fix rounds

    // Review loop: fix valid blocking findings until clean, stalled or out of rounds.
    let reviewRounds = 0;
    let previous = '';
    for (;;) {
      const seen = await waitForReview(prUrl, facts.headSha);
      facts.review = seen.review;
      facts.findings = seen.findings;
      if (seen.review?.commitSha !== facts.headSha || seen.review.status !== 'completed') break;
      const open = blocking(seen.findings);
      const ids = open.map((f) => f.id).sort().join(',');
      if (open.length === 0) break;
      if (ids === previous) {
        facts.stalled = true;
        break;
      }
      if (reviewRounds >= CFG.maxAttempts) break;
      previous = ids;
      reviewRounds += 1;
      facts.attempts = reviewRounds;
      report = runAgent(executor, findingsPrompt(t, area, open, seen.raw), dir);
      facts.question = readAndRemove(dir, QUESTION);
      const disagreement = readAndRemove(dir, DISAGREE);
      if (disagreement !== null) facts.question = `the agent disagrees with a finding:\n${disagreement}`;
      if (facts.question !== null) break;
      if (headOf(dir) !== facts.headSha) {
        facts.stoppedBy = 'the agent made its own commits; only the factory commits';
        break;
      }
      if (uncommitted(dir).length === 0) {
        facts.stalled = true; // findings open and the agent changed nothing
        break;
      }
      facts.outsideArea = outside(changedFiles(dir, base), area.paths);
      lastChecks = checks(dir);
      facts.checksPassed = lastChecks.ok;
      note('checks', { round: reviewRounds, passed: lastChecks.ok, outside: facts.outsideArea });
      if (!lastChecks.ok || facts.outsideArea.length > 0) break;
      facts.headSha = commit(`Agent: address Qodo findings on #${t.number} (round ${reviewRounds})`);
    }
    record.reviewRounds = reviewRounds;
    return finish(t, facts, record, prUrl, report, lastChecks.ok ? '' : lastChecks.output);
  } catch (e) {
    facts.stoppedBy = `the run failed: ${e instanceof Error ? e.message : String(e)}`;
    return finish(t, facts, record, typeof record.pr === 'string' ? record.pr : null, '');
  }
}

function finish(t: Ticket, facts: RunFacts, record: Record<string, unknown>, prUrl: string | null, report: string, checkOutput = ''): void {
  const j: Judgement = judge(facts);
  const file = join(ROOT, 'factory', 'runs', `${t.number}-${runId}.json`);
  const out = {
    ...record,
    finishedAt: new Date().toISOString(),
    verdict: j.verdict,
    reasons: j.reasons,
    facts: { ...facts, findings: facts.findings.map((f) => ({ id: f.id, title: f.title, action_level: f.action_level, attribution_status: f.attribution_status })) },
    findingsForHuman: forHuman(facts.findings).map((f) => f.title),
    events,
  };
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  note('verdict', { verdict: j.verdict, reasons: j.reasons, record: file });
  const comment = `**Factory verdict: ${j.verdict}** (run \`${runId}\`)

${j.reasons.length ? j.reasons.map((r) => `- ${r}`).join('\n') : '- all gates met'}
${prUrl ? `\nPR: ${prUrl}` : ''}${checkOutput ? `\n\n<details><summary>End of npm run check</summary>\n\n\`\`\`\n${checkOutput}\n\`\`\`\n</details>` : ''}${!prUrl && report ? `\n\n<details><summary>Agent's report</summary>\n\n${report}\n</details>` : ''}

The verdict is computed by \`factory/verdict.ts\` from the checks and the review. A person decides whether to merge.`;
  const commented = run('gh', ['issue', 'comment', String(t.number), '--repo', CFG.repo, '--body-file', '-'], { input: comment });
  const labelled = relabel(t.number, [j.verdict === 'READY' ? CFG.labels.done : CFG.labels.help], [CFG.labels.working, CFG.labels.trigger]);
  const githubErrors = [commented.status === 0 ? null : `gh issue comment failed: ${(commented.stderr || commented.stdout).trim().slice(-300)}`, labelled].filter((x) => x !== null);
  if (githubErrors.length > 0) {
    // The verdict stands, but the issue does not show it; say so in the record and fail the process.
    writeFileSync(file, `${JSON.stringify({ ...out, githubErrors }, null, 2)}\n`);
    note('github update failed', githubErrors);
    process.exitCode = 1;
  }
}

await main();
