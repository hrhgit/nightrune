# Factory run records

One JSON file per factory run: `<issue>-<UTC timestamp>.json`, written by `factory/run.ts`, never by hand. Each record holds the ticket, the area and agent, the base commit, the PR, every step with its time, the facts the verdict was computed from, and the verdict with its reasons. All factory statistics are computed from these files only.

Full command output of each run is kept locally in `.factory/logs/` (not committed).

`npm run factory:stats` prints the statistics (`factory/stats.ts`). `tests/factory-records.test.ts` checks that every record has a verdict and holds no home folder path or e-mail address.

The first two records (issues 21 and 25) were written before the runner stopped recording its absolute worktree folder. Before they were committed, the home folder in that one field was replaced with `~` by a `sed` command. Nothing else in them was changed.
