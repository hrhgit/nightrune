// Rule tests for the battle basics. Every describe() names the rule id(s) from RULES.md it covers.
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../data/enemies.ts';
import { RULES } from '../data/rules.ts';
import { CARDS } from '../data/cards.ts';
import { createBattle, startBattle, step } from '../engine/index.ts';

describe('R-01 each side has a 4-slot line and HP from the tables', () => {
  it('R-01.1 R-01.2 R-01.3 R-17.1 starts the player at the run HP and the enemy with its table HP and line', () => {
    const battle = createBattle({ enemyId: 'training-dummy', seed: 1 });
    expect(battle.player.line).toHaveLength(RULES.lineLength);
    expect(battle.enemy.line).toHaveLength(RULES.lineLength);
    expect(battle.player.hp).toBe(RULES.playerHp);
    expect(battle.enemy.hp).toBe(ENEMIES['training-dummy'].hp);
    expect(battle.enemy.line.map((c) => c?.cardId ?? null)).toEqual(ENEMIES['training-dummy'].line);
  });
});

describe('R-02 each round is placement, then run', () => {
  it('R-02.1 R-02.2 opens round 1 in placement, and running it ends with the next placement', () => {
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
  it('R-09.1 fires the same card in rounds 1, 2 and 3', () => {
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

describe('R-17 the enemy line', () => {
  it('R-17.2 fires every round, without any action from the enemy', () => {
    let state = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: [null, null, null, null] });
    const fired: string[] = [];
    for (let round = 1; round <= 3; round++) {
      const r = step(state, { type: 'run' });
      fired.push(...r.events.flatMap((e) => (e.type === 'trigger' && e.side === 'enemy' ? [`${e.round}:${e.slot}`] : [])));
      state = r.state;
    }
    expect(fired).toEqual(['1:2', '1:4', '2:2', '2:4', '3:2', '3:4']);
  });

  it('R-17.4 enemies use no energy: an enemy card with a cost fires anyway, and the enemy side has no energy', () => {
    // Echo costs 2. On the enemy line it copies the enemy card before it regardless.
    expect(CARDS.echo.cost).toBeGreaterThan(0);
    const base = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: [null, null, null, null] });
    expect('energy' in base.enemy).toBe(false);
    const line = [...base.enemy.line];
    line[2] = { uid: 'e-echo', cardId: 'echo', level: 1, growth: 0 };
    const { events } = step({ ...base, enemy: { ...base.enemy, line } }, { type: 'run' });
    expect(events.filter((e) => e.type === 'copy')).toEqual([expect.objectContaining({ side: 'enemy', slot: 3, targetSlot: 2, asCardId: 'dummy-swing' })]);
  });
});
