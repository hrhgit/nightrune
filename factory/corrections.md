# Corrections log

One row per time a human corrected the coding agent. Each row says which check the correction became, or why it could not become one.

| Date | Ticket / PR | What was corrected | Became check (layer: file) | If not a check, why |
|---|---|---|---|---|
| 2026-11-18 | https://github.com/hrhgit/nightrune/pull/17 | Rules were checked per rule, not per literal requirement; the author asked that each card's text, and every combination, be checked against what the rules allow | test: `tests/rule-ids.test.ts` (every live requirement named by an `it()`), `tests/card-text.test.ts` (each card's own text), `tests/oracle.test.ts` (independent reading of R-07 to R-14) | |

