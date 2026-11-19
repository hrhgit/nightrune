// Proves the engine lint guardrails actually fire (a guardrail that never fails is not a check).
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse-error');
}

describe('engine purity lint (R-16: all randomness comes from the seed)', () => {
  const cases = [
    ['Math.random', 'export const x = Math.random();\n'],
    ['Date.now', 'export const x = Date.now();\n'],
    ['new Date', 'export const x = new Date();\n'],
    ['performance.now', 'export const x = performance.now();\n'],
  ] as const;

  for (const [name, code] of cases) {
    it(`rejects ${name} inside engine/`, async () => {
      expect((await ruleIds(code, 'engine/__fixture__.ts')).length).toBeGreaterThan(0);
    });
    it(`allows ${name} outside engine/ (cli may use the clock)`, async () => {
      expect(await ruleIds(code, 'cli/__fixture__.ts')).toEqual([]);
    });
  }

  it('rejects importing node built-ins inside engine/', async () => {
    const ids = await ruleIds("import { readFileSync } from 'node:fs';\nexport const f = readFileSync;\n", 'engine/__fixture__.ts');
    expect(ids).toContain('no-restricted-imports');
  });
});

describe('UI and text code reach rules only through the engine public API', () => {
  for (const dir of ['web', 'present', 'cli', 'bots']) {
    it(`rejects reading the rule table from ${dir}/`, async () => {
      const ids = await ruleIds("import { RULES } from '../data/rules.ts';\nexport const n = RULES.handSize;\n", `${dir}/__fixture__.ts`);
      expect(ids).toContain('no-restricted-imports');
    });
    it(`rejects importing engine internals from ${dir}/`, async () => {
      const ids = await ruleIds("import { shuffle } from '../engine/rng.ts';\nexport const f = shuffle;\n", `${dir}/__fixture__.ts`);
      expect(ids).toContain('no-restricted-imports');
    });
    it(`allows the engine public API from ${dir}/`, async () => {
      const ids = await ruleIds("import { step } from '../engine/index.ts';\nexport const f = step;\n", `${dir}/__fixture__.ts`);
      expect(ids).toEqual([]);
    });
  }

  it('rejects Math.random in web/ (visuals come from the seed)', async () => {
    expect(await ruleIds('export const x = Math.random();\n', 'web/__fixture__.ts')).toContain('no-restricted-properties');
  });
});
