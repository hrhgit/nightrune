# AGENTS.md

Instructions for coding agents and reviewers working on Nightrune.

## What this is

Nightrune is a single-player card battler that runs in the browser. You place runestones on a 4-slot line; each round a cursor sweeps slots 1→4 and both lines strike head to head (your attack minus the enemy's block in the same slot). The game rules, each with an id, are in [RULES.md](RULES.md).

The repository is also a software factory: each feature is a GitHub issue with acceptance criteria, built on its own branch, checked by commands, reviewed by Qodo, and merged by a person.

## Layout

- `engine/` – the pure rules engine: `step(state, action) → { state, events }`. No clock, no I/O, no UI.
- `data/` – card, enemy, deck and rule-constant tables. Every number lives here.
- `web/` – the page (Canvas board + HTML controls). Shows engine state, sends actions.
- `present/` – event and card text shared by the page and the CLI.
- `cli/`, `bots/` – play a battle from the terminal; a greedy bot used by tests.
- `tests/` – one `describe()` per rule, named by its id; guardrail tests that prove the lint rules fire.
- `factory/` – run records, rule coverage (its totals are checked by `tests/coverage.test.ts`), and the corrections log.

## Setup and verification

Node.js 20.19+ or 22.12+.

```bash
npm ci
npm run check         # typecheck (root and web/), lint, tests, build — the same as CI
npm run play -- --seed 7          # one battle in the terminal
npm run dev                       # the page at http://localhost:5173/?seed=7
npm run scenes                    # screenshots of fixed board moments + text-size report
```

A change is not done until `npm run check` passes. For anything that changes how the board looks, also run `npm run scenes` and look at the screenshots.

## Rules

Each rule says where it applies, why it exists, and what enforces it. A rule enforced by a check fails the build when broken; agents should not rely on reading this file to keep it.

### 1. The seed decides everything

All randomness comes from the battle seed: shuffles, rewards, and also the board's visual noise (stars, stone outlines, spark directions). The same seed with the same actions gives the same state, the same events and the same picture.

- **Applies to:** `engine/` (game randomness) and `web/` (visual randomness). Use the seeded generator in the state, or the seeded helpers in `web/board.ts`; never `Math.random`, `Date.now`, `new Date` or `performance.now` in the engine.
- **Why:** a player can share a seed and someone else plays the same battle; a bug report is a seed plus actions; a screenshot test only means something if the same scene draws the same pixels.
- **Enforced by:** lint (`eslint.config.js`: `engine/` bans `Math.random` and clock reads, `web/` bans `Math.random`), proved by `tests/guardrails.test.ts`; `tests/seed.test.ts` replays recorded actions on 5 seeds and pins the generator's reference output. The picture half was checked by hand, not in CI: two `npm run scenes` runs gave 24 of 24 byte-identical screenshots ([evidence/day02/scenes-twice.md](evidence/day02/scenes-twice.md)).

### 2. Rules are computed only in the engine

The page, the CLI, the text layer and the bots show engine state and send actions. They never decide what is legal or compute damage, block or HP.

- **Applies to:** `web/`, `present/`, `cli/`, `bots/`.
- **Why:** two places computing the same rule drift apart, and then the screen shows a battle the engine did not play.
- **Enforced by:** lint: these folders may import only `engine/index.ts`, never `data/*` or engine internals (proved by `tests/guardrails.test.ts`). Legality comes from `checkPlace` / `legalPlacements`; HP shown during animation comes from event payloads. Arithmetic on values the engine already returned is not caught by lint; reviewers should flag it.

### 3. Numbers live in the tables

Card values, costs, HP, hand size, energy and round limits are defined once in `data/`. Engine and UI code read them; they do not repeat them.

- **Applies to:** everything outside `data/`. Drawing sizes and animation timings in `web/` are layout, not game numbers.
- **Why:** balance changes should be one-line diffs in one file, and a simulation run should be able to say exactly which table it used.
- **Enforced by:** partly. The tables are typed with `satisfies`, and the UI cannot import them (rule 2). There is no lint against numeric literals in engine effect code yet, and no runtime table validation (ticket T14).

### 4. A rule, its id and its test change together

Every game rule and check has an id in [RULES.md](RULES.md) (R-01…, I-1…, N-1…, A-1…). A rule marked `done` or `partial` there must be named in at least one `describe()`/`it()` title under `tests/`, and tests may only name ids that exist. Change a rule's text, its status and its test in the same PR.

- **Applies to:** `RULES.md`, `tests/`, and any engine change that alters behaviour.
- **Why:** the rule book is what players and reviewers read; a rule with no test is a claim.
- **Enforced by:** test: `tests/rule-ids.test.ts` reads the RULES.md tables and the test titles, and fails on a live rule with no test or a test naming an unknown id. It cannot tell whether the test actually checks what the rule says; that is left to review.

### 5. Report results, not adjectives

Never call the game `balanced`, `fun` or `bug-free`. Report what was run: how many games, which seeds, which bot, which invariants passed. If a simulation was not run, say it was not run.

- **Applies to:** `README.md`, `RULES.md`, PR descriptions, run records and posts about the project.
- **Why:** a greedy bot on 200 seeds says something specific; an adjective says nothing a reader can check, and in this project evidence has to be real.
- **Enforced by:** test: `tests/claims.test.ts` scans tracked Markdown and local post drafts in `submissions/` for those words (outside code spans). PR descriptions are not scanned yet.

## Left to judgement

These cannot be checked by a command yet, so reviewers carry them:

- Do not copy existing games' cards, names, text or art.
- Every ticket's acceptance criteria are tested, including at least one edge or failure case; where two mechanics combine, a test names the combination.

## How work flows

One GitHub issue per change, with acceptance criteria. One branch and one PR per issue; the PR links the issue and repeats its acceptance criteria. Qodo reviews the PR; a review only counts if it covers the PR's head commit. A person merges. When a person corrects an agent, the correction goes in `factory/corrections.md` with the check it became.

### The factory runner

`npm run factory` (also run every 10 minutes by a local launchd job: `factory/install-poller.sh`, removed with `--remove`; it polls from its own worktree at `origin/main`) takes the oldest open issue labelled `ready-for-agent`, and needs exactly one `area:` label and an "Acceptance criteria" list. It gives the issue to that area's coding agent in its own worktree (`area:engine` → Codex, `area:web` → Claude Code; paths and models in `factory/config.json`), fails the run if a file outside the area changes, runs `npm run check` (up to 3 attempts), opens a PR, waits for Qodo's review of the PR head, and sends open action-required and recommended findings back to the agent (up to 3 rounds). An agent that finds a criterion ambiguous writes `.factory-question.md` and stops instead of guessing. The verdict (`READY`, `NEEDS_FIX`, `NEEDS_HUMAN`, `NOT_DONE`) is computed by `factory/verdict.ts` from those facts, written to `factory/runs/`, commented on the issue, and shown as a label (`agent-done` or `agent-needs-help`). The runner never merges.
