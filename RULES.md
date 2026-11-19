# Nightrune rulebook (v0)

Every rule has an id. A change to a rule must change this file **and** the tests that name the rule id in the same pull request.
All numbers below are placeholders; the source of truth for numbers is `data/` (`cards.ts`, `enemies.ts`, `rules.ts`).

Status: **done** = implemented and tested; **partial** = implemented in part (see note); **planned** = not built yet (ticket in brackets).

## Terms

| Term | Meaning |
|---|---|
| Line | The battle line: 4 positions (slots), numbered 1–4. The player has one, the enemy has one. |
| Round | One placement phase followed by one run phase. |
| Placement | The player draws and places cards on the line. |
| Run | Both lines fire automatically, slot by slot, following the turn order cursor. No player input. |
| Fire | A card performs its effect once. |
| Next / previous card | The card in the slot numbered one higher / one lower on the same line. |
| Level | 1–3. Raised by merging. |
| Energy | Points spent to place cards during placement. Refilled every round; not carried over. |
| Cost | Energy needed to place a card, 0–3, defined in the card table. |
| Block | Cancels damage from the opposing card in the same slot only. |
| Seed | A number that fixes every random outcome of a run. |

## Basics

| Id | Rule | Status |
|---|---|---|
| R-01 | Each side has a 4-slot line and HP. Player HP is 30 and does not heal between the three battles of a run. Enemy HP and line come from the enemy table. | partial: single battle only [T11] |
| R-02 | A battle is a sequence of rounds. Each round is placement, then run. | done |

## Placement

| Id | Rule | Status |
|---|---|---|
| R-03 | At the start of placement, draw up to 4 cards in hand. If the draw pile is empty, shuffle the discard pile into it and keep drawing. | done |
| R-04 | At the start of placement, energy is set to 3. Unspent energy from the previous round is lost. | done |
| R-05 | Placing a card costs its energy cost; a card cannot be placed without enough energy. There is no other limit on cards per round. A card can be placed (a) into an empty slot, (b) onto an occupied slot, sending the old card and any cards stacked under it to the discard pile, or (c) by merging (R-15). All three pay the cost. | partial: (a) and (b) done; a same-name placement is refused until merging exists [T07] |
| R-06 | At the end of placement, cards left in hand go to the discard pile. | done |

## Run

| Id | Rule | Status |
|---|---|---|
| R-07 | The cursor walks from slot 1 to slot 4. In each slot, both sides' cards fire at the same time. If only one side has a card there, only that card fires; if both are empty, the slot is skipped. | done |
| R-08 | Head-to-head resolution: within one slot, first total each side's attack and block for that slot. Damage taken by a side = opposing attack in that slot − own block in that slot, minimum 0. Both sides lose HP at the same time. Block applies only to that slot; it does not carry to later slots or rounds. | done |
| R-09 | Cards stay on the line and fire every round until replaced. | done (no replacement yet) |
| R-10 | After a slot resolves, if either side is at 0 HP or below, the battle ends immediately and later slots do not fire. If both sides are at 0 or below, the player loses. | done |
| R-11 | If the enemy is still alive at the end of round 20's run, the player loses. | done |

## Order effects

| Id | Rule | Status |
|---|---|---|
| R-12 | An effect may target the next or the previous card. If the target slot is empty, or the target has no value that can change, the effect fizzles; it does not skip to a farther card. In v0 there is no wrap-around: slot 4 has no next card and slot 1 has no previous card. | partial: "next" done (Whetstone; attack, block and grow cards have a value that can change); "previous" [T05] |
| R-13 | Re-fire makes the target's effect happen again in the current slot; the re-fired attack and block count toward the current slot's head-to-head resolution. A card can be re-fired at most once per round. | planned [T05] |
| R-14 | Boosts come in two kinds. A temporary boost lasts for the current round. Growth lasts for the rest of the battle and is cleared after it. Growth is stored on the boosted card and stays with it if it is replaced, discarded, drawn again and placed again within the battle. | partial: growth done (Whetstone); temporary boosts not built; clearing after the battle waits for multi-battle runs |

## Merging

| Id | Rule | Status |
|---|---|---|
| R-15 | Placing a hand card onto a same-name card on the line raises that card's level by 1, up to 3. The placed card stays stacked underneath and does not return to the draw pile during this battle. Merging pays the placed card's cost. After the battle, all cards return to the deck at level 1. | planned [T07] |

## Randomness

| Id | Rule | Status |
|---|---|---|
| R-16 | Randomness is used only for shuffling and for the three-card reward choice after a battle, and all of it comes from the seed. The same seed with the same actions must produce exactly the same result. | partial: seeded shuffle done (generator state lives in the battle state; engine lint bans clock and `Math.random`); `npm run play -- --record` and `npm run replay` check a battle's final-state hash; reward choice [T11] |

## Enemies

| Id | Rule | Status |
|---|---|---|
| R-17 | The enemy line is set when the battle starts, is fully visible, and fires every round. Enemy cards use the same effect system as player cards. Enemies do not use energy. | done for the first enemy; more enemies [T12] |

## Checks

Invariants (I), numeric checks (N) and art checks (A). These are not game rules; they are what the tests and, later, the simulation check after every event. Tests cite them by id the same way as rules.

| Id | Check | Status |
|---|---|---|
| I-1 | Card conservation: draw pile, hand, discard pile and line (including stacked cards) add up to the number of cards the battle started with. | done: after every action of 200 seeded greedy games |
| I-2 | At most one card on top of each slot; level between 1 and 3; the number of stacked cards equals level − 1. | planned [T07] |
| I-3 | Block is never negative; nothing fires after either side reaches 0 HP. | partial: HP never below 0 in 200 seeded games; R-10 tests check no slot fires after the battle ends |
| I-4 | Energy spent in a round is at most that round's energy; energy is never negative; the hand never exceeds its size. | done: after every action of 200 seeded greedy games |
| I-5 | Triggers per round stay within the limit; no battle lasts more than 20 rounds; every battle ends. | partial: every one of 200 seeded greedy games ends within 20 rounds; no trigger limit yet [T05] |
| I-6 | The same seed with the same actions gives the same final state. | partial: replay test on 5 seeds; no replay command [T06] |
| I-7 | Save then load leaves the state unchanged. | planned [T30] |
| I-8 | Pairwise coverage: every pair of mechanics in the mechanic register has at least one named test. | planned [T17] |
| N-1 | The card table is well-formed; a card's values strictly increase with level. | planned [T14] |
| N-2 | Values are positive integers within the table's limits. | planned [T14] |
| N-3 | Win-rate baseline for the greedy bot on a fixed batch of seeds; a ticket that moves it beyond the agreed margin must say so and update the baseline. | planned [T18] |
| N-4 | One card's effect: the win-rate difference with and without it stays within the agreed margin. | planned |
| A-1 | Every card, player or enemy, has a rune glyph. | done for the card table; enemy figures are covered by a type check |
| A-2 | All cards are drawn at one size; direction-to-colour mapping is fixed and colours come only from the palette. | planned [T19] |
| A-3 | Text fits on the card face; text contrast is at least 4.5:1 against its background. | measured, not checked: `npm run scenes` reports text size, clipping and overlap but nothing fails on them [T19] |
| A-4 | Screenshot baselines for fixed-seed scenes; any difference needs a person to confirm. | planned [T20] |

## Not in v0

Area shields (block that covers every slot for a whole round), wrap-around order effects, moving cards, one-shot cards, recipe merges, permanent upgrades, 5-slot lines, disruptive enemies, rotating enemy lines, heat, relics, map, shop.
