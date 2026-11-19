// R-12 targeting and R-14 growth: Whetstone (T04). Expected values are read from the card table.
import { describe, expect, it } from 'vitest';
import { cardValue, createBattle, step, type BattleState, type CardInstance, type GameEvent } from '../engine/index.ts';
import { CARDS } from '../data/cards.ts';
import { STARTER_DECK } from '../data/decks.ts';
import { cardEffectText, eventText } from '../present/text.ts';

type Line = NonNullable<Parameters<typeof createBattle>[0]['playerLine']>;

const WHET = CARDS.whetstone.effect.amount[0];
const SLASH = CARDS.slash.effect.amount[0];
const PARRY = CARDS.parry.effect.amount[0];

function battle(playerLine: Line, deck?: Parameters<typeof createBattle>[0]['deck']): BattleState {
  return createBattle({ enemyId: 'training-dummy', seed: 1, playerLine, ...(deck === undefined ? {} : { deck }) });
}

function run(state: BattleState): { state: BattleState; events: readonly GameEvent[] } {
  return step(state, { type: 'run' });
}

function of<T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

function slotCard(state: BattleState, slot: number): CardInstance {
  const card = state.player.line[slot - 1];
  if (card === null || card === undefined) throw new Error(`slot ${slot} is empty`);
  return card;
}

describe('T04 Whetstone card data', () => {
  it('is a cost-1 growth card that targets the next card, and the starter deck holds one', () => {
    expect(CARDS.whetstone).toMatchObject({ direction: 'growth', cost: 1, owner: 'player', effect: { kind: 'grow', target: 'next' } });
    expect(STARTER_DECK.filter((id) => id === 'whetstone')).toHaveLength(1);
    expect(STARTER_DECK).toHaveLength(10);
  });

  it('describes itself and its events from the table and the event payloads', () => {
    expect(cardEffectText({ cardId: 'whetstone', level: 1, growth: 0 })).toBe(`Gives the next card +${WHET} for the rest of the battle.`);
    expect(cardEffectText({ cardId: 'slash', level: 1, growth: 2 })).toBe(`Deals ${SLASH + 2} damage to the opposing slot.`);
    const { events } = run(battle(['whetstone', 'slash', null, 'whetstone']));
    const lines = events.flatMap((e) => (e.type === 'grow' || e.type === 'fizzle' ? [eventText(e, 'training-dummy')] : []));
    expect(lines).toEqual([
      `Slot 1: Whetstone gives Slash in slot 2 +${WHET} for the battle (now ${SLASH + WHET}).`,
      'Slot 4: Whetstone fizzles: there is no next slot.',
    ]);
  });
});

describe('R-12 R-14 Whetstone gives the next card growth', () => {
  it('R-12.1 R-14.2 the next card fires with its new value in the same round', () => {
    const { state, events } = run(battle(['whetstone', 'slash', null, null]));
    expect(of(events, 'grow')).toEqual([
      expect.objectContaining({ slot: 1, side: 'player', targetSlot: 2, targetCardId: 'slash', amount: WHET, valueAfter: SLASH + WHET }),
    ]);
    // Slot 2 meets the dummy's swing (attack, no block), so the grown Slash deals its full value.
    expect(of(events, 'damage').find((e) => e.slot === 2 && e.target === 'enemy')?.amount).toBe(SLASH + WHET);
    expect(slotCard(state, 2).growth).toBe(WHET);
    expect(cardValue(slotCard(state, 2))).toBe(SLASH + WHET);
  });

  it('R-14.2 growth lasts the battle and adds up each round the Whetstone fires', () => {
    const r1 = run(battle(['whetstone', 'slash', null, null]));
    const r2 = run(r1.state);
    expect(of(r2.events, 'grow')[0]?.valueAfter).toBe(SLASH + 2 * WHET);
    expect(slotCard(r2.state, 2).growth).toBe(2 * WHET);
  });

  it('growth on a block card adds to its block', () => {
    // Put a level-3 Slash on the enemy's slot 2 so the attack is larger than the grown block.
    const base = battle(['whetstone', 'parry', null, null]);
    const enemyLine = [...base.enemy.line];
    enemyLine[1] = { uid: 'e-test-2', cardId: 'slash', level: 3, growth: 0 };
    const { events } = run({ ...base, enemy: { ...base.enemy, line: enemyLine } });
    const incoming = CARDS.slash.effect.amount[2];
    expect(of(events, 'block')).toEqual([expect.objectContaining({ slot: 2, side: 'player', incoming, blocked: PARRY + WHET })]);
    expect(of(events, 'damage').find((e) => e.target === 'player')?.amount).toBe(incoming - PARRY - WHET);
  });

  it('a Whetstone can grow another Whetstone, which then gives more (Whetstone + Whetstone)', () => {
    const { state, events } = run(battle(['whetstone', 'whetstone', 'slash', null]));
    expect(of(events, 'grow').map((e) => [e.slot, e.targetSlot, e.amount])).toEqual([
      [1, 2, WHET],
      [2, 3, 2 * WHET],
    ]);
    expect(cardValue(slotCard(state, 3))).toBe(SLASH + 2 * WHET);
  });
});

describe('R-12 a targeted effect fizzles instead of skipping', () => {
  it('R-12.5 Whetstone in slot 4 fizzles: no next slot, no wrap-around to slot 1', () => {
    const { state, events } = run(battle(['slash', null, null, 'whetstone']));
    expect(of(events, 'fizzle')).toEqual([expect.objectContaining({ slot: 4, reason: 'no-slot' })]);
    expect(of(events, 'grow')).toEqual([]);
    expect(slotCard(state, 1).growth).toBe(0);
  });

  it('R-12.2 R-12.4 Whetstone before an empty slot fizzles and does not reach the card after it', () => {
    const { state, events } = run(battle(['whetstone', null, 'slash', null]));
    expect(of(events, 'fizzle')).toEqual([expect.objectContaining({ slot: 1, reason: 'empty-slot' })]);
    expect(slotCard(state, 3).growth).toBe(0);
  });
});

describe('R-14 growth stays with the card through discard, draw and placement', () => {
  it('R-14.3 a grown Slash replaced, reshuffled, drawn and placed again keeps its growth', () => {
    // Deck of 4 Parry: the hand is always Parry until the replaced Slash is shuffled back in.
    let state = battle(['whetstone', 'slash', null, null], ['parry', 'parry', 'parry', 'parry']);
    const slash = slotCard(state, 2);
    state = run(state).state; // round 1: Slash grows
    const hand = state.player.hand[0];
    if (hand === undefined) throw new Error('empty hand');
    state = step(state, { type: 'place', uid: hand.uid, slot: 2 }).state; // Parry replaces the grown Slash
    expect(state.player.discard.find((c) => c.uid === slash.uid)?.growth).toBe(WHET);
    state = run(state).state; // round 2; round 3 placement reshuffles the discard and draws
    const drawn = state.player.hand.find((c) => c.uid === slash.uid);
    expect(drawn?.growth).toBe(WHET);
    state = step(state, { type: 'place', uid: slash.uid, slot: 3 }).state;
    expect(slotCard(state, 3)).toMatchObject({ uid: slash.uid, growth: WHET });
    expect(cardValue(slotCard(state, 3))).toBe(SLASH + WHET);
  });
});
