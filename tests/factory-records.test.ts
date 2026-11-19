// The committed run records are the only source of factory statistics, and the repo is public.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RUNS_DIR, readRuns, stats } from '../factory/stats.ts';

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
});
