// Factory statistics, computed only from the run records in factory/runs/. `npm run factory:stats`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface RunRecord {
  readonly issue: number;
  /** Null or absent when the run stopped before an agent was chosen. */
  readonly executor?: string | null;
  readonly model?: string | null;
  readonly verdict: string;
  /** Absent in a record that stopped before the step that sets it. */
  readonly implementAttempts?: number;
  readonly reviewRounds?: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  /** Absent when the run stopped before opening a PR. */
  readonly pr?: string | null;
  readonly reasons: readonly string[];
}

export const RUNS_DIR = join(import.meta.dirname, 'runs');

export function readRuns(dir = RUNS_DIR): RunRecord[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RunRecord);
}

export function stats(runs: readonly RunRecord[]): Record<string, unknown> {
  const count = (key: (r: RunRecord) => string): Record<string, number> =>
    runs.reduce<Record<string, number>>((a, r) => ({ ...a, [key(r)]: (a[key(r)] ?? 0) + 1 }), {});
  const minutes = runs.map((r) => (Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 60000);
  return {
    runs: runs.length,
    byVerdict: count((r) => r.verdict),
    byExecutor: count((r) => (r.executor == null ? 'no agent' : `${r.executor} ${r.model ?? ''}`.trim())),
    prsOpened: runs.filter((r) => typeof r.pr === 'string').length,
    implementAttempts: runs.reduce((a, r) => a + (r.implementAttempts ?? 0), 0),
    reviewRounds: runs.reduce((a, r) => a + (r.reviewRounds ?? 0), 0),
    minutesPerRun: minutes.map((m) => Math.round(m * 10) / 10),
    perRun: runs.map((r) => ({ issue: r.issue, executor: r.executor, verdict: r.verdict, implementAttempts: r.implementAttempts ?? 0, reviewRounds: r.reviewRounds ?? 0 })),
  };
}

if (process.argv[1] === import.meta.filename) console.log(JSON.stringify(stats(readRuns()), null, 2));
