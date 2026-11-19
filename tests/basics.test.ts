// Rule tests for the battle basics. Every describe() names the rule id(s) from RULES.md it covers.
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../data/enemies.ts';
import { RULES } from '../data/rules.ts';
import { createBattle, startBattle, step } from '../engine/index.ts';

describe('R-01 each side has a 4-slot line and HP from the tables', () => {
  it('starts the player at the run HP and the enemy with its table HP and line', () => {
    const battle = createBattle({ enemyId: 'training-dummy', seed: 1 });
    expect(battle.player.line).toHaveLength(RULES.lineLength);
    expect(battle.enemy.line).toHaveLength(RULES.lineLength);
    expect(battle.player.hp).toBe(RULES.playerHp);
    expect(battle.enemy.hp).toBe(ENEMIES['training-dummy'].hp);
    expect(battle.enemy.line.map((c) => c?.cardId ?? null)).toEqual(ENEMIES['training-dummy'].line);
  });
});

describe('R-02 each round is placement, then run', () => {
  it('opens round 1 in placement, and running it ends with the next placement', () => {
    const start = startBattle({ enemyId: 'training-dummy', seed: 1 });
    expect(start.state.round).toBe(1);
    expect(start.events.filter((e) => e.type === 'placement-start')).toMatchObject([{ round: 1 }]);
    const { state, events } = step(start.state, { type: 'run' });
    const order = events.flatMap((e) => (e.type === 'round-start' || e.type === 'placement-start' ? [`${e.type}:${e.round}`] : []));
    expect(order).toEqual(['round-start:1', 'placement-start:2']);
    expect(state.round).toBe(2);
  });
});

describe('R-09 cards stay on the line and fire every round', () => {
  it('fires the same card in rounds 1, 2 and 3', () => {
    let state = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: ['parry', null, null, null] });
    const uid = state.player.line[0]?.uid;
    expect(uid).toBeDefined();
    const roundsFired: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = step(state, { type: 'run' });
      roundsFired.push(...r.events.flatMap((e) => (e.type === 'trigger' && e.uid === uid ? [e.round] : [])));
      state = r.state;
    }
    expect(roundsFired).toEqual([1, 2, 3]);
    expect(state.player.line[0]?.uid).toBe(uid);
  });
});
