// "Every rule has an id; changing a rule changes RULES.md and its tests together" as a check.
// Every rule or check in RULES.md whose status is done or partial must be named in at least one
// describe()/it() title under tests/, and every id a test title names must exist in RULES.md.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * A rule or check id (R-05), or a requirement id (R-05.2). The whole dotted run is taken, so a
 * malformed id such as R-05.2.1 is read as itself (and reported unknown), never as R-05.2.
 */
const ID = /\b[RINA]-\d+(?:\.\d+)*\b/g;

export interface RuleRow {
  readonly id: string;
  readonly status: string;
}

function rows(markdown: string, id: RegExp): RuleRow[] {
  return markdown.split('\n').flatMap((line) => {
    const m = new RegExp(`^\\|\\s*(${id.source})\\s*\\|.*\\|\\s*([^|]*?)\\s*\\|\\s*$`).exec(line);
    return m === null ? [] : [{ id: m[1] ?? '', status: m[2] ?? '' }];
  });
}

/** Rows of the RULES.md rule and check tables: `| R-05 | text | status |`. */
export function ruleRows(markdown: string): RuleRow[] {
  return rows(markdown, /[RINA]-\d+/);
}

/** Rows of the RULES.md requirements table: `| R-05.2 | text | status |`. */
export function requirementRows(markdown: string): RuleRow[] {
  return rows(markdown, /R-\d+\.\d+/);
}

const parent = (id: string): string => id.replace(/\.\d+$/, '');
const live = (status: string): boolean => /^(done|partial)\b/.test(status);
const word = (status: string): string => status.split(/[:,.\s]/)[0] ?? '';
/** The statuses a requirement may have; anything else is a typo and is reported. */
const REQUIREMENT_STATUSES = new Set(['done', 'partial', 'planned', 'differs']);
/** Rules and checks may also be `measured`: reported by a script, not enforced (A-3). */
const RULE_STATUSES = new Set(['done', 'partial', 'planned', 'measured']);

/** Modifiers under which Vitest does not run the test, or runs it only conditionally. */
const NOT_RUN = new Set(['skip', 'todo', 'skipIf', 'runIf']);

/**
 * Ids named in the titles of describe()/it()/test() calls that Vitest runs, found by parsing the
 * file. Comments, fixture strings that only look like a call, `.skip`/`.todo` tests and anything
 * inside a skipped describe do not count.
 */
export function idsInTitles(source: string, only: 'describe-and-it' | 'it' = 'describe-and-it'): Set<string> {
  const ids = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      // Walk back from e.g. describe.each([...])('title') or it.skip('title') to the base name.
      const modifiers: string[] = [];
      let callee: ts.Expression = node.expression;
      while (ts.isPropertyAccessExpression(callee) || ts.isCallExpression(callee)) {
        if (ts.isPropertyAccessExpression(callee)) {
          modifiers.push(callee.name.text);
          callee = callee.expression;
        } else callee = callee.expression;
      }
      if (ts.isIdentifier(callee) && ['describe', 'it', 'test'].includes(callee.text)) {
        if (modifiers.some((m) => NOT_RUN.has(m))) return; // nothing under a skipped call counts
        const title = node.arguments[0];
        const counts = only === 'describe-and-it' || callee.text !== 'describe';
        if (counts && title !== undefined && ts.isStringLiteralLike(title)) {
          for (const id of title.text.match(ID) ?? []) ids.add(id);
        }
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
  const named = new Set([...tested].map(parent));
  return {
    untested: rows.filter((r) => live(r.status)).map((r) => r.id).filter((id) => !named.has(id)),
    unknown: [...named].filter((id) => !known.has(id)).sort(),
  };
}

/**
 * Problems between the rule table, the requirements table and the it() titles:
 * - a requirement or rule whose status is not one of the known words;
 * - a done or partial requirement that no it()/test() title names;
 * - a requirement id that any title (describe() included) names but the table lacks;
 * - a game rule (R-) with no requirement, or a requirement whose rule does not exist;
 * - a rule whose status does not follow from its requirements: done when all are done,
 *   planned when all are planned, partial otherwise.
 */
export function requirementProblems(
  rules: readonly RuleRow[],
  reqs: readonly RuleRow[],
  testedInIt: ReadonlySet<string>,
  namedAnywhere: ReadonlySet<string> = testedInIt,
): string[] {
  const out: string[] = [];
  const reqIds = new Set(reqs.map((r) => r.id));
  for (const r of reqs) if (!REQUIREMENT_STATUSES.has(word(r.status))) out.push(`${r.id} has unknown status "${word(r.status)}"`);
  for (const r of rules) if (!RULE_STATUSES.has(word(r.status))) out.push(`${r.id} has unknown status "${word(r.status)}"`);
  for (const r of reqs) if (live(r.status) && !testedInIt.has(r.id)) out.push(`${r.id} is ${word(r.status)} but no it() title names it`);
  for (const id of [...namedAnywhere].filter((i) => i.includes('.')).sort()) if (!reqIds.has(id)) out.push(`a test names ${id}, which is not a requirement`);
  const ruleIds = new Set(rules.map((r) => r.id));
  for (const r of reqs) if (!ruleIds.has(parent(r.id))) out.push(`${r.id} has no rule ${parent(r.id)}`);
  for (const rule of rules.filter((r) => r.id.startsWith('R-'))) {
    const mine = reqs.filter((r) => parent(r.id) === rule.id).map((r) => word(r.status));
    if (mine.length === 0) {
      out.push(`${rule.id} has no requirements`);
      continue;
    }
    const expected = mine.every((s) => s === 'done') ? 'done' : mine.every((s) => s === 'planned') ? 'planned' : 'partial';
    const actual = word(rule.status);
    if (actual !== expected) out.push(`${rule.id} is ${actual} but its requirements make it ${expected}`);
  }
  return out;
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

describe('every live requirement in RULES.md is named by an it() title, and rule statuses follow from their requirements', () => {
  const markdown = readFileSync(join(root, 'RULES.md'), 'utf8');
  const reqs = requirementRows(markdown);
  const testedInIt = new Set<string>();
  const namedAnywhere = new Set<string>();
  for (const file of readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.ts'))) {
    const source = readFileSync(join(root, 'tests', file), 'utf8');
    for (const id of idsInTitles(source, 'it')) testedInIt.add(id);
    for (const id of idsInTitles(source)) namedAnywhere.add(id);
  }

  it('reads the requirements table', () => {
    expect(reqs.length).toBeGreaterThanOrEqual(17);
    expect(new Set(reqs.map((r) => r.id)).size).toBe(reqs.length);
  });

  it('has no problems', () => {
    expect(requirementProblems(ruleRows(markdown), reqs, testedInIt, namedAnywhere)).toEqual([]);
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

  it('does not count skipped or todo tests, or tests inside a skipped describe', () => {
    const src = "it.skip('R-01 a', () => {}); test.todo('R-02 b'); describe.skip('x', () => { it('R-03 c', () => {}) }); it.only('R-04 d', () => {})";
    expect([...idsInTitles(src)]).toEqual(['R-04']);
  });

  it('requires an it() title for a live requirement, ignores describe() titles, and checks rule status against requirements', () => {
    const rules = ruleRows('| R-01 | a | done |\n| R-02 | b | partial: x |\n| R-03 | c | planned [T1] |');
    const reqs = requirementRows('| R-01.1 | a | done |\n| R-01.2 | b | differs: y |\n| R-02.1 | c | done |\n| R-03.1 | d | planned |\n| R-04.1 | e | done |');
    const src = "describe('R-02.1 group', () => { it('R-01.1 x', () => {}); it('R-04.1 y', () => {}); it('R-09.9 z', () => {}) })";
    expect(requirementProblems(rules, reqs, idsInTitles(src, 'it'))).toEqual([
      'R-02.1 is done but no it() title names it',
      'a test names R-09.9, which is not a requirement',
      'R-04.1 has no rule R-04',
      'R-01 is done but its requirements make it partial',
      'R-02 is partial but its requirements make it done',
    ]);
  });

  it('reports a misspelled status instead of reading it as partial', () => {
    const rules = ruleRows('| R-01 | a | partial: x |\n| R-02 | b | dnoe |');
    const reqs = requirementRows('| R-01.1 | a | done |\n| R-01.2 | b | plaanned [T1] |\n| R-02.1 | c | done |');
    expect(requirementProblems(rules, reqs, new Set(['R-01.1', 'R-02.1']))).toEqual([
      'R-01.2 has unknown status "plaanned"',
      'R-02 has unknown status "dnoe"',
      'R-02 is dnoe but its requirements make it done',
    ]);
  });

  it('reads a malformed dotted id as itself, not as the requirement it starts with', () => {
    expect([...idsInTitles("it('R-01.2.3 x', () => {})")]).toEqual(['R-01.2.3']);
    // A sentence-ending full stop is not part of the id.
    expect([...idsInTitles("it('holds R-01.2.', () => {})")]).toEqual(['R-01.2']);
    const rules = ruleRows('| R-01 | a | done |');
    const reqs = requirementRows('| R-01.2 | a | done |');
    expect(requirementProblems(rules, reqs, idsInTitles("it('R-01.2.3 x', () => {})", 'it'))).toEqual([
      'R-01.2 is done but no it() title names it',
      'a test names R-01.2.3, which is not a requirement',
    ]);
  });

  it('reports an unknown requirement id named only in a describe() title', () => {
    const src = "describe('R-01.9 and I-1.2 group', () => { it('R-01.1 x', () => {}) })";
    const rules = ruleRows('| R-01 | a | done |\n| I-1 | b | done |');
    const reqs = requirementRows('| R-01.1 | a | done |');
    expect(requirementProblems(rules, reqs, idsInTitles(src, 'it'), idsInTitles(src))).toEqual([
      'a test names I-1.2, which is not a requirement',
      'a test names R-01.9, which is not a requirement',
    ]);
  });

  it('reads ids with three digits', () => {
    expect(ruleRows('| R-100 | a | done |')).toEqual([{ id: 'R-100', status: 'done' }]);
    expect([...idsInTitles("it('R-100 x', () => {})")]).toEqual(['R-100']);
  });
});
