// A fixed review finding only counts as a lesson when the facts back it: a lint rule must fire on its bad code
// and stay quiet on its good code, and other layers must name a file the round changed.
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { outside } from '../factory/ticket.ts';
import { disputedIds, lessonProblems, lessonRows, parseLessons, withoutRunnerFiles, type Lesson, type LessonContext } from '../factory/lessons.ts';

const eslint = new ESLint();
const probe = async (code: string, filePath: string): Promise<string[]> => ((await eslint.lintText(code, { filePath }))[0]?.messages ?? []).map((m) => m.ruleId ?? 'parse-error');
const ctx = (over: Partial<LessonContext> = {}): LessonContext => ({
  required: [{ id: 'f1', title: 'clock read in engine' }],
  disputed: [],
  changedFiles: ['eslint.config.js', 'tests/x.test.ts'],
  lintConfigRemovedLines: 0,
  lint: probe,
  lintBefore: async () => [], // the rule did not exist before this round
  ...over,
});
const lint: Lesson = { finding: 'f1', layer: 'lint', rule: 'no-restricted-properties', filePath: 'engine/__x.ts', badCode: 'export const x = Math.random();\n', goodCode: 'export const x = 1;\n' };

describe('factory lessons', () => {
  it('accepts a lint lesson whose rule fires on bad code and not on good code', async () => {
    expect(await lessonProblems([lint], ctx())).toEqual([]);
  });

  it('rejects a lint rule that does not fire on its bad code (the real config is used)', async () => {
    const p = await lessonProblems([{ ...lint, badCode: 'export const x = 2;\n' }], ctx());
    expect(p).toEqual(['lesson for f1: rule no-restricted-properties does not fire on badCode at engine/__x.ts']);
  });

  it('rejects a lint rule that also fires on its good code', async () => {
    const p = await lessonProblems([{ ...lint, goodCode: lint.badCode }], ctx());
    expect(p).toEqual(['lesson for f1: rule no-restricted-properties fires on goodCode at engine/__x.ts']);
  });

  it('rejects a lint lesson when eslint.config.js was not changed, or fields are missing', async () => {
    expect((await lessonProblems([lint], ctx({ changedFiles: ['tests/x.test.ts'] })))[0]).toMatch(/must add or change a rule in eslint.config.js/);
    expect((await lessonProblems([{ ...lint, rule: undefined }], ctx()))[0]).toMatch(/needs rule, filePath, badCode and goodCode/);
  });

  it('requires an entry for every fixed finding, but not for a disputed one', async () => {
    expect((await lessonProblems([], ctx()))[0]).toMatch(/finding f1 .* has no lesson/);
    expect(await lessonProblems([], ctx({ disputed: ['f1'] }))).toEqual([]);
  });

  it('test, type and runtime lessons must name a file this round changed', async () => {
    const t: Lesson = { finding: 'f1', layer: 'test', check: 'tests/x.test.ts' };
    expect(await lessonProblems([t], ctx())).toEqual([]);
    expect((await lessonProblems([{ ...t, check: 'tests/other.test.ts' }], ctx()))[0]).toMatch(/needs check to name a file this round changed/);
    expect((await lessonProblems([{ ...t, check: undefined }], ctx()))[0]).toMatch(/missing/);
  });

  it('none and review-rule need a real reason; unknown layers are refused', async () => {
    expect((await lessonProblems([{ finding: 'f1', layer: 'none' }], ctx()))[0]).toMatch(/needs a reason/);
    expect((await lessonProblems([{ finding: 'f1', layer: 'none', reason: 'short' }], ctx()))[0]).toMatch(/needs a reason/);
    expect(await lessonProblems([{ finding: 'f1', layer: 'review-rule', reason: 'a judgement about wording that no syntax shows' }], ctx())).toEqual([]);
    expect((await lessonProblems([{ finding: 'f1', layer: 'magic' as never }], ctx()))[0]).toMatch(/layer must be one of/);
  });

  it('reports a missing, malformed or non-array lessons file', () => {
    expect(parseLessons(null)).toEqual({ lessons: [], problems: [] });
    expect(parseLessons('{').problems[0]).toMatch(/not valid JSON/);
    expect(parseLessons('{}').problems[0]).toMatch(/must be a JSON array/);
  });

  it('writes one markdown row per lesson', () => {
    const rows = lessonRows([lint, { finding: 'f2', layer: 'test', check: 'tests/a.test.ts' }], 12, new Map([['f1', 'clock | read'], ['f2', 'second']]));
    expect(rows).toBe('| #12 | clock \\| read | lint: `no-restricted-properties` in eslint.config.js |\n| #12 | second | test: `tests/a.test.ts` |');
  });

  it('a lint lesson cannot name a rule that already fired before this round', async () => {
    const p = await lessonProblems([lint], ctx({ lintBefore: probe }));
    expect(p).toEqual(['lesson for f1: rule no-restricted-properties already fired on badCode before this round; a lint lesson must add or extend a rule, not name an old one']);
  });

  it('a parse error is not a lint rule', async () => {
    const broken = { ...lint, rule: 'parse-error', badCode: 'export const = ;\n' };
    expect((await lessonProblems([broken], ctx()))[0]).toMatch(/must parse; a syntax error is not a lint rule/);
    expect((await lessonProblems([{ ...lint, badCode: 'export const = ;\n' }], ctx()))[0]).toMatch(/must parse/);
  });

  it('the lint config may only grow', async () => {
    expect(await lessonProblems([lint], ctx({ lintConfigRemovedLines: 2 }))).toEqual(['eslint.config.js: this round removed 2 line(s); lint changes may only add rules, never weaken or narrow existing ones']);
  });

  it('a dispute names a finding only by starting a line with its id', () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    expect(disputedIds(`${a}: this is wrong, unlike ${b} which is real\n- \`${b}\` - also wrong`)).toEqual([a, b]);
    expect(disputedIds(`The agent compared with ${a} but disputes nothing.`)).toEqual([]);
    expect(disputedIds(null)).toEqual([]);
  });

  it('malformed entries become problems instead of throwing', async () => {
    for (const text of ['[null]', '[1]', '[[]]', '[{}]', '[{"finding":"f1","layer":3}]']) {
      const r = parseLessons(text);
      expect(r.lessons, text).toEqual([]);
      expect(r.problems.length, text).toBe(1);
    }
    expect(parseLessons('[null, {"finding":"f1","layer":"none","reason":"x"}]').lessons).toHaveLength(1);
  });

  it('the runner-owned lessons log is exempt from the area check and no area lists it', () => {
    expect(withoutRunnerFiles(['factory/lessons.md', 'tests/a.test.ts'])).toEqual(['tests/a.test.ts']);
    const cfg = JSON.parse(readFileSync('factory/config.json', 'utf8')) as { areas: Record<string, { paths: string[] }> };
    for (const [name, area] of Object.entries(cfg.areas)) {
      expect(area.paths, `area ${name}`).not.toContain('factory/lessons.md');
      expect(outside(['eslint.config.js'], area.paths), `area ${name}`).toEqual([]);
    }
  });
});
