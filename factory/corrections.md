# Corrections log

One row per time a human corrected the coding agent. Each row says which check the correction became, or why it could not become one.

| Date | Ticket / PR | What was corrected | Became check (layer: file) | If not a check, why |
|---|---|---|---|---|
| 2026-11-18 | https://github.com/hrhgit/nightrune/issues/18 | Echo re-fired the previous card, so after Whetstone it always fizzled and a second Echo did nothing; the author ruled it copies the previous card in its own slot, and asked that such rulings be kept as the rules grow | test: `tests/rule-ids.test.ts` (Rulings table tied to done requirements), `tests/copy.test.ts` (R-13.3 to R-13.6), `tests/oracle.ts` rewritten from the new R-13 | |
| 2026-11-18 | https://github.com/hrhgit/nightrune/pull/17 | Rules were checked per rule, not per literal requirement; the author asked that each card's text, and every combination, be checked against what the rules allow | test: `tests/rule-ids.test.ts` (every live requirement named by an `it()`), `tests/card-text.test.ts` (each card's own text), `tests/oracle.test.ts` (independent reading of R-07 to R-14) | |

| 2026-11-19 | https://github.com/hrhgit/nightrune/pull/27 | First factory run (issue #21): in the fix round the agent fixed one Qodo finding and disputed the other; the runner stopped on the dispute before checking and committing, so the fix was left in the worktree and never reached the PR. Found by reading the run record and the worktree | test: `tests/factory-verdict.test.ts` (`afterFixRound`: a dispute with changes is `commit-then-stop`, so the kept fixes are checked, committed and reviewed before a person decides the dispute) | |
