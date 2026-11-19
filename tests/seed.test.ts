// R-16 seeded randomness, plus invariants I-1 (card conservation) and I-4 (energy and hand
// limits) checked after every action over many seeded games played by the greedy bot.
import { describe, expect, it } from 'vitest';
import { greedyPlacement, playGreedy } from '../bots/greedy.ts';
import { RULES } from '../data/rules.ts';
import { STARTER_DECK } from '../data/decks.ts';
import { createBattle, nextUint32, seedRng, shuffle, startBattle, step, type BattleState } from '../engine/index.ts';

describe('R-16 the seeded generator', () => {
  it('matches the mulberry32 reference output', () => {
    // Reference: mulberry32(1)() === 0.6270739405881613, i.e. 2693262067 / 2^32.
    expect(nextUint32(seedRng(1)).value).toBe(2693262067);
  });

  it('shuffles into a permutation and does not mutate its input', () => {
    const input = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const { items } = shuffle(input, seedRng(42));
    expect([...items].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('keeps the shuffle order for seed 1 stable, so recorded seeds keep replaying the same game', () => {
    expect(shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], seedRng(1)).items).toEqual([7, 8, 3, 2, 1, 5, 9, 4, 0, 6]);
  });

  it('rejects seeds that are not integers in [0, 2^32)', () => {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) {
      expect(() => createBattle({ enemyId: 'training-dummy', seed })).toThrow(RangeError);
    }
  });
});

describe('R-16 I-6 same seed and same actions give the same result', () => {
  it('replays identically', () => {
    for (const seed of [0, 1, 7, 123456789, 2 ** 32 - 1]) {
      const a = startBattle({ enemyId: 'training-dummy', seed });
      const b = startBattle({ enemyId: 'training-dummy', seed });
      expect(b).toEqual(a);
      const playA = playGreedy(a.state);
      // Replay A's recorded actions on B rather than re-running the bot.
      let state = b.state;
      const events = [];
      for (const action of playA.actions) {
        const r = step(state, action);
        state = r.state;
        events.push(...r.events);
      }
      expect(state).toEqual(playA.state);
      expect(events).toEqual(playA.events);
    }
  });

  it('different seeds give different draw orders', () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      orders.add(createBattle({ enemyId: 'training-dummy', seed }).player.hand.map((c) => c.uid).join(','));
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});

function checkInvariants(state: BattleState, deckSize: number): void {
  const p = state.player;
  const onLine = p.line.flatMap((s) => (s === null ? [] : [s]));
  const all = [...p.drawPile, ...p.hand, ...p.discard, ...onLine];
  // I-1: every card is in exactly one place.
  expect(all).toHaveLength(deckSize);
  expect(new Set(all.map((c) => c.uid)).size).toBe(deckSize);
  // I-4: energy within [0, energyPerRound]; hand within the hand size.
  expect(p.energy).toBeGreaterThanOrEqual(0);
  expect(p.energy).toBeLessThanOrEqual(RULES.energyPerRound);
  expect(p.hand.length).toBeLessThanOrEqual(RULES.handSize);
  // I-3 (part): HP never below 0.
  expect(p.hp).toBeGreaterThanOrEqual(0);
  expect(state.enemy.hp).toBeGreaterThanOrEqual(0);
}

describe('I-1 I-4 invariants over 200 seeded greedy games', () => {
  it('holds after every action and every game ends within the round limit', () => {
    for (let seed = 0; seed < 200; seed++) {
      let state = createBattle({ enemyId: 'training-dummy', seed });
      checkInvariants(state, STARTER_DECK.length);
      let actions = 0;
      while (state.outcome === 'ongoing') {
        state = step(state, greedyPlacement(state)).state;
        checkInvariants(state, STARTER_DECK.length);
        actions++;
        expect(actions).toBeLessThan(1000);
      }
      expect(state.round).toBeLessThanOrEqual(RULES.maxRounds);
    }
  });
});
