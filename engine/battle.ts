// Battle rules. Rule ids refer to RULES.md.
import { CARDS, type CardId } from '../data/cards.ts';
import { ENEMIES, type EnemyId } from '../data/enemies.ts';
import { RULES } from '../data/rules.ts';
import {
  assertNever,
  type Action,
  type BattleState,
  type CardDef,
  type CardInstance,
  type EndReason,
  type GameEvent,
  type Owner,
  type SideState,
  type Slot,
  type StepResult,
} from './types.ts';

export interface BattleSetup {
  readonly enemyId: EnemyId;
  readonly playerLine: readonly (CardId | null)[];
  readonly playerHp?: number;
}

function buildLine(ids: readonly (CardId | null)[], prefix: string): Slot[] {
  if (ids.length !== RULES.lineLength) {
    throw new Error(`A line needs exactly ${RULES.lineLength} slots, got ${ids.length}`);
  }
  return ids.map((cardId, i): Slot => (cardId === null ? null : { uid: `${prefix}${i + 1}`, cardId, level: 1 }));
}

export function createBattle(setup: BattleSetup): BattleState {
  const enemy = ENEMIES[setup.enemyId];
  return {
    enemyId: setup.enemyId,
    round: 1,
    player: { hp: setup.playerHp ?? RULES.playerHp, line: buildLine(setup.playerLine, 'p') },
    enemy: { hp: enemy.hp, line: buildLine(enemy.line, 'e') },
    outcome: 'ongoing',
  };
}

/** What one card adds to its slot's head-to-head resolution (R-08). */
interface Contribution {
  attack: number;
}

const CARD_TABLE: Readonly<Record<string, CardDef>> = CARDS;

function cardDef(card: CardInstance): CardDef {
  const def = CARD_TABLE[card.cardId];
  if (def === undefined) throw new Error(`Unknown card id: ${card.cardId}`);
  return def;
}

function contributionOf(card: CardInstance): Contribution {
  const effect = cardDef(card).effect;
  const kind = effect.kind;
  switch (kind) {
    case 'attack':
      return { attack: effect.amount[card.level - 1] ?? 0 };
    default:
      return assertNever(kind);
  }
}

function endReason(playerDead: boolean, enemyDead: boolean): EndReason | null {
  // R-10: both sides at or below 0 in the same slot counts as a player loss.
  if (playerDead && enemyDead) return 'both-defeated';
  if (playerDead) return 'player-defeated';
  if (enemyDead) return 'enemy-defeated';
  return null;
}

function runRound(state: BattleState): StepResult {
  const round = state.round;
  const events: GameEvent[] = [{ type: 'round-start', round }];
  let player: SideState = state.player;
  let enemy: SideState = state.enemy;

  // R-07: the cursor walks slots 1..N; both sides' cards in a slot fire together.
  for (let i = 0; i < RULES.lineLength; i++) {
    const slot = i + 1;
    const totals: Record<Owner, Contribution> = { player: { attack: 0 }, enemy: { attack: 0 } };

    for (const [side, line] of [
      ['player', player.line],
      ['enemy', enemy.line],
    ] as const) {
      const card = line[i] ?? null;
      if (card === null) continue;
      events.push({ type: 'trigger', round, slot, side, uid: card.uid, cardId: card.cardId });
      totals[side].attack += contributionOf(card).attack;
    }

    // R-08: damage taken = opposing attack in this slot; both sides lose HP at the same time.
    // (Block from the same slot is subtracted once defense cards exist — T01.)
    const toEnemy = totals.player.attack;
    const toPlayer = totals.enemy.attack;
    if (toEnemy > 0) {
      enemy = { ...enemy, hp: Math.max(0, enemy.hp - toEnemy) };
      events.push({ type: 'damage', round, slot, target: 'enemy', amount: toEnemy, hpAfter: enemy.hp });
    }
    if (toPlayer > 0) {
      player = { ...player, hp: Math.max(0, player.hp - toPlayer) };
      events.push({ type: 'damage', round, slot, target: 'player', amount: toPlayer, hpAfter: player.hp });
    }

    // R-10: the battle ends right after the slot in which a side reaches 0.
    const reason = endReason(player.hp <= 0, enemy.hp <= 0);
    if (reason !== null) {
      const outcome = reason === 'enemy-defeated' ? 'won' : 'lost';
      events.push({ type: 'battle-end', round, outcome, reason });
      return { state: { ...state, player, enemy, outcome }, events };
    }
  }

  // R-11: enemy still alive after the last allowed round → player loses.
  if (round >= RULES.maxRounds) {
    events.push({ type: 'battle-end', round, outcome: 'lost', reason: 'round-limit' });
    return { state: { ...state, player, enemy, outcome: 'lost' }, events };
  }

  return { state: { ...state, player, enemy, round: round + 1 }, events };
}

/** The single engine entry point: state + action → new state + events. */
export function step(state: BattleState, action: Action): StepResult {
  if (state.outcome !== 'ongoing') {
    throw new Error(`Battle is over (${state.outcome}); no further actions are allowed`);
  }
  const type = action.type;
  switch (type) {
    case 'run':
      return runRound(state);
    default:
      return assertNever(type);
  }
}

/** Runs rounds until the battle ends. Returns the final state and every event in order. */
export function runToEnd(initial: BattleState): StepResult {
  let state = initial;
  const events: GameEvent[] = [];
  while (state.outcome === 'ongoing') {
    const result = step(state, { type: 'run' });
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
