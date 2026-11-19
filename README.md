# Nightrune

A single-player fantasy card battler. You set runestones on a 4-position battle line; every round the turn order sweeps positions 1→4 and both lines strike head to head: your attack minus the enemy's block at the same position, both sides hit at once.

This repo is also an entry for the [Qodo Software Factory Hackathon](https://hackathon.qodo.ai/): after this scaffold, each game feature is a GitHub issue that goes through a factory of coding agent → checks → Qodo review → pull request.

**Play it:** <https://hrhgit.github.io/nightrune/> (add `?seed=123` to replay a seed).

## Status

One battle against the Training Dummy is playable in the browser and from the command line.

- `engine/` – pure battle engine: `step(state, action) → { state, events }`. Drawing, energy, placement, head-to-head slot resolution, battle end, round limit, and a seeded generator kept in the state. Placement legality is exposed as `checkPlace` / `legalPlacements`.
- `data/` – the card, enemy, deck and rule-constant tables. All numbers live here.
- `web/` – the page: the battlefield is drawn on a Canvas ("runestone night camp"), controls and the battle log are HTML. It only shows engine state and sends actions.
- `present/` – event and card text shared by the page and the CLI.
- `bots/greedy.ts` – a simple bot used by the CLI and by invariant tests.
- `tests/` – rule tests (each names its rule id from [RULES.md](RULES.md)), seed and invariant tests over 200 seeded games, and tests that prove the lint guardrails fire.

Not built yet: Parry and the other cards (the starter deck is all Slash stand-ins for now), merging, three-battle runs, a replay command. See [RULES.md](RULES.md) for the status of every rule.

## Run it

Requires Node.js 20.19+ or 22.12+ (the Vite requirement).

```bash
npm ci
npm run dev           # the web page at http://localhost:5173
npm run play          # one battle with the greedy bot, seed 1
npm run play -- --seed 7 --json
npm run check         # typecheck + lint + tests + build (same as CI)
```

## Assistance

Code and docs are written by Claude Code (Anthropic) under the author's direction; reviews are by Qodo. Third-party dev dependencies: TypeScript, Vite, Vitest, ESLint, typescript-eslint, tsx (MIT or Apache-2.0). Fonts: Alegreya and Alegreya Sans via Fontsource (SIL Open Font License 1.1), bundled with the page.

## License

MIT
