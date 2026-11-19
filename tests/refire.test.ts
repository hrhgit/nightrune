// R-12 "previous" targets and R-13 re-fire: Echo (T05). Expected values are read from the card table.
import { describe, expect, it } from 'vitest';
import { cardValue, createBattle, step, type BattleState, type GameEvent } from '../engine/index.ts';
import { CARDS } from '../data/cards.ts';
import { STARTER_DECK } from '../data/decks.ts';
import { cardEffectText, eventText } from '../present/text.ts';

type Line = NonNullable<Parameters<typeof createBattle>[0]['playerLine']>;

const WHET = CARDS.whetstone.effect.amount[0];
const SLASH = CARDS.slash.effect.amount[0];
const PARRY = CARDS.parry.effect.amount[0];
const SWING = CARDS['dummy-swing'].effect.amount[0];

function battle(playerLine: Line): BattleState {
  return createBattle({ enemyId: 'training-dummy', seed: 1, playerLine });
}

function run(state: BattleState): { state: BattleState; events: readonly GameEvent[] } {
  return step(state, { type: 'run' });
}

function of<T extends GameEvent['type']>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/** Damage the enemy took in a slot (the training dummy has no block, so this is the player's attack there). */
function enemyDamageIn(events: readonly GameEvent[], slot: number): number {
  return of(events, 'damage').find((e) => e.slot === slot && e.target === 'enemy')?.amount ?? 0;
}

describe('T05 Echo card data', () => {
  it('is a cost-2 flow card that re-fires the previous card, and the starter deck holds one', () => {
    expect(CARDS.echo).toMatchObject({ direction: 'flow', cost: 2, owner: 'player', effect: { kind: 'refire', target: 'previous' } });
    expect(STARTER_DECK.filter((id) => id === 'echo')).toHaveLength(1);
    expect(STARTER_DECK).toHaveLength(10);
  });

  it('has no value: no number on the card, and its text and events come from the table and payloads', () => {
    expect(cardValue({ cardId: 'echo', level: 1, growth: 0 })).toBeNull();
    expect(cardEffectText({ cardId: 'echo', level: 1, growth: 0 })).toBe('Fires the previous card again, in this slot. A card is fired again at most once per round.');
    const { events } = run(battle(['whetstone', 'echo', null, 'echo']));
    const lines = events.flatMap((e) => (e.type === 'refire' || e.type === 'fizzle' ? [eventText(e, 'training-dummy')] : []));
    expect(lines).toEqual([
      'Slot 1: Whetstone fizzles: the card in slot 2 has no value to change.',
      'Slot 2: Echo fires Whetstone in slot 1 again.',
      'Slot 2 (from slot 1): Whetstone fizzles: the card in slot 2 has no value to change.',
      'Slot 4: Echo fizzles: slot 3 is empty.',
    ]);
  });
});

describe('R-13 a re-fired card counts in the current slot', () => {
  it("R-12.1 R-13.1 R-13.2 R-08.1 a re-fired Slash adds its attack to the Echo's slot, not to its own", () => {
    const { events } = run(battle(['slash', 'echo', null, null]));
    expect(of(events, 'refire')).toEqual([
      expect.objectContaining({ slot: 2, sourceSlot: 2, cardId: 'echo', targetSlot: 1, targetCardId: 'slash' }),
    ]);
    expect(enemyDamageIn(events, 1)).toBe(SLASH);
    expect(enemyDamageIn(events, 2)).toBe(SLASH);
  });

  it("R-13.2 R-08.1 a re-fired Parry adds its block to the Echo's slot", () => {
    const { events } = run(battle(['parry', 'echo', null, null]));
    // The dummy swings in slot 2; the Parry in slot 1 blocks nothing there unless Echo fires it again in slot 2.
    expect(of(events, 'block')).toEqual([expect.objectContaining({ slot: 2, side: 'player', incoming: SWING, blocked: Math.min(SWING, PARRY) })]);
    expect(of(events, 'damage').filter((e) => e.target === 'player' && e.slot === 2)).toEqual([]);
  });

  it('a re-fired card uses its current value, growth included (R-14)', () => {
    const { events } = run(battle(['whetstone', 'slash', 'echo', null]));
    expect(enemyDamageIn(events, 2)).toBe(SLASH + WHET);
    expect(enemyDamageIn(events, 3)).toBe(SLASH + WHET);
  });
});

describe('R-12 R-13 Echo fizzles instead of skipping', () => {
  it('R-12.5 Echo in slot 1 fizzles: no previous slot, no wrap-around to slot 4', () => {
    const { events } = run(battle(['echo', null, null, 'slash']));
    expect(of(events, 'fizzle')).toEqual([expect.objectContaining({ slot: 1, sourceSlot: 1, target: 'previous', targetSlot: null, reason: 'no-slot' })]);
    expect(of(events, 'refire')).toEqual([]);
    expect(enemyDamageIn(events, 1)).toBe(0);
  });

  it('R-12.2 R-12.4 Echo after an empty slot fizzles and does not reach the card before it', () => {
    const { events } = run(battle(['slash', null, 'echo', null]));
    expect(of(events, 'fizzle')).toEqual([expect.objectContaining({ slot: 3, targetSlot: 2, reason: 'empty-slot' })]);
    expect(enemyDamageIn(events, 3)).toBe(0);
  });

  it('R-13.3 two Echoes in a row: the second re-fires the first, whose target was already re-fired this round, so it fizzles', () => {
    const { events } = run(battle(['slash', 'echo', 'echo', null]));
    expect(of(events, 'refire').map((e) => [e.slot, e.sourceSlot, e.targetSlot])).toEqual([
      [2, 2, 1],
      [3, 3, 2],
    ]);
    expect(of(events, 'fizzle')).toEqual([expect.objectContaining({ slot: 3, sourceSlot: 2, targetSlot: 1, reason: 'already-refired' })]);
    expect(enemyDamageIn(events, 2)).toBe(SLASH);
    expect(enemyDamageIn(events, 3)).toBe(0);
  });

  it('R-13.4 the once-per-round limit starts again next round', () => {
    const r1 = run(battle(['slash', 'echo', 'echo', null]));
    const r2 = run(r1.state);
    expect(of(r2.events, 'refire').map((e) => [e.slot, e.targetSlot])).toEqual([
      [2, 1],
      [3, 2],
    ]);
    expect(enemyDamageIn(r2.events, 2)).toBe(SLASH);
  });

  it('R-12.3 (growth part) Whetstone then Echo: the re-fired Whetstone targets the Echo, which has no value, so it fizzles', () => {
    const { state, events } = run(battle(['whetstone', 'echo', null, null]));
    expect(of(events, 'refire')).toEqual([expect.objectContaining({ slot: 2, targetSlot: 1, targetCardId: 'whetstone' })]);
    expect(of(events, 'fizzle')).toEqual([
      expect.objectContaining({ slot: 1, sourceSlot: 1, cardId: 'whetstone', targetSlot: 2, reason: 'no-value' }),
      expect.objectContaining({ slot: 2, sourceSlot: 1, cardId: 'whetstone', targetSlot: 2, reason: 'no-value' }),
    ]);
    expect(of(events, 'grow')).toEqual([]);
    expect(state.player.line.map((c) => c?.growth ?? null)).toEqual([0, 0, null, null]);
  });
});
