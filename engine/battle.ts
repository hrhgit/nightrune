// Battle rules. Rule ids refer to RULES.md.
import { CARDS, type CardId } from '../data/cards.ts';
import { STARTER_DECK } from '../data/decks.ts';
import { ENEMIES, type EnemyId } from '../data/enemies.ts';
import { RULES } from '../data/rules.ts';
import { seedRng, shuffle, type RngState } from './rng.ts';
import {
  assertNever,
  EngineError,
  type Action,
  type BattleState,
  type CardDef,
  type CardInstance,
  type EndReason,
  type GameEvent,
  type Owner,
  type PlayerState,
  type RejectReason,
  type SideState,
  type Slot,
  type StepResult,
} from './types.ts';

export interface BattleSetup {
  readonly enemyId: EnemyId;
  /** Integer in [0, 2^32). Fixes every random outcome of the battle (R-16). */
  readonly seed: number;
  /** Cards in the player's deck. Defaults to the starter deck. */
  readonly deck?: readonly CardId[];
  /** Cards already on the player's line at the start. For tests and fixed demos; defaults to empty. */
  readonly playerLine?: readonly (CardId | null)[];
  readonly playerHp?: number;
}

const CARD_TABLE: Readonly<Record<string, CardDef>> = CARDS;

export function cardDef(cardId: string): CardDef {
  const def = CARD_TABLE[cardId];
  if (def === undefined) throw new Error(`Unknown card id: ${cardId}`);
  return def;
}

function checkLineLength(ids: readonly unknown[]): void {
  if (ids.length !== RULES.lineLength) {
    throw new Error(`A line needs exactly ${RULES.lineLength} slots, got ${ids.length}`);
  }
}

// ---------------------------------------------------------------------------
// Placement (R-03 to R-06)
// ---------------------------------------------------------------------------

/** R-03: draw up to the hand size; when the draw pile is empty, shuffle the discard pile into it. */
function drawUp(player: PlayerState, rng: RngState, round: number, events: GameEvent[]): { player: PlayerState; rng: RngState } {
  let drawPile = [...player.drawPile];
  let discard = [...player.discard];
  const hand = [...player.hand];
  let state = rng;
  while (hand.length < RULES.handSize) {
    if (drawPile.length === 0) {
      if (discard.length === 0) break;
      const shuffled = shuffle(discard, state);
      state = shuffled.state;
      events.push({ type: 'shuffle', round, source: 'discard', count: shuffled.items.length });
      drawPile = shuffled.items;
      discard = [];
    }
    const [top, ...rest] = drawPile;
    if (top === undefined) break;
    drawPile = rest;
    hand.push(top);
    events.push({ type: 'draw', round, uid: top.uid, cardId: top.cardId });
  }
  return { player: { ...player, drawPile, discard, hand }, rng: state };
}

/** Start of placement: R-04 set energy, then R-03 draw. */
function beginPlacement(state: BattleState, events: GameEvent[]): BattleState {
  const energy = RULES.energyPerRound;
  events.push({ type: 'placement-start', round: state.round, energy });
  const drawn = drawUp({ ...state.player, energy }, state.rng, state.round, events);
  return { ...state, player: drawn.player, rng: drawn.rng };
}

export function startBattle(setup: BattleSetup): StepResult {
  const enemyDef = ENEMIES[setup.enemyId];
  checkLineLength(enemyDef.line);
  const deckIds = setup.deck ?? STARTER_DECK;
  const lineIds = setup.playerLine ?? Array.from({ length: RULES.lineLength }, () => null);
  checkLineLength(lineIds);
  for (const id of [...deckIds, ...lineIds]) {
    if (id !== null && cardDef(id).owner !== 'player') throw new Error(`Card ${id} is not a player card`);
  }

  let next = 1;
  const playerCard = (cardId: string): CardInstance => ({ uid: `p${next++}`, cardId, level: 1 });
  const deck = deckIds.map(playerCard);
  const line = lineIds.map((id): Slot => (id === null ? null : playerCard(id)));
  const enemyLine = enemyDef.line.map((id, i): Slot => (id === null ? null : { uid: `e${i + 1}`, cardId: id, level: 1 }));

  const events: GameEvent[] = [];
  const shuffled = shuffle(deck, seedRng(setup.seed));
  events.push({ type: 'shuffle', round: 1, source: 'deck', count: deck.length });

  const initial: BattleState = {
    seed: setup.seed,
    enemyId: setup.enemyId,
    round: 1,
    player: {
      hp: setup.playerHp ?? RULES.playerHp,
      line,
      drawPile: shuffled.items,
      hand: [],
      discard: [],
      energy: 0,
    },
    enemy: { hp: enemyDef.hp, line: enemyLine },
    outcome: 'ongoing',
    rng: shuffled.state,
  };
  return { state: beginPlacement(initial, events), events };
}

/** Convenience for callers that do not need the opening events. */
export function createBattle(setup: BattleSetup): BattleState {
  return startBattle(setup).state;
}

export type PlaceCheck =
  | { readonly ok: true; readonly cost: number; readonly replaces: CardInstance | null }
  | { readonly ok: false; readonly reason: RejectReason };

/**
 * R-05: can the hand card `uid` be placed into `slot` (1-based) right now?
 * The UI and bots must use this instead of computing legality themselves.
 */
export function checkPlace(state: BattleState, uid: string, slot: number): PlaceCheck {
  if (state.outcome !== 'ongoing') return { ok: false, reason: 'battle-over' };
  const card = state.player.hand.find((c) => c.uid === uid);
  if (card === undefined) return { ok: false, reason: 'card-not-in-hand' };
  if (!Number.isInteger(slot) || slot < 1 || slot > RULES.lineLength) return { ok: false, reason: 'slot-out-of-range' };
  const cost = cardDef(card.cardId).cost;
  if (cost > state.player.energy) return { ok: false, reason: 'not-enough-energy' };
  const occupant = state.player.line[slot - 1] ?? null;
  if (occupant !== null && occupant.cardId === card.cardId) return { ok: false, reason: 'merge-not-built' };
  return { ok: true, cost, replaces: occupant };
}

/** Every placement that is legal right now, in hand order then slot order. */
export function legalPlacements(state: BattleState): { readonly uid: string; readonly slot: number }[] {
  const out: { uid: string; slot: number }[] = [];
  for (const card of state.player.hand) {
    for (let slot = 1; slot <= RULES.lineLength; slot++) {
      if (checkPlace(state, card.uid, slot).ok) out.push({ uid: card.uid, slot });
    }
  }
  return out;
}

function place(state: BattleState, uid: string, slot: number): StepResult {
  const check = checkPlace(state, uid, slot);
  if (!check.ok) throw new EngineError(check.reason, `Cannot place ${uid} in slot ${slot}: ${check.reason}`);
  const card = state.player.hand.find((c) => c.uid === uid);
  if (card === undefined) throw new EngineError('card-not-in-hand', `Card ${uid} is not in hand`);

  const events: GameEvent[] = [];
  const line = [...state.player.line];
  line[slot - 1] = card;
  const energy = state.player.energy - check.cost;
  // R-05 (b): the replaced card goes to the discard pile.
  const discard = check.replaces === null ? state.player.discard : [...state.player.discard, check.replaces];
  events.push({
    type: 'place',
    round: state.round,
    slot,
    uid: card.uid,
    cardId: card.cardId,
    cost: check.cost,
    energyAfter: energy,
    replaced: check.replaces?.uid ?? null,
  });
  if (check.replaces !== null) {
    events.push({ type: 'discard', round: state.round, uid: check.replaces.uid, cardId: check.replaces.cardId, from: 'line' });
  }
  const player: PlayerState = {
    ...state.player,
    line,
    energy,
    discard,
    hand: state.player.hand.filter((c) => c.uid !== uid),
  };
  return { state: { ...state, player }, events };
}

/** R-06: cards left in hand at the end of placement go to the discard pile. */
function discardHand(state: BattleState, events: GameEvent[]): BattleState {
  for (const c of state.player.hand) {
    events.push({ type: 'discard', round: state.round, uid: c.uid, cardId: c.cardId, from: 'hand' });
  }
  const player: PlayerState = { ...state.player, hand: [], discard: [...state.player.discard, ...state.player.hand] };
  return { ...state, player };
}

// ---------------------------------------------------------------------------
// Run (R-07 to R-11)
// ---------------------------------------------------------------------------

/** What one card adds to its slot's head-to-head resolution (R-08). */
interface Contribution {
  attack: number;
}

function contributionOf(card: CardInstance): Contribution {
  const effect = cardDef(card.cardId).effect;
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

function runRound(state: BattleState, events: GameEvent[]): BattleState {
  const round = state.round;
  events.push({ type: 'round-start', round });
  let player: PlayerState = state.player;
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
      return { ...state, player, enemy, outcome };
    }
  }

  // R-11: enemy still alive after the last allowed round → player loses.
  if (round >= RULES.maxRounds) {
    events.push({ type: 'battle-end', round, outcome: 'lost', reason: 'round-limit' });
    return { ...state, player, enemy, outcome: 'lost' };
  }

  return { ...state, player, enemy, round: round + 1 };
}

/** End placement (R-06), run the round (R-07..R-11), then begin the next placement (R-03, R-04). */
function endPlacementAndRun(state: BattleState): StepResult {
  const events: GameEvent[] = [];
  const afterRun = runRound(discardHand(state, events), events);
  const next = afterRun.outcome === 'ongoing' ? beginPlacement(afterRun, events) : afterRun;
  return { state: next, events };
}

/**
 * The single engine entry point: state + action → new state + events.
 * Refused actions throw EngineError and leave the input state untouched (states are immutable).
 */
export function step(state: BattleState, action: Action): StepResult {
  if (state.outcome !== 'ongoing') {
    throw new EngineError('battle-over', `Battle is over (${state.outcome}); no further actions are allowed`);
  }
  switch (action.type) {
    case 'place':
      return place(state, action.uid, action.slot);
    case 'run':
      return endPlacementAndRun(state);
    default:
      return assertNever(action);
  }
}

/** Runs rounds without placing anything until the battle ends. */
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
