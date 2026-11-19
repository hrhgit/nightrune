// A fixed review finding only counts as a lesson when the facts back it: a lint rule must fire on its bad code
// and stay quiet on its good code, and other layers must name a file the round changed.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { lessonProblems, lessonRows, parseLessons, type Lesson, type LessonContext } from '../factory/lessons.ts';

const eslint = new ESLint();
const ctx = (over: Partial<LessonContext> = {}): LessonContext => ({
  required: [{ id: 'f1', title: 'clock read in engine' }],
  disputed: null,
  changedFiles: ['eslint.config.js', 'tests/x.test.ts'],
  lint: async (code, filePath) => ((await eslint.lintText(code, { filePath }))[0]?.messages ?? []).map((m) => m.ruleId ?? 'parse-error'),
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
    expect(await lessonProblems([], ctx({ disputed: 'f1: the code is fine because ...' }))).toEqual([]);
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
});
