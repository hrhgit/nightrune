// factory/rule-coverage.md as a checked fact, not a hand count. Every row of the "Product rules"
// table is classified by how its "Enforced by" cell starts; a row that claims a type, lint or test
// check must name a proof that the check fails when the rule is broken; and the Totals section must
// equal what the table says.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

export type Kind = 'checked' | 'partial' | 'measured' | 'text';

export interface CoverageRow {
  readonly rule: string;
  readonly kind: Kind | null;
  readonly proof: string;
}

/** How a row is enforced, read from the start of its "Enforced by" cell. */
export function kindOf(enforcedBy: string): Kind | null {
  const cell = enforcedBy.trim().toLowerCase();
  if (cell.startsWith('partial')) return 'partial';
  if (cell.startsWith('measured')) return 'measured';
  if (cell.startsWith('text only')) return 'text';
  if (/^(type|lint|test):/.test(cell)) return 'checked';
  return null;
}

/** Rows of the first table under "## Product rules": `| rule | enforced by | proof | gaps |`. */
export function coverageRows(markdown: string): CoverageRow[] {
  const section = markdown.split(/^## /m).find((s) => s.startsWith('Product rules')) ?? '';
  return section
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .slice(2) // header and separator
    .map((l) => {
      const cells = l.split('|').slice(1, -1).map((c) => c.trim());
      return { rule: cells[0] ?? '', kind: kindOf(cells[1] ?? ''), proof: cells[2] ?? '' };
    });
}

/** The "- Label: N" lines of the Totals section. */
export function statedTotals(markdown: string): Record<string, number> {
  const section = markdown.split(/^## /m).find((s) => s.startsWith('Totals')) ?? '';
  const out: Record<string, number> = {};
  for (const m of section.matchAll(/^- ([^:]+): (\d+)\s*$/gm)) out[m[1] ?? ''] = Number(m[2]);
  return out;
}

export const LABELS: Record<Kind, string> = {
  checked: 'Checked by a type, lint or test with proof',
  partial: 'Partial',
  measured: 'Measured, not checked',
  text: 'Text only',
};

export function countedTotals(rows: readonly CoverageRow[]): Record<string, number> {
  const out: Record<string, number> = { Rules: rows.length };
  for (const kind of Object.keys(LABELS) as Kind[]) out[LABELS[kind]] = rows.filter((r) => r.kind === kind).length;
  return out;
}

/** A row that claims a check but has no proof it fails when broken. */
export function unprovenChecks(rows: readonly CoverageRow[]): string[] {
  return rows.filter((r) => r.kind === 'checked' && /^(none|—|-)?$/i.test(r.proof)).map((r) => r.rule);
}

const doc = readFileSync(join(import.meta.dirname, '..', 'factory', 'rule-coverage.md'), 'utf8');

describe('factory/rule-coverage.md matches its own table', () => {
  const rows = coverageRows(doc);

  it('every row says how it is enforced', () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.kind === null).map((r) => r.rule)).toEqual([]);
  });

  it('every checked row names a proof that the check fails when broken', () => {
    expect(unprovenChecks(rows)).toEqual([]);
  });

  it('the Totals section equals the counts of the table', () => {
    expect(statedTotals(doc)).toEqual(countedTotals(rows));
  });

  it('catches a stale total and an unproven check', () => {
    const table = [
      '## Product rules',
      '| Rule | Enforced by | Proof | Gaps |',
      '|---|---|---|---|',
      '| A | test: x | mutation made it fail | — |',
      '| B | lint: y | none | — |',
      '| C | text only | none | — |',
      '## Totals',
      '- Rules: 3',
      `- ${LABELS.checked}: 1`,
    ].join('\n');
    const r = coverageRows(table);
    expect(unprovenChecks(r)).toEqual(['B']);
    expect(statedTotals(table)).not.toEqual(countedTotals(r));
  });
});
