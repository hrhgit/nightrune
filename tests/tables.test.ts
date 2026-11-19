import { describe, expect, it } from 'vitest';
import { CARDS } from '../data/cards.ts';
import { ENEMIES } from '../data/enemies.ts';
import { createBattle, step } from '../engine/index.ts';
import { greedyPlacement } from '../bots/greedy.ts';
import type { CardDef } from '../engine/types.ts';

import { validateTables } from '../engine/validate-tables.ts';

type Tables = Parameters<typeof validateTables>[0];

const cardWithCostAboveThree: CardDef = {
  name: 'Expensive', direction: 'attack', owner: 'player', cost: 4,
  effect: { kind: 'attack', amount: [1, 2, 3] },
};

function tables(cardId: string, card: unknown, line: readonly (string | null)[] = []): Tables {
  return {
    cards: { [cardId]: card } as Tables['cards'],
    enemies: { fixture: { name: 'Fixture', hp: 1, line } } as Tables['enemies'],
  };
}

describe('N-1 card values increase with level', () => {
  it('N-1 accepts cards with strictly rising values and cards with no value', () => {
    expect(() => validateTables({ cards: CARDS, enemies: ENEMIES })).not.toThrow();
    expect(CARDS['dummy-swing'].effect.amount).toEqual([3, 4, 5]);
    expect(() => validateTables(tables('echo', {
      name: 'Echo', direction: 'flow', owner: 'player', cost: 2,
      effect: { kind: 'copy', target: 'previous' },
    }))).not.toThrow();
  });

  it.each([
    ['equal values', [3, 3, 3]],
    ['falling values', [3, 2, 5]],
  ])('N-1 rejects %s with card id and field', (_label, amount) => {
    expect(() => validateTables(tables('fixture-card', {
      name: 'Fixture', direction: 'attack', owner: 'player', cost: 0,
      effect: { kind: 'attack', amount },
    }))).toThrow(/cards.*fixture-card.*effect\.amount/);
  });
});

describe('N-2 card and enemy table values are valid', () => {
  it.each([
    ['zero value', [0, 2, 3], 0, /fixture-card.*effect\.amount/],
    ['fractional value', [1, 2.5, 3], 0, /fixture-card.*effect\.amount/],
    ['negative cost', [1, 2, 3], -1, /fixture-card.*cost/],
    ['fractional cost', [1, 2, 3], 0.5, /fixture-card.*cost/],
    ['wrong number of levels', [1, 2], 0, /fixture-card.*effect\.amount/],
  ])('N-2 rejects %s with the card id and field', (_label, amount, cost, message) => {
    expect(() => validateTables(tables('fixture-card', {
      name: 'Fixture', direction: 'attack', owner: 'player', cost,
      effect: { kind: 'attack', amount },
    }))).toThrow(message);
  });

  it('N-2 allows values and costs above any table limit', () => {
    expect(cardWithCostAboveThree.cost).toBe(4);
    expect(() => validateTables(tables('large-card', {
      name: 'Large', direction: 'attack', owner: 'player', cost: 1_000_000,
      effect: { kind: 'attack', amount: [1_000_000, 1_000_001, 1_000_002] },
    }))).not.toThrow();
  });

  it.each([
    ['NaN', Number.NaN, 'NaN'],
    ['positive infinity', Number.POSITIVE_INFINITY, 'Infinity'],
    ['negative infinity', Number.NEGATIVE_INFINITY, '-Infinity'],
  ])('N-2 reports the invalid %s value', (_label, amount, shownValue) => {
    expect(() => validateTables(tables('non-finite-card', {
      name: 'Non-finite', direction: 'attack', owner: 'player', cost: 0,
      effect: { kind: 'attack', amount: [1, amount, 3] },
    }))).toThrow(`cards non-finite-card field effect.amount[1] has bad value ${shownValue}`);
  });

  it.each([
    ['missing', 'absent-card'],
    ['player-owned', 'player-card'],
  ])('N-2 rejects an enemy line containing a %s card', (_kind, id) => {
    const cards = id === 'player-card'
      ? { 'player-card': { name: 'Player', direction: 'attack', owner: 'player', cost: 0, effect: { kind: 'attack', amount: [1, 2, 3] } } }
      : {};
    expect(() => validateTables({
      cards: cards as Tables['cards'],
      enemies: { fixture: { name: 'Fixture', hp: 1, line: [id] } } as Tables['enemies'],
    })).toThrow(/enemies.*fixture.*line.*0/);
  });
});

describe('R-17.5 enemy cards stay at level 1', () => {
  it('R-17.5 keeps every enemy line card at level 1 after every action in seeded games', () => {
    for (let seed = 0; seed < 20; seed++) {
      let state = createBattle({ enemyId: 'training-dummy', seed });
      while (state.outcome === 'ongoing') {
        state = step(state, greedyPlacement(state)).state;
        expect(state.enemy.line.filter(Boolean).every((card) => card?.level === 1)).toBe(true);
      }
      expect(state.enemy.line.filter(Boolean).every((card) => card?.level === 1)).toBe(true);
    }
  });
});
