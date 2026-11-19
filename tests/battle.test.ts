// Rule tests. Every describe() names the rule id(s) from RULES.md it covers.
import { describe, expect, it } from 'vitest';
import { createBattle, runToEnd, step } from '../engine/index.ts';
import { RULES } from '../data/rules.ts';

describe('R-07 R-08 slots resolve head-to-head, both sides at once', () => {
  it('fires both cards in a slot and applies both damages in the same slot', () => {
    const battle = createBattle({ enemyId: 'training-rig', playerLine: [null, 'strike', null, null] });
    const { events } = step(battle, { type: 'run' });
    const slot2 = events.filter((e) => 'slot' in e && e.slot === 2).map((e) => e.type);
    // player trigger, enemy trigger, then damage to enemy and to player — all within slot 2
    expect(slot2).toEqual(['trigger', 'trigger', 'damage', 'damage']);
  });

  it('skips empty slots on both sides', () => {
    const battle = createBattle({ enemyId: 'training-rig', playerLine: [null, null, null, null] });
    const { events } = step(battle, { type: 'run' });
    const firedSlots = events.flatMap((e) => (e.type === 'trigger' ? [e.slot] : []));
    expect(firedSlots).toEqual([2, 4]);
  });
});

describe('R-10 battle ends right after the slot where a side hits 0', () => {
  it('stops before later slots fire', () => {
    // Training Rig has 24 hp; strike deals 4. Enemy reaches 0 in round 3, slot 3.
    const battle = createBattle({ enemyId: 'training-rig', playerLine: ['strike', null, 'strike', null] });
    const { state, events } = runToEnd(battle);
    expect(state.outcome).toBe('won');
    const last = events.at(-1);
    expect(last).toMatchObject({ type: 'battle-end', round: 3, reason: 'enemy-defeated' });
    const round3Triggers = events.flatMap((e) => (e.type === 'trigger' && e.round === 3 ? [e.slot] : []));
    expect(round3Triggers).not.toContain(4);
  });

  it('counts both sides reaching 0 in the same slot as a player loss', () => {
    // Player at 3 hp; enemy slot 2 deals 3 while our strike finishes the last enemy hp.
    const battle = createBattle({ enemyId: 'training-rig', playerLine: [null, 'strike', null, null], playerHp: 3 });
    const weakened = { ...battle, enemy: { ...battle.enemy, hp: 4 } };
    const { state, events } = step(weakened, { type: 'run' });
    expect(state.player.hp).toBe(0);
    expect(state.enemy.hp).toBe(0);
    expect(state.outcome).toBe('lost');
    expect(events.at(-1)).toMatchObject({ type: 'battle-end', reason: 'both-defeated' });
  });

  it('rejects actions after the battle is over', () => {
    const { state } = runToEnd(createBattle({ enemyId: 'training-rig', playerLine: ['strike', 'strike', 'strike', 'strike'] }));
    expect(() => step(state, { type: 'run' })).toThrow(/over/);
  });
});

describe('R-11 round limit', () => {
  it('player loses when the enemy survives the last round', () => {
    const battle = createBattle({ enemyId: 'training-rig', playerLine: [null, null, null, null], playerHp: 1000 });
    const { state, events } = runToEnd(battle);
    expect(state.outcome).toBe('lost');
    expect(events.at(-1)).toMatchObject({ type: 'battle-end', round: RULES.maxRounds, reason: 'round-limit' });
  });
});
