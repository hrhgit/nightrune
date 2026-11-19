// "Every rule has an id; changing a rule changes RULES.md and its tests together" as a check.
// Every rule or check in RULES.md whose status is done or partial must be named in at least one
// describe()/it() title under tests/, and every id a test title names must exist in RULES.md.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ID = /\b[RINA]-\d+\b/g;

export interface RuleRow {
  readonly id: string;
  readonly status: string;
}

/** Rows of the RULES.md tables: `| R-05 | text | status |`. */
export function ruleRows(markdown: string): RuleRow[] {
  return markdown.split('\n').flatMap((line) => {
    const m = /^\|\s*([RINA]-\d+)\s*\|.*\|\s*([^|]*?)\s*\|\s*$/.exec(line);
    return m === null ? [] : [{ id: m[1] ?? '', status: m[2] ?? '' }];
  });
}

/**
 * Ids named in the titles of real describe()/it()/test() calls, found by parsing the file.
 * Comments and strings that merely look like a call (fixtures) do not count.
 */
export function idsInTitles(source: string): Set<string> {
  const ids = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      let callee: ts.Expression = node.expression;
      // describe.each(...)(...) and it.skip(...) style callees: walk back to the base name.
      while (ts.isPropertyAccessExpression(callee) || ts.isCallExpression(callee)) {
        callee = ts.isPropertyAccessExpression(callee) ? callee.expression : callee.expression;
      }
      const title = node.arguments[0];
      if (ts.isIdentifier(callee) && ['describe', 'it', 'test'].includes(callee.text) && title !== undefined && ts.isStringLiteralLike(title)) {
        for (const id of title.text.match(ID) ?? []) ids.add(id);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('t.ts', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS));
  return ids;
}

/** Ids marked done or partial whose rule has no test, and ids tests name that RULES.md lacks. */
export function ruleIdProblems(rows: readonly RuleRow[], tested: ReadonlySet<string>): { untested: string[]; unknown: string[] } {
  const known = new Set(rows.map((r) => r.id));
  const live = rows.filter((r) => /^(done|partial)\b/.test(r.status)).map((r) => r.id);
  return {
    untested: live.filter((id) => !tested.has(id)),
    unknown: [...tested].filter((id) => !known.has(id)).sort(),
  };
}

const root = join(import.meta.dirname, '..');

describe('every live rule in RULES.md is named by a test, and tests name only real rules', () => {
  const rows = ruleRows(readFileSync(join(root, 'RULES.md'), 'utf8'));
  const tested = new Set<string>();
  for (const file of readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.ts'))) {
    for (const id of idsInTitles(readFileSync(join(root, 'tests', file), 'utf8'))) tested.add(id);
  }

  it('reads the rule table', () => {
    expect(rows.length).toBeGreaterThanOrEqual(17);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('has no untested live rule and no unknown id', () => {
    expect(ruleIdProblems(rows, tested)).toEqual({ untested: [], unknown: [] });
  });
});

describe('the rule-id check itself', () => {
  it('flags a done rule without a test, and a test naming a missing rule', () => {
    const rows = ruleRows('| R-01 | a | done |\n| R-02 | b | planned [T1] |\n| R-03 | c | partial: x |');
    expect(ruleIdProblems(rows, new Set(['R-03', 'R-99']))).toEqual({ untested: ['R-01'], unknown: ['R-99'] });
  });

  it('ignores ids in comments and in strings that only look like a test', () => {
    const src = "// R-07\n/* it('R-06 z') */\nconst f = \"describe('R-05 fixture')\";\ndescribe('R-08 x', () => { it('I-1 y', () => {}) })";
    expect([...idsInTitles(src)]).toEqual(['R-08', 'I-1']);
  });

  it('reads ids with three digits', () => {
    expect(ruleRows('| R-100 | a | done |')).toEqual([{ id: 'R-100', status: 'done' }]);
    expect([...idsInTitles("it('R-100 x', () => {})")]).toEqual(['R-100']);
  });
});
