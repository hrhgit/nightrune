// R-08 block: Parry (T01). Every describe() names the rule id(s) from RULES.md it covers.
import { describe, expect, it } from 'vitest';
import { createBattle, step, type BattleState, type GameEvent, type Level } from '../engine/index.ts';
import { CARDS } from '../data/cards.ts';
import { STARTER_DECK } from '../data/decks.ts';

type Line = NonNullable<Parameters<typeof createBattle>[0]['playerLine']>;

function battle(playerLine: Line): BattleState {
  return createBattle({ enemyId: 'training-dummy', seed: 1, playerLine });
}

function inSlot(events: readonly GameEvent[], slot: number): GameEvent[] {
  return events.filter((e) => 'slot' in e && e.slot === slot);
}

function damageTo(events: readonly GameEvent[], target: 'player' | 'enemy', slot: number): number {
  return events.reduce((sum, e) => sum + (e.type === 'damage' && e.target === target && e.slot === slot ? e.amount : 0), 0);
}

/** Puts a card on the enemy line by hand, to exercise the shared effect system (R-17). */
function withEnemyCard(state: BattleState, slot: number, cardId: string, level: Level = 1): BattleState {
  const line = [...state.enemy.line];
  line[slot - 1] = { uid: `e-test-${slot}`, cardId, level, growth: 0 };
  return { ...state, enemy: { ...state.enemy, line } };
}

function withPlayerLevel(state: BattleState, slot: number, level: Level): BattleState {
  const line = [...state.player.line];
  const card = line[slot - 1];
  if (card === null || card === undefined) throw new Error(`slot ${slot} is empty`);
  line[slot - 1] = { ...card, level };
  return { ...state, player: { ...state.player, line } };
}

describe('T01 Parry card data', () => {
  it('is a cost-1 defense card that blocks 4 / 6 / 9', () => {
    expect(CARDS.parry).toMatchObject({ direction: 'defense', cost: 1, owner: 'player', effect: { kind: 'block', amount: [4, 6, 9] } });
  });

  it('is back in the starter deck: 3 Parry, the rest Slash stand-ins until T04/T05/T08', () => {
    expect(STARTER_DECK.filter((id) => id === 'parry')).toHaveLength(3);
    expect(STARTER_DECK).toHaveLength(10);
  });
});

describe('R-08 block cancels the opposing attack in the same slot', () => {
  it('Parry opposite the Training Dummy attack (3) takes no damage in that slot', () => {
    const before = battle([null, 'parry', null, null]);
    const { state, events } = step(before, { type: 'run' });
    expect(damageTo(events, 'player', 2)).toBe(0);
    expect(inSlot(events, 2)).toContainEqual({ type: 'block', round: 1, slot: 2, side: 'player', incoming: 3, blocked: 3 });
    // slot 4 is unblocked: only that attack lands
    expect(state.player.hp).toBe(before.player.hp - 3);
  });

  it('emits trigger, then block, then damage within a slot', () => {
    const { events } = step(withEnemyCard(battle([null, 'slash', null, null]), 2, 'parry'), { type: 'run' });
    // player Slash 4 vs enemy Parry 4: enemy blocks all of it; enemy slot 2 now has no attack
    expect(inSlot(events, 2).map((e) => e.type)).toEqual(['trigger', 'trigger', 'block']);
  });

  it('uses the level value: a level 2 Parry blocks 6', () => {
    const state = withPlayerLevel(battle([null, 'parry', null, null]), 2, 2);
    const strong = withEnemyCard(state, 2, 'slash', 3); // attack 9
    const { events } = step(strong, { type: 'run' });
    expect(inSlot(events, 2).find((e) => e.type === 'block')).toMatchObject({ incoming: 9, blocked: 6 });
    expect(damageTo(events, 'player', 2)).toBe(3);
  });

  it('boundary: block equal to the attack gives 0 damage and no damage event', () => {
    const state = withEnemyCard(battle([null, 'parry', null, null]), 2, 'slash'); // attack 4 vs block 4
    const { events } = step(state, { type: 'run' });
    expect(inSlot(events, 2).filter((e) => e.type === 'damage')).toEqual([]);
  });

  it('boundary: block larger than the attack never heals and never makes negative damage', () => {
    const before = withPlayerLevel(battle([null, 'parry', null, null]), 2, 3); // block 9 vs attack 3
    const { state, events } = step(before, { type: 'run' });
    for (const e of events) if (e.type === 'damage') expect(e.amount).toBeGreaterThan(0);
    expect(inSlot(events, 2).find((e) => e.type === 'block')).toMatchObject({ incoming: 3, blocked: 3 });
    expect(state.player.hp).toBe(before.player.hp - 3); // only slot 4 lands; no healing from the extra 6
  });

  it('failure case: Parry in slot 1 does not block the attack in slot 2 (no carry to later slots)', () => {
    const before = battle(['parry', null, null, null]);
    const { state, events } = step(before, { type: 'run' });
    expect(damageTo(events, 'player', 2)).toBe(3);
    expect(events.filter((e) => e.type === 'block')).toEqual([]);
    expect(state.player.hp).toBe(before.player.hp - 6);
  });

  it('block does not carry into the next round', () => {
    // Round 1: Parry blocks in slot 2. Round 2: replace it with nothing useful — move the Parry away.
    const r1 = step(battle([null, 'parry', null, null]), { type: 'run' });
    const moved: BattleState = { ...r1.state, player: { ...r1.state.player, line: [r1.state.player.line[1] ?? null, null, null, null] } };
    const r2 = step(moved, { type: 'run' });
    expect(damageTo(r2.events, 'player', 2)).toBe(3);
  });

  it('R-17: an enemy-side block reduces the player attack in that slot, both sides resolve at once', () => {
    // Slot 2: player Slash L3 (9) vs enemy Parry (4). Enemy takes 5; enemy has no attack there.
    const state = withPlayerLevel(withEnemyCard(battle([null, 'slash', null, null]), 2, 'parry'), 2, 3);
    const { events } = step(state, { type: 'run' });
    expect(inSlot(events, 2)).toContainEqual({ type: 'block', round: 1, slot: 2, side: 'enemy', incoming: 9, blocked: 4 });
    expect(damageTo(events, 'enemy', 2)).toBe(5);
  });

  it('a card with no block takes full damage; block only reduces the side that has it', () => {
    // Slot 2: player Parry vs enemy Slash L2 (6) → player takes 2; enemy takes 0 (Parry has no attack)
    const state = withEnemyCard(battle([null, 'parry', null, null]), 2, 'slash', 2);
    const { events } = step(state, { type: 'run' });
    expect(damageTo(events, 'player', 2)).toBe(2);
    expect(damageTo(events, 'enemy', 2)).toBe(0);
  });
});
