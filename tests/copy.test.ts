// R-12 "previous" targets and R-13 copy: Echo (T05, ruling RL-1). Expected values are read from the card table.
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
  it('is a cost-2 flow card that copies the previous card, and the starter deck holds one', () => {
    expect(CARDS.echo).toMatchObject({ direction: 'flow', cost: 2, owner: 'player', effect: { kind: 'copy', target: 'previous' } });
    expect(STARTER_DECK.filter((id) => id === 'echo')).toHaveLength(1);
    expect(STARTER_DECK).toHaveLength(10);
  });

  it('has no value: no number on the card, and its text and events come from the table and payloads', () => {
    expect(cardValue({ cardId: 'echo', level: 1, growth: 0 })).toBeNull();
    expect(cardEffectText({ cardId: 'echo', level: 1, growth: 0 })).toBe('Acts as a copy of the previous card, in this slot.');
    const { events } = run(battle(['whetstone', 'echo', 'echo', 'slash']));
    const lines = events.flatMap((e) => (e.type === 'copy' || e.type === 'fizzle' || e.type === 'grow' ? [eventText(e, 'training-dummy')] : []));
    expect(lines).toEqual([
      'Slot 1: Whetstone fizzles: the card in slot 2 has no value to change.',
      'Slot 2: Echo copies Whetstone in slot 1.',
      'Slot 2: Echo fizzles: the card in slot 3 has no value to change.',
      'Slot 3: Echo copies Echo in slot 2, which copies Whetstone.',
      `Slot 3: Echo gives Slash in slot 4 +${WHET} for the battle (now ${SLASH + WHET}).`,
    ]);
  });
});

describe('R-13 a copy acts in the copy card\'s slot', () => {
  it("R-12.1 R-13.1 R-13.2 R-08.1 a copy of Slash adds its attack to the Echo's slot, not to the Slash's", () => {
    const { events } = run(battle(['slash', 'echo', null, null]));
    expect(of(events, 'copy')).toEqual([
      expect.objectContaining({ slot: 2, sourceSlot: 2, cardId: 'echo', targetSlot: 1, targetCardId: 'slash', asCardId: 'slash' }),
    ]);
    expect(enemyDamageIn(events, 1)).toBe(SLASH);
    expect(enemyDamageIn(events, 2)).toBe(SLASH);
  });

  it("R-13.2 R-08.1 a copy of Parry adds its block to the Echo's slot", () => {
    const { events } = run(battle(['parry', 'echo', null, null]));
    // The dummy swings in slot 2; the Parry in slot 1 blocks nothing there, its copy in slot 2 does.
    expect(of(events, 'block')).toEqual([expect.objectContaining({ slot: 2, side: 'player', incoming: SWING, blocked: Math.min(SWING, PARRY) })]);
    expect(of(events, 'damage').filter((e) => e.target === 'player' && e.slot === 2)).toEqual([]);
  });

  it('R-13.3 R-14.2 a copy has the copied card\'s current value, growth included', () => {
    const { events } = run(battle(['whetstone', 'slash', 'echo', null]));
    expect(enemyDamageIn(events, 2)).toBe(SLASH + WHET);
    expect(enemyDamageIn(events, 3)).toBe(SLASH + WHET);
  });

  it('R-13.4 a copy of Whetstone aims from the Echo\'s slot: it grows the card after the Echo, and the growth stays', () => {
    let state = battle(['whetstone', 'echo', 'slash', null]);
    const hits: number[] = [];
    for (let r = 0; r < 2; r++) {
      const out = run(state);
      expect(of(out.events, 'grow')).toEqual([
        expect.objectContaining({ slot: 2, sourceSlot: 2, uid: state.player.line[1]?.uid, targetSlot: 3, targetCardId: 'slash', amount: WHET }),
      ]);
      hits.push(enemyDamageIn(out.events, 3));
      state = out.state;
    }
    expect(hits).toEqual([SLASH + WHET, SLASH + 2 * WHET]);
    expect(state.player.line.map((c) => c?.growth ?? null)).toEqual([0, 0, 2 * WHET, null]);
  });
});

describe('R-13.5 a row of copies all act as the card before the row', () => {
  it('R-13.5 Slash then three Echoes deals the Slash\'s damage in all four slots, every round', () => {
    // Enough enemy HP that the battle lasts both rounds.
    const start = battle(['slash', 'echo', 'echo', 'echo']);
    let state: BattleState = { ...start, enemy: { ...start.enemy, hp: 100 } };
    for (let r = 0; r < 2; r++) {
      const out = run(state);
      // asUid and asSlot name the card at the end of the chain, which the board lights up.
      const slashUid = state.player.line[0]?.uid;
      expect(of(out.events, 'copy').map((e) => [e.slot, e.targetSlot, e.asSlot, e.asUid, e.asCardId])).toEqual([
        [2, 1, 1, slashUid, 'slash'],
        [3, 2, 1, slashUid, 'slash'],
        [4, 3, 1, slashUid, 'slash'],
      ]);
      expect([1, 2, 3, 4].map((s) => enemyDamageIn(out.events, s))).toEqual([SLASH, SLASH, SLASH, SLASH]);
      expect(of(out.events, 'fizzle')).toEqual([]);
      state = out.state;
    }
  });
});

describe('R-12 R-13 Echo fizzles instead of skipping', () => {
  it('R-12.5 Echo in slot 1 fizzles: no previous slot, no wrap-around to slot 4', () => {
    const { events } = run(battle(['echo', null, null, 'slash']));
    expect(of(events, 'fizzle')).toEqual([expect.objectContaining({ slot: 1, sourceSlot: 1, target: 'previous', targetSlot: null, reason: 'no-slot' })]);
    expect(of(events, 'copy')).toEqual([]);
    expect(enemyDamageIn(events, 1)).toBe(0);
  });

  it('R-12.2 R-12.4 Echo after an empty slot fizzles and does not reach the card before it', () => {
    const { events } = run(battle(['slash', null, 'echo', null]));
    expect(of(events, 'fizzle')).toEqual([expect.objectContaining({ slot: 3, targetSlot: 2, reason: 'empty-slot' })]);
    expect(enemyDamageIn(events, 3)).toBe(0);
  });

  it('R-13.6 a row of Echoes that reaches an empty slot or slot 1 copies nothing, and does not reach a farther card', () => {
    const afterGap = run(battle(['slash', null, 'echo', 'echo']));
    expect(of(afterGap.events, 'fizzle')).toEqual([
      expect.objectContaining({ slot: 3, targetSlot: 2, reason: 'empty-slot' }),
      expect.objectContaining({ slot: 4, targetSlot: 3, reason: 'nothing-to-copy' }),
    ]);
    expect(enemyDamageIn(afterGap.events, 4)).toBe(0);
    const fromStart = run(battle(['echo', 'echo', null, null]));
    expect(of(fromStart.events, 'fizzle')).toEqual([
      expect.objectContaining({ slot: 1, targetSlot: null, reason: 'no-slot' }),
      expect.objectContaining({ slot: 2, targetSlot: 1, reason: 'nothing-to-copy' }),
    ]);
    expect(of(fromStart.events, 'copy')).toEqual([]);
  });

  it('R-12.3 Whetstone whose next card is an Echo fizzles: the Echo has no value, even though it copies', () => {
    const { state, events } = run(battle(['whetstone', 'echo', null, null]));
    expect(of(events, 'copy')).toEqual([expect.objectContaining({ slot: 2, targetSlot: 1, targetCardId: 'whetstone' })]);
    expect(of(events, 'fizzle')).toEqual([
      expect.objectContaining({ slot: 1, sourceSlot: 1, cardId: 'whetstone', targetSlot: 2, reason: 'no-value' }),
      // The copy in slot 2 aims at slot 3, which is empty.
      expect.objectContaining({ slot: 2, sourceSlot: 2, cardId: 'echo', targetSlot: 3, reason: 'empty-slot' }),
    ]);
    expect(of(events, 'grow')).toEqual([]);
    expect(state.player.line.map((c) => c?.growth ?? null)).toEqual([0, 0, null, null]);
  });
});
