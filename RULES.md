# Beltdeck rulebook (v0)

Every rule has an id. A change to a rule must change this file **and** the tests that name the rule id in the same pull request.
All numbers below are placeholders; the source of truth for numbers is `data/` (`cards.ts`, `enemies.ts`, `rules.ts`).

Status: **done** = implemented and tested; **partial** = implemented in part (see note); **planned** = not built yet (ticket in brackets).

## Terms

| Term | Meaning |
|---|---|
| Line | A row of 4 slots, numbered 1–4. The player has one, the enemy has one. |
| Round | One placement phase followed by one run phase. |
| Placement | The player draws and places cards on the line. |
| Run | Both lines fire automatically, slot by slot. No player input. |
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
| R-02 | A battle is a sequence of rounds. Each round is placement, then run. | partial: run only; placement [T02] |

## Placement

| Id | Rule | Status |
|---|---|---|
| R-03 | At the start of placement, draw up to 4 cards in hand. If the draw pile is empty, shuffle the discard pile into it and keep drawing. | planned [T02] |
| R-04 | At the start of placement, energy is set to 3. Unspent energy from the previous round is lost. | planned [T02] |
| R-05 | Placing a card costs its energy cost; a card cannot be placed without enough energy. There is no other limit on cards per round. A card can be placed (a) into an empty slot, (b) onto an occupied slot, sending the old card and any cards stacked under it to the discard pile, or (c) by merging (R-15). All three pay the cost. | planned [T02] |
| R-06 | At the end of placement, cards left in hand go to the discard pile. | planned [T02] |

## Run

| Id | Rule | Status |
|---|---|---|
| R-07 | The cursor walks from slot 1 to slot 4. In each slot, both sides' cards fire at the same time. If only one side has a card there, only that card fires; if both are empty, the slot is skipped. | done |
| R-08 | Head-to-head resolution: within one slot, first total each side's attack and block for that slot. Damage taken by a side = opposing attack in that slot − own block in that slot, minimum 0. Both sides lose HP at the same time. Block applies only to that slot; it does not carry to later slots or rounds. | partial: attack done; block [T01] |
| R-09 | Cards stay on the line and fire every round until replaced. | done (no replacement yet) |
| R-10 | After a slot resolves, if either side is at 0 HP or below, the battle ends immediately and later slots do not fire. If both sides are at 0 or below, the player loses. | done |
| R-11 | If the enemy is still alive at the end of round 20's run, the player loses. | done |

## Order effects

| Id | Rule | Status |
|---|---|---|
| R-12 | An effect may target the next or the previous card. If the target slot is empty, or the target has no value that can change, the effect fizzles; it does not skip to a farther card. In v0 there is no wrap-around: slot 4 has no next card and slot 1 has no previous card. | planned [T04] |
| R-13 | Re-fire makes the target's effect happen again in the current slot; the re-fired attack and block count toward the current slot's head-to-head resolution. A card can be re-fired at most once per round. | planned [T05] |
| R-14 | Boosts come in two kinds. A temporary boost lasts for the current round. Growth lasts for the rest of the battle and is cleared after it. Growth is stored on the boosted card and stays with it if it is replaced, discarded, drawn again and placed again within the battle. | planned [T04] |

## Merging

| Id | Rule | Status |
|---|---|---|
| R-15 | Placing a hand card onto a same-name card on the line raises that card's level by 1, up to 3. The placed card stays stacked underneath and does not return to the draw pile during this battle. Merging pays the placed card's cost. After the battle, all cards return to the deck at level 1. | planned [T07] |

## Randomness

| Id | Rule | Status |
|---|---|---|
| R-16 | Randomness is used only for shuffling and for the three-card reward choice after a battle, and all of it comes from the seed. The same seed with the same actions must produce exactly the same result. | partial: no randomness exists yet; engine lint already bans clock and `Math.random` [T06] |

## Enemies

| Id | Rule | Status |
|---|---|---|
| R-17 | The enemy line is set when the battle starts, is fully visible, and fires every round. Enemy cards use the same effect system as player cards. Enemies do not use energy. | done for the first enemy; more enemies [T12] |

## Not in v0

Area shields (block that covers every slot for a whole round), wrap-around order effects, moving cards, one-shot cards, recipe merges, permanent upgrades, 5-slot lines, disruptive enemies, rotating enemy lines, heat, relics, map, shop.
