// The factory's verdict on one run, computed from facts the runner collected. Pure: no I/O.
// The agent's own account of its work is not an input.

export type Verdict = 'READY' | 'NEEDS_FIX' | 'NEEDS_HUMAN' | 'NOT_DONE';

/** Qodo's open/closed statuses (see the qodo-review-resolver skill). Anything else counts as open. */
const CLOSED = new Set(['implemented', 'full_implementation', 'dismissed', 'detected_after_merge', 'outdated']);
/** Levels the gate requires fixed; `informational` is reported to the person instead. */
const BLOCKING = new Set(['action_required', 'remediation_recommended']);

export interface Finding {
  readonly id: string;
  readonly title: string;
  readonly action_level: string;
  readonly attribution_status: string;
}

export interface RunFacts {
  /** G0: the ticket has acceptance criteria and exactly one area label. */
  readonly ticketOk: boolean;
  /** The agent asked a question instead of guessing. */
  readonly question: string | null;
  /** Files the run changed outside its area, after the last attempt. */
  readonly outsideArea: readonly string[];
  /** The agent changed nothing. */
  readonly emptyChange: boolean;
  /** `npm run check` on the final code: true, false, or null if it was never run. */
  readonly checksPassed: boolean | null;
  /** The latest Qodo review session, or null if none was seen. */
  readonly review: { readonly status: string; readonly commitSha: string } | null;
  readonly headSha: string | null;
  readonly findings: readonly Finding[];
  /** Fix rounds used and allowed. */
  readonly attempts: number;
  readonly maxAttempts: number;
  /** The same blocking findings stayed open after a fix round. */
  readonly stalled: boolean;
  /** The run could not go on: setup failed, an open PR already exists, or the agent committed by itself. */
  readonly stoppedBy: string | null;
}

export const isOpen = (f: Finding): boolean => !CLOSED.has(f.attribution_status);
export const blocking = (fs: readonly Finding[]): Finding[] => fs.filter((f) => isOpen(f) && BLOCKING.has(f.action_level));
export const forHuman = (fs: readonly Finding[]): Finding[] => fs.filter((f) => isOpen(f) && !BLOCKING.has(f.action_level));

export interface Judgement {
  readonly verdict: Verdict;
  readonly reasons: readonly string[];
}

export function judge(f: RunFacts): Judgement {
  const human: string[] = [];
  if (f.stoppedBy !== null) human.push(f.stoppedBy);
  if (!f.ticketOk) human.push('ticket has no acceptance criteria or not exactly one area label');
  if (f.question !== null) human.push(`agent asked: ${f.question}`);
  if (f.outsideArea.length > 0) human.push(`changed files outside its area: ${f.outsideArea.join(', ')}`);
  if (f.emptyChange) human.push('agent made no change');
  if (f.stalled) human.push('the same findings stayed open after a fix round');
  const open = blocking(f.findings);
  const failing = f.checksPassed === false || open.length > 0;
  if (failing && f.attempts >= f.maxAttempts) human.push(`retry limit reached (${f.attempts} of ${f.maxAttempts})`);

  const notDone: string[] = [];
  if (f.checksPassed === null) notDone.push('checks were not run');
  if (f.review === null) notDone.push('no Qodo review seen');
  else if (f.review.status !== 'completed') notDone.push(`Qodo review is ${f.review.status}`);
  else if (f.headSha === null || f.review.commitSha !== f.headSha) notDone.push(`Qodo reviewed ${f.review.commitSha.slice(0, 7)}, not the PR head ${f.headSha?.slice(0, 7) ?? '(none)'}`);

  const fix: string[] = [];
  if (f.checksPassed === false) fix.push('npm run check fails');
  for (const x of open) fix.push(`open ${x.action_level} finding: ${x.title}`);

  // A person who is asked to decide also sees the state of the review and what is still open.
  if (human.length > 0) return { verdict: 'NEEDS_HUMAN', reasons: [...human, ...notDone, ...fix] };
  if (notDone.length > 0) return { verdict: 'NOT_DONE', reasons: notDone };
  if (fix.length > 0) return { verdict: 'NEEDS_FIX', reasons: fix };

  const low = forHuman(f.findings);
  return { verdict: 'READY', reasons: low.map((x) => `for you to decide (${x.action_level}): ${x.title}`) };
}

export type AfterFix = 'review' | 'commit-then-stop' | 'stop' | 'stalled';

/**
 * What the runner does after the agent's fix round. Fixes for the findings the agent accepted are kept
 * (checked, committed and reviewed) even when it disputes another finding; a dispute then goes to a person.
 * A question or the agent's own commit stops the round without committing anything.
 */
export function afterFixRound(r: { readonly asked: boolean; readonly disputed: boolean; readonly ownCommit: boolean; readonly changed: boolean }): AfterFix {
  if (r.ownCommit || r.asked) return 'stop';
  if (!r.changed) return r.disputed ? 'stop' : 'stalled';
  return r.disputed ? 'commit-then-stop' : 'review';
}
