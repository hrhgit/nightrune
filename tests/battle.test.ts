// Rule tests. Every describe() names the rule id(s) from RULES.md it covers.
import { describe, expect, it } from 'vitest';
import { createBattle, runToEnd, step } from '../engine/index.ts';
import { RULES } from '../data/rules.ts';

describe('R-07 R-08 slots resolve head-to-head, both sides at once', () => {
  it('R-07.2 R-08.3 fires both cards in a slot and applies both damages in the same slot', () => {
    const battle = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: [null, 'slash', null, null] });
    const { events } = step(battle, { type: 'run' });
    const slot2 = events.filter((e) => 'slot' in e && e.slot === 2).map((e) => e.type);
    // player trigger, enemy trigger, then damage to enemy and to player — all within slot 2
    expect(slot2).toEqual(['trigger', 'trigger', 'damage', 'damage']);
  });

  it('R-07.1 the cursor visits slots 1, 2, 3, 4 in that order', () => {
    const battle = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: ['slash', 'parry', 'slash', 'parry'] });
    const { events } = step(battle, { type: 'run' });
    const slots = events.flatMap((e) => (e.type === 'trigger' ? [e.slot] : []));
    expect(slots).toEqual([1, 2, 2, 3, 4, 4]);
  });

  it('R-07.3 in a slot where only one side has a card, only that card fires', () => {
    // The Training Dummy has no card in slot 1 and slot 3.
    const battle = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: ['slash', null, null, null] });
    const { events } = step(battle, { type: 'run' });
    expect(events.filter((e) => e.type === 'trigger' && e.slot === 1)).toEqual([expect.objectContaining({ side: 'player', cardId: 'slash' })]);
    expect(events.filter((e) => e.type === 'trigger' && e.slot === 2)).toEqual([expect.objectContaining({ side: 'enemy' })]);
  });

  it('R-07.4 skips empty slots on both sides', () => {
    const battle = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: [null, null, null, null] });
    const { events } = step(battle, { type: 'run' });
    const firedSlots = events.flatMap((e) => (e.type === 'trigger' ? [e.slot] : []));
    expect(firedSlots).toEqual([2, 4]);
  });
});

describe('R-10 battle ends right after the slot where a side hits 0', () => {
  it('R-10.1 R-10.2 stops before later slots fire', () => {
    // Training Dummy has 24 hp; slash deals 4. Enemy reaches 0 in round 3, slot 3.
    const battle = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: ['slash', null, 'slash', null] });
    const { state, events } = runToEnd(battle);
    expect(state.outcome).toBe('won');
    const last = events.at(-1);
    expect(last).toMatchObject({ type: 'battle-end', round: 3, reason: 'enemy-defeated' });
    const round3Triggers = events.flatMap((e) => (e.type === 'trigger' && e.round === 3 ? [e.slot] : []));
    expect(round3Triggers).not.toContain(4);
  });

  it('R-10.3 the player loses when only the player reaches 0', () => {
    const battle = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: [null, null, null, null], playerHp: 3 });
    const { state, events } = step(battle, { type: 'run' });
    expect(state.outcome).toBe('lost');
    expect(events.at(-1)).toMatchObject({ type: 'battle-end', round: 1, reason: 'player-defeated' });
    expect(events.flatMap((e) => (e.type === 'trigger' ? [e.slot] : []))).toEqual([2]);
  });

  it('R-10.3 R-08.3 counts both sides reaching 0 in the same slot as a player loss', () => {
    // Player at 3 hp; enemy slot 2 deals 3 while our slash finishes the last enemy hp.
    const battle = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: [null, 'slash', null, null], playerHp: 3 });
    const weakened = { ...battle, enemy: { ...battle.enemy, hp: 4 } };
    const { state, events } = step(weakened, { type: 'run' });
    expect(state.player.hp).toBe(0);
    expect(state.enemy.hp).toBe(0);
    expect(state.outcome).toBe('lost');
    expect(events.at(-1)).toMatchObject({ type: 'battle-end', reason: 'both-defeated' });
  });

  it('R-10.4 rejects actions after the battle is over', () => {
    const { state } = runToEnd(createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: ['slash', 'slash', 'slash', 'slash'] }));
    expect(() => step(state, { type: 'run' })).toThrow(/over/);
  });
});

describe('R-11 round limit', () => {
  it('R-11.1 player loses when the enemy survives the last round', () => {
    const battle = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: [null, null, null, null], playerHp: 1000 });
    const { state, events } = runToEnd(battle);
    expect(state.outcome).toBe('lost');
    expect(events.at(-1)).toMatchObject({ type: 'battle-end', round: RULES.maxRounds, reason: 'round-limit' });
  });
});
