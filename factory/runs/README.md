# Factory run records

One JSON file per factory run: `<issue>-<UTC timestamp>.json`, written by `factory/run.ts`, never by hand. Each record holds the ticket, the area and agent, the base commit, the PR, every step with its time, the facts the verdict was computed from, and the verdict with its reasons. All factory statistics are computed from these files only.

Full command output of each run is kept locally in `.factory/logs/` (not committed).
