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
| R-09 | Cards stay on the line and fire every round until replaced. | done |
| R-10 | After a slot resolves, if either side is at 0 HP or below, the battle ends immediately and later slots do not fire. If both sides are at 0 or below, the player loses. | done |
| R-11 | If the enemy is still alive at the end of round 20's run, the player loses. | done |

## Order effects

| Id | Rule | Status |
|---|---|---|
| R-12 | An effect may target the next or the previous card. If the target slot is empty, or the target has no value that can change, the effect fizzles; it does not skip to a farther card. In v0 there is no wrap-around: slot 4 has no next card and slot 1 has no previous card. | partial: "next" (Whetstone) and "previous" (Echo) done; R-12.3 differs for re-fire (see Requirements). Attack, block and grow cards have a value that can change; Echo has none |
| R-13 | Re-fire makes the target's effect happen again in the current slot; the re-fired attack and block count toward the current slot's head-to-head resolution. A card can be re-fired at most once per round. | done (Echo). Re-fired cards fire through the same code path as the cursor's own card |
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

## Requirements

Each rule above, split into literal requirements: one observable behaviour each, so each can be checked by one test. A requirement says the same as its rule, nothing more. Lines marked *(clarifies)* state something the rule leaves implicit, as the engine does it today; changing one is a rule change.

Status: **done** = a test whose `it()` title names the requirement id checks it; **partial** = the same, for the part the note names; **planned** = not built yet (ticket in brackets); **differs** = the engine does not do what the text says, waiting for the author's decision. `tests/rule-ids.test.ts` fails if a done or partial requirement has no such test, or if a rule's status in the tables above disagrees with its requirements.

| Id | Requirement | Status |
|---|---|---|
| R-01.1 | Each side's line has exactly 4 slots, numbered 1–4. | done |
| R-01.2 | The player starts the battle with 30 HP. | done |
| R-01.3 | The enemy starts with the HP and line given for it in the enemy table. | done |
| R-01.4 | Player HP carries over between the three battles of a run, without healing. | planned [T11] |
| R-02.1 | A battle starts in the placement of round 1. | done |
| R-02.2 | Ending placement runs that round; if the battle is not over, the placement of the next round starts. | done |
| R-03.1 | At the start of placement, cards are drawn until the hand holds 4. | done |
| R-03.2 | If the draw pile is empty while the hand is not full, the discard pile is shuffled into the draw pile and drawing continues. | done |
| R-03.3 | *(clarifies)* If the draw pile and the discard pile are both empty, drawing stops with fewer than 4 cards in hand. | done |
| R-04.1 | At the start of placement, energy is set to 3. | done |
| R-04.2 | Energy left unspent in a round is not added to the next round. | done |
| R-05.1 | Placing a card lowers energy by the card's cost. | done |
| R-05.2 | A card whose cost is more than the current energy cannot be placed; the attempt is refused and changes nothing. | done |
| R-05.3 | Energy is the only limit on how many cards are placed in a round. | done |
| R-05.4 | A card can be placed into an empty slot. | done |
| R-05.5 | A card placed onto a slot holding a card with another name replaces it: the old card goes to the discard pile, and the placement pays its cost. | done |
| R-05.6 | Cards stacked under a replaced card also go to the discard pile. | planned [T07] |
| R-05.7 | A card placed onto a card with the same name merges with it (R-15) and pays its cost. | planned [T07]: until then the placement is refused |
| R-05.8 | *(clarifies)* Only a card in the hand can be placed, and only into slots 1–4; any other placement is refused and changes nothing. | done |
| R-06.1 | When placement ends, every card left in the hand goes to the discard pile, before any card fires. | done |
| R-07.1 | In the run, the cursor visits slots 1, 2, 3, 4 in that order. | done |
| R-07.2 | In a slot where both sides have a card, both cards fire. | done |
| R-07.3 | In a slot where only one side has a card, only that card fires. | done |
| R-07.4 | A slot that is empty on both sides is skipped: nothing fires there. | done |
| R-08.1 | In a slot, a side's attack is the total of the attack its firings add in that slot, and its block is the total of the block they add. | done |
| R-08.2 | The damage a side takes in a slot is the opposing attack in that slot minus its own block in that slot, and never less than 0. | done |
| R-08.3 | Both sides take their damage for a slot at the same time, before R-10 is checked. | done |
| R-08.4 | Block applies only in its own slot; it does not carry to later slots. | done |
| R-08.5 | Block does not carry to the next round. | done |
| R-09.1 | A card on the line stays there and fires again every round until it is replaced. | done |
| R-10.1 | After a slot resolves, if either side is at 0 HP or below, the battle ends and no later slot fires. | done |
| R-10.2 | If only the enemy is at 0 HP or below, the player wins. | done |
| R-10.3 | If the player is at 0 HP or below, the player loses, also when the enemy is too. | done |
| R-10.4 | *(clarifies)* Once the battle has ended, every action is refused. | done |
| R-11.1 | If both sides are still above 0 HP at the end of round 20's run, the player loses and no round 21 is played. | done |
| R-12.1 | A "next" effect targets the card one slot higher on the same line; a "previous" effect targets the card one slot lower. | done |
| R-12.2 | If the target slot is empty, the effect fizzles. | done |
| R-12.3 | If the target card has no value that can change, the effect fizzles. | differs: growth follows it (Whetstone onto Echo fizzles); re-fire does not (Echo onto Echo re-fires it). Waiting for the author |
| R-12.4 | A fizzled effect does not move on to a farther card. | done |
| R-12.5 | There is no wrap-around: an effect aimed past slot 4 or before slot 1 fizzles. | done |
| R-13.1 | Re-fire makes the target card's effect happen again, during the current slot. | done |
| R-13.2 | The attack and block of a re-fired card count in the current slot, not in the target's own slot. | done |
| R-13.3 | A card is re-fired at most once per round; *(clarifies)* a further re-fire of it in that round fizzles. | done |
| R-13.4 | The once-per-round limit starts again each round. | done |
| R-14.1 | A temporary boost lasts for the current round only. | planned |
| R-14.2 | Growth adds to the boosted card's value from the moment it lands until the end of the battle, and growth from several firings adds up. | done |
| R-14.3 | Growth stays with the card when it is replaced, discarded, drawn again and placed again within the battle. | done |
| R-14.4 | Growth is cleared after the battle. | planned [T11] |
| R-15.1 | Placing a hand card onto a same-name card on the line raises that card's level by 1, up to 3. | planned [T07] |
| R-15.2 | The placed card stays stacked underneath and does not return to the draw pile during the battle. | planned [T07] |
| R-15.3 | Merging pays the placed card's cost. | planned [T07] |
| R-15.4 | After the battle, all cards return to the deck at level 1. | planned [T11] |
| R-16.1 | Shuffles use only the seeded generator. | done |
| R-16.2 | The three-card reward choice uses only the seeded generator. | planned [T11] |
| R-16.3 | The same seed with the same actions produces the same state and events. | done |
| R-17.1 | The enemy line is set from the enemy table when the battle starts, and every enemy card is in the battle state from the start. | done |
| R-17.2 | The enemy's cards fire every round. | done |
| R-17.3 | Enemy cards use the same effects as player cards. | done |
| R-17.4 | Enemies do not use energy: an enemy card fires whatever its cost. | done |

## Open design questions

Found while checking the requirements, the card texts and every card arrangement against each other. None of these is an engine fault: the engine does what is listed. Each needs the author's decision; until then, nothing changes.

| Id | Question | What happens today |
|---|---|---|
| Q-1 | R-12.3 says an effect aimed at a card with no value fizzles. Should that apply to re-fire, which does not change a value? | Echo aimed at an Echo re-fires it (R-12.3 marked "differs"). `tests/oracle.test.ts` counts these cases and fails if they stop happening, so a fix shows up |
| Q-2 | Slash's text says "Deals N damage to the opposing slot". Under R-08 a block in that slot lowers it. | The text holds against an unblocked slot (`tests/card-text.test.ts`); against a block, less than N is dealt |
| Q-3 | Whetstone's text says "Gives the next card +N"; R-12 makes it fizzle in slot 4, before an empty slot or before an Echo. | The card text does not mention fizzling; the rulebook does |
| Q-4 | Echo after Whetstone re-fires the Whetstone, whose next card is that Echo, so the re-fired Whetstone always fizzles. | Allowed by R-12 and R-13 as written; the pair never gives growth |
| Q-5 | A second Echo right after an Echo always fizzles (its target's target was already re-fired that round). | Allowed by R-13.3 as written |

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
