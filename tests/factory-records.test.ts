// The committed run records are the only source of factory statistics, and the repo is public.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withoutHome } from '../factory/record.ts';
import { RUNS_DIR, readRuns, stats, type RunRecord } from '../factory/stats.ts';

const files = readdirSync(RUNS_DIR).filter((f) => f.endsWith('.json'));

describe('factory run records', () => {
  it('are named <issue>-<timestamp>.json and hold a verdict computed by the runner', () => {
    for (const f of files) {
      const r = JSON.parse(readFileSync(join(RUNS_DIR, f), 'utf8')) as Record<string, unknown>;
      expect(f.startsWith(`${String(r.issue)}-`)).toBe(true);
      expect(['READY', 'NEEDS_FIX', 'NEEDS_HUMAN', 'NOT_DONE']).toContain(r.verdict);
      expect(r).toHaveProperty('facts');
      expect(r).toHaveProperty('events');
    }
  });

  it('contain no home folder path or e-mail address', () => {
    for (const f of files) {
      const text = readFileSync(join(RUNS_DIR, f), 'utf8');
      expect(text).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\\\Users/);
      expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    }
  });

  it('statistics count every record', () => {
    expect(stats(readRuns()).runs).toBe(files.length);
  });

  it('the runner removes the home folder from everything it writes, wherever it appears', () => {
    const text = JSON.stringify({ question: 'see /Users/me/.nightrune-factory/issue-9/a.ts', reasons: ['/Users/me/x and /Users/me/y'] });
    expect(withoutHome(text, '/Users/me')).not.toContain('/Users/me');
    expect(withoutHome(text, '/Users/me')).toContain('~/.nightrune-factory/issue-9/a.ts');
  });

  it('a run that stopped before opening a PR does not count as one', () => {
    const base = { issue: 1, executor: 'codex', model: 'm', verdict: 'NEEDS_HUMAN', implementAttempts: 0, reviewRounds: 0, startedAt: '2026-11-19T00:00:00Z', finishedAt: '2026-11-19T00:01:00Z', reasons: [] };
    const runs: RunRecord[] = [base, { ...base, pr: null }, { ...base, pr: 'https://github.com/o/r/pull/1' }];
    expect(stats(runs).prsOpened).toBe(1);
  });
});
