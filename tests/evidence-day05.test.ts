// The numbers AGENTS.md rule 6 gives as its evidence are computed by evidence/day05/count.mjs from
// evidence/day05/findings.json. This test runs the script, compares its output with the committed
// copy, and checks that the rule states the same counts.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

describe('Day 5 evidence for AGENTS.md rule 6', () => {
  const output = execFileSync('node', ['evidence/day05/count.mjs'], { cwd: root, encoding: 'utf8' });

  it('the committed output is what the script prints', () => {
    expect(output).toBe(readFileSync(join(root, 'evidence/day05/count-output.txt'), 'utf8'));
  });

  it('rule 6 states the counts the script printed', () => {
    const all = /all findings: (\d+) in \d+ PRs/.exec(output);
    const cls = /refuse-input: (\d+) findings in (\d+) PRs/.exec(output);
    expect(all && cls).toBeTruthy();
    const rule = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(rule).toContain(`${cls?.[1]} of the ${all?.[1]} findings`);
    expect(rule).toContain(`across ${cls?.[2]} PRs`);
  });
});
