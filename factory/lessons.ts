// Turns a fixed Qodo finding into a check that runs locally next time. Pure except for the injected lint probe.
// The agent proposes one entry per fixed finding in `.factory-lessons.json`; this module only accepts an
// entry when the facts back it up. The agent's own words are never the evidence.

/** Preference order from CLAUDE.md rule 10: use the earliest layer that can catch the mistake. */
export const LAYERS = ['type', 'lint', 'test', 'runtime', 'review-rule', 'none'] as const;
export type Layer = (typeof LAYERS)[number];

export interface Lesson {
  /** The Qodo finding id this lesson comes from. */
  readonly finding: string;
  readonly layer: Layer;
  /** type, test, runtime: a file the round changed that holds the check. */
  readonly check?: string | undefined;
  /** lint: the ESLint rule id, a virtual file path, code that must trigger it and code that must not. */
  readonly rule?: string | undefined;
  readonly filePath?: string | undefined;
  readonly badCode?: string | undefined;
  readonly goodCode?: string | undefined;
  /** review-rule and none: why no earlier layer can catch it. */
  readonly reason?: string | undefined;
}

export interface LessonContext {
  /** Open blocking findings the round was asked to fix. */
  readonly required: readonly { readonly id: string; readonly title: string }[];
  /** Ids of findings the agent disputed (see disputedIds); a disputed finding needs no lesson. */
  readonly disputed: readonly string[];
  /** Files this round changed (uncommitted, relative to the repository root), not files from earlier rounds. */
  readonly changedFiles: readonly string[];
  /** Lines the round removed from eslint.config.js; the config may only grow. */
  readonly lintConfigRemovedLines: number;
  /** ESLint rule ids that fire on this code at this path, under the config as changed by this round. */
  readonly lint: (code: string, filePath: string) => Promise<readonly string[]>;
  /** The same, under the config as it was before this round. */
  readonly lintBefore: (code: string, filePath: string) => Promise<readonly string[]>;
}

/** The runner owns this file; agents may not change it, and it is exempt from the area check. */
export const LESSONS_LOG = 'factory/lessons.md';
export const withoutRunnerFiles = (files: readonly string[]): string[] => files.filter((f) => f !== LESSONS_LOG);

/** A dispute names a finding by starting a line with its id: `<id>: evidence`. Mentioning an id elsewhere disputes nothing. */
export function disputedIds(text: string | null): string[] {
  if (text === null) return [];
  return [...text.matchAll(/^[\s#*-]*`?([0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})`?\s*[:\u2014-]/gm)].map((m) => m[1] as string);
}

const LINT_CONFIG = 'eslint.config.js';
/** What the runner's lint probe reports for a diagnostic without a rule id. */
export const PARSE_ERROR = 'parse-error';

export function parseLessons(text: string | null): { lessons: Lesson[]; problems: string[] } {
  if (text === null) return { lessons: [], problems: [] };
  try {
    const v: unknown = JSON.parse(text);
    if (!Array.isArray(v)) return { lessons: [], problems: ['.factory-lessons.json must be a JSON array'] };
    const lessons: Lesson[] = [];
    const problems: string[] = [];
    v.forEach((e: unknown, i) => {
      if (typeof e !== 'object' || e === null || Array.isArray(e)) return void problems.push(`entry ${i} must be an object`);
      const o = e as Record<string, unknown>;
      if (typeof o.finding !== 'string') return void problems.push(`entry ${i} needs a string finding`);
      const bad = ['layer', 'check', 'rule', 'filePath', 'badCode', 'goodCode', 'reason'].filter((k) => o[k] !== undefined && typeof o[k] !== 'string');
      if (bad.length > 0) return void problems.push(`entry ${i} (${o.finding}): ${bad.join(', ')} must be strings`);
      lessons.push(o as unknown as Lesson);
    });
    return { lessons, problems };
  } catch (e) {
    return { lessons: [], problems: [`.factory-lessons.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

/** Why each lesson is not acceptable yet. An empty list means every required finding has a backed lesson. */
export async function lessonProblems(lessons: readonly Lesson[], ctx: LessonContext): Promise<string[]> {
  const problems: string[] = [];
  if (ctx.lintConfigRemovedLines > 0) problems.push(`${LINT_CONFIG}: this round removed ${ctx.lintConfigRemovedLines} line(s); lint changes may only add rules, never weaken or narrow existing ones`);
  const byFinding = new Map(lessons.map((l) => [l.finding, l]));
  for (const f of ctx.required) {
    if (ctx.disputed.includes(f.id)) continue;
    if (!byFinding.has(f.id)) problems.push(`finding ${f.id} (${f.title}) has no lesson; add an entry for it to .factory-lessons.json`);
  }
  for (const l of lessons) {
    const at = `lesson for ${String(l.finding)}`;
    if (!LAYERS.includes(l.layer)) {
      problems.push(`${at}: layer must be one of ${LAYERS.join(', ')}`);
      continue;
    }
    if (l.layer === 'none' || l.layer === 'review-rule') {
      if ((l.reason ?? '').trim().length < 20) problems.push(`${at}: layer ${l.layer} needs a reason (20+ characters) saying why a type, lint, test or runtime check cannot catch it`);
    } else if (l.layer === 'lint') {
      if (!l.rule || !l.filePath || !l.badCode || l.goodCode === undefined) {
        problems.push(`${at}: a lint lesson needs rule, filePath, badCode and goodCode`);
        continue;
      }
      if (!ctx.changedFiles.includes(LINT_CONFIG)) problems.push(`${at}: a lint lesson must add or change a rule in ${LINT_CONFIG}`);
      const bad = await ctx.lint(l.badCode, l.filePath);
      const good = await ctx.lint(l.goodCode, l.filePath);
      if (l.rule === PARSE_ERROR || bad.includes(PARSE_ERROR) || good.includes(PARSE_ERROR)) problems.push(`${at}: badCode and goodCode must parse; a syntax error is not a lint rule`);
      else if (!bad.includes(l.rule)) problems.push(`${at}: rule ${l.rule} does not fire on badCode at ${l.filePath}`);
      else if (good.includes(l.rule)) problems.push(`${at}: rule ${l.rule} fires on goodCode at ${l.filePath}`);
      else if ((await ctx.lintBefore(l.badCode, l.filePath)).includes(l.rule)) problems.push(`${at}: rule ${l.rule} already fired on badCode before this round; a lint lesson must add or extend a rule, not name an old one`);
    } else if (!l.check || !ctx.changedFiles.includes(l.check)) {
      problems.push(`${at}: layer ${l.layer} needs check to name a file this round changed (${l.check ?? 'missing'})`);
    }
  }
  return problems;
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** One markdown row per lesson for factory/lessons.md; written by the runner, not the agent. */
export function lessonRows(lessons: readonly Lesson[], issue: number, titles: ReadonlyMap<string, string>): string {
  return lessons
    .map((l) => {
      const became = l.layer === 'lint' ? `lint: \`${l.rule}\` in ${LINT_CONFIG}` : l.layer === 'none' || l.layer === 'review-rule' ? `${l.layer}: ${l.reason}` : `${l.layer}: \`${l.check}\``;
      return `| #${issue} | ${cell(titles.get(l.finding) ?? l.finding)} | ${cell(became ?? '')} |`;
    })
    .join('\n');
}
