# Nightrune

A single-player fantasy card battler. You set runestones on a 4-position battle line; every round the turn order sweeps positions 1→4 and both lines strike head to head: your attack minus the enemy's block at the same position, both sides hit at once.

This repo is also an entry for the [Qodo Software Factory Hackathon](https://hackathon.qodo.ai/): after this scaffold, each game feature is a GitHub issue that goes through a factory of coding agent → checks → Qodo review → pull request.

## Status

Scaffold only. What exists today:

- `engine/` – pure battle engine: `step(state, action) → { state, events }`. Head-to-head slot resolution, battle end, round limit.
- `data/` – the card, enemy and rule-constant tables. All numbers live here.
- `cli/play.ts` – plays one fixed battle and prints every event.
- `tests/` – rule tests (each names its rule id from [RULES.md](RULES.md)) and a test that proves the engine purity lint fires.

Not built yet: drawing, energy, placement, defense, seeds, the web UI. See [RULES.md](RULES.md) for the status of every rule.

## Run it

Requires Node.js 20+.

```bash
npm ci
npm run play          # one battle, human-readable event log
npm run play -- --json
npm run check         # typecheck + lint + tests (same as CI)
```

## Assistance

Code and docs are written by Claude Code (Anthropic) under the author's direction; reviews are by Qodo. Third-party dev dependencies: TypeScript, Vitest, ESLint, typescript-eslint, tsx (all MIT or Apache-2.0).

## License

MIT
