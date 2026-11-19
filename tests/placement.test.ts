// Placement rules R-03 to R-06. Every describe() names the rule id(s) from RULES.md it covers.
import { describe, expect, it } from 'vitest';
import { CARDS } from '../data/cards.ts';
import { RULES } from '../data/rules.ts';
import { checkPlace, createBattle, EngineError, startBattle, step, type BattleState } from '../engine/index.ts';

const fresh = (seed = 1): BattleState => createBattle({ enemyId: 'training-dummy', seed });

function firstHandUid(state: BattleState): string {
  const card = state.player.hand[0];
  if (card === undefined) throw new Error('empty hand');
  return card.uid;
}

/** Expects `step` to refuse the action with `reason` and checks the input state did not change. */
function expectRejected(state: BattleState, action: Parameters<typeof step>[1], reason: string): void {
  const before = structuredClone(state);
  let caught: unknown;
  try {
    step(state, action);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(EngineError);
  expect((caught as EngineError).reason).toBe(reason);
  expect(state).toEqual(before);
}

describe('R-03 draw up to the hand size; reshuffle the discard pile when the draw pile runs out', () => {
  it('R-03.1 starts placement with a full hand drawn from the shuffled deck', () => {
    const { state, events } = startBattle({ enemyId: 'training-dummy', seed: 1 });
    expect(state.player.hand).toHaveLength(RULES.handSize);
    expect(state.player.drawPile).toHaveLength(10 - RULES.handSize);
    expect(events.map((e) => e.type)).toEqual(['shuffle', 'placement-start', 'draw', 'draw', 'draw', 'draw']);
  });

  it('R-03.2 reshuffles the discard pile mid-draw and keeps drawing', () => {
    // 10 cards, nothing placed: round 1 draws 4 (6 left), round 2 draws 4 (2 left),
    // round 3 draws 2, reshuffles the 8 discarded cards, then draws 2 more.
    let state = fresh();
    state = step(state, { type: 'run' }).state;
    const { state: r3, events } = step(state, { type: 'run' });
    const placementEvents = events.slice(events.findIndex((e) => e.type === 'placement-start'));
    expect(placementEvents.map((e) => e.type)).toEqual(['placement-start', 'draw', 'draw', 'shuffle', 'draw', 'draw']);
    expect(placementEvents[3]).toMatchObject({ type: 'shuffle', source: 'discard', count: 8 });
    expect(r3.player.hand).toHaveLength(RULES.handSize);
    expect(r3.player.discard).toHaveLength(0);
  });

  it('R-03.3 draws fewer cards without failing when the deck is smaller than the hand', () => {
    const state = createBattle({ enemyId: 'training-dummy', seed: 1, deck: ['slash', 'slash'] });
    expect(state.player.hand).toHaveLength(2);
    const next = step(state, { type: 'run' }).state;
    expect(next.player.hand).toHaveLength(2);
  });
});

describe('R-04 energy is set at the start of placement and not carried over', () => {
  it('R-04.1 R-04.2 starts at the per-round energy and resets after a round with unspent energy', () => {
    let state = fresh();
    expect(state.player.energy).toBe(RULES.energyPerRound);
    state = step(state, { type: 'place', uid: firstHandUid(state), slot: 1 }).state;
    expect(state.player.energy).toBe(RULES.energyPerRound - 1);
    state = step(state, { type: 'run' }).state;
    expect(state.player.energy).toBe(RULES.energyPerRound);
  });
});

describe('R-05 placing a card costs its energy', () => {
  it('R-05.1 R-05.4 places into an empty slot, pays the cost and leaves the hand', () => {
    const state = fresh();
    const card = state.player.hand[0];
    if (card === undefined) throw new Error('empty hand');
    const { uid, cardId } = card;
    const cost = CARDS[cardId as keyof typeof CARDS].cost;
    const { state: next, events } = step(state, { type: 'place', uid, slot: 2 });
    expect(next.player.line[1]?.uid).toBe(uid);
    expect(next.player.hand.map((c) => c.uid)).not.toContain(uid);
    expect(events).toEqual([
      { type: 'place', round: 1, slot: 2, uid, cardId, cost, energyAfter: RULES.energyPerRound - cost, replaced: null },
    ]);
  });

  it('R-05.2 R-05.3 has no limit on cards per round other than energy', () => {
    // Cost-1 cards only, so the count is decided by energy and not by which cards the shuffle dealt.
    let state = createBattle({ enemyId: 'training-dummy', seed: 1, deck: ['slash', 'parry', 'slash', 'parry', 'slash'] });
    for (const slot of [1, 2, 3]) state = step(state, { type: 'place', uid: firstHandUid(state), slot }).state;
    expect(state.player.energy).toBe(0);
    expectRejected(state, { type: 'place', uid: firstHandUid(state), slot: 4 }, 'not-enough-energy');
  });

  it('R-05.5 replacing a different card sends the old card to the discard pile and still pays', () => {
    // Only one player card exists before T01, so the occupant is put on the line directly.
    const base = fresh();
    const occupant = { uid: 'x1', cardId: 'dummy-swing', level: 1, growth: 0 } as const;
    const state: BattleState = { ...base, player: { ...base.player, line: [occupant, null, null, null] } };
    const uid = firstHandUid(state);
    const { state: next, events } = step(state, { type: 'place', uid, slot: 1 });
    expect(next.player.line[0]?.uid).toBe(uid);
    expect(next.player.discard.map((c) => c.uid)).toEqual(['x1']);
    expect(next.player.energy).toBe(RULES.energyPerRound - 1);
    expect(events.map((e) => e.type)).toEqual(['place', 'discard']);
    expect(events[0]).toMatchObject({ replaced: 'x1' });
  });

  it('refuses a same-name placement because merging (R-15) is not built yet', () => {
    // A deck of one card kind, so the hand surely holds two cards with the same name.
    let state = createBattle({ enemyId: 'training-dummy', seed: 1, deck: ['slash', 'slash', 'slash', 'slash'] });
    state = step(state, { type: 'place', uid: firstHandUid(state), slot: 1 }).state;
    expectRejected(state, { type: 'place', uid: firstHandUid(state), slot: 1 }, 'merge-not-built');
  });

  it('R-05.8 refuses cards that are not in hand and slots outside the line, without changing state', () => {
    const state = fresh();
    const inDrawPile = state.player.drawPile[0]?.uid ?? '';
    expectRejected(state, { type: 'place', uid: inDrawPile, slot: 1 }, 'card-not-in-hand');
    expectRejected(state, { type: 'place', uid: 'nope', slot: 1 }, 'card-not-in-hand');
    for (const slot of [0, 5, 1.5, -1]) {
      expectRejected(state, { type: 'place', uid: firstHandUid(state), slot }, 'slot-out-of-range');
    }
  });

  it('checkPlace agrees with step', () => {
    const state = fresh();
    expect(checkPlace(state, firstHandUid(state), 1)).toEqual({ ok: true, cost: 1, replaces: null });
    expect(checkPlace(state, firstHandUid(state), 9)).toEqual({ ok: false, reason: 'slot-out-of-range' });
  });

  it('R-10.4 refuses every action once the battle is over', () => {
    const base = fresh();
    const won: BattleState = { ...base, outcome: 'won' };
    expectRejected(won, { type: 'place', uid: firstHandUid(base), slot: 1 }, 'battle-over');
    expectRejected(won, { type: 'run' }, 'battle-over');
  });
});

describe('R-06 cards left in hand go to the discard pile at the end of placement', () => {
  it('R-06.1 discards the unplayed hand before the run', () => {
    let state = fresh();
    state = step(state, { type: 'place', uid: firstHandUid(state), slot: 1 }).state;
    const leftInHand = state.player.hand.map((c) => c.uid);
    const { state: next, events } = step(state, { type: 'run' });
    // Round 2 draws from the 6 cards still in the draw pile, so the discards are still there.
    expect(next.player.discard.map((c) => c.uid)).toEqual(leftInHand);
    expect(next.player.hand.map((c) => c.uid)).not.toEqual(expect.arrayContaining(leftInHand));
    const discarded = events.flatMap((e) => (e.type === 'discard' && e.from === 'hand' ? [e.uid] : []));
    expect(discarded).toEqual(leftInHand);
    const firstRunEvent = events.findIndex((e) => e.type === 'round-start');
    const lastDiscard = events.findLastIndex((e) => e.type === 'discard');
    expect(lastDiscard).toBeLessThan(firstRunEvent);
  });
});

describe('setup validation', () => {
  it('rejects enemy cards in the player deck', () => {
    expect(() => createBattle({ enemyId: 'training-dummy', seed: 1, deck: ['dummy-swing'] })).toThrow(/not a player card/);
  });
});
