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
- `web/scene.html` – the scene preview page; `scripts/scenes.ts` screenshots it headless (see below).
- `tests/` – rule tests (each names its rule id from [RULES.md](RULES.md)), seed and invariant tests over 200 seeded games, and tests that prove the lint guardrails fire.

Cards: Slash (attack), Parry (blocks the attack in its own slot), Whetstone (gives the next card +1 for the rest of the battle) and Echo (fires the previous card again, in Echo's slot, at most once per card per round). The starter deck is 5 Slash + 3 Parry + 1 Whetstone + 1 Echo; Slash stands in for Scout until it exists.

Not built yet: the other cards, merging, three-battle runs. See [RULES.md](RULES.md) for the status of every rule.

## Run it

Requires Node.js 20.19+ or 22.12+ (the Vite requirement).

```bash
npm ci
npm run dev           # the web page at http://localhost:5173
npm run play          # one battle with the greedy bot, seed 1
npm run play -- --seed 7 --json
npm run play -- --seed 7 --record seed7.json   # save the battle
npm run replay -- seed7.json                   # replay it and check the final-state hash
npm run check         # typecheck + lint + tests + build (same as CI)
```

### Check how it looks

`web/scene.html` (also at <https://hrhgit.github.io/nightrune/scene.html>) draws hand-built board moments from `web/scenes.ts` with the game's own drawing code, frozen in time: a bolt in flight, a Parry block, a partial block, both sides hitting, full lines, low HP. Add a scene there instead of playing up to the moment you want to see.

```bash
npm run scenes                    # every scene at desktop, phone and phone + reduced motion
npm run scenes -- --only parry-block
```

It saves `out/scenes/<viewport>/<scene>.png` and `out/scenes/report.json` (smallest on-screen text, clipped and overlapping text, console errors). It uses your installed Google Chrome; set `CHROME_PATH` to use another Chromium build. It fails only if a scene does not render or the page logs an error.

## Assistance

Code and docs are written by Claude Code (Anthropic) under the author's direction; reviews are by Qodo. Third-party dev dependencies: TypeScript, Vite, Vitest, ESLint, typescript-eslint, tsx, playwright-core (MIT or Apache-2.0). Fonts: Alegreya and Alegreya Sans via Fontsource (SIL Open Font License 1.1), bundled with the page.

## License

MIT
