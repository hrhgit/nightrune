// Core data types for the Nightrune engine.
// The engine is pure: state in, state + events out. No UI, clock, network or Math.random.

/** Per-level values for a card effect: index 0 = level 1, 1 = level 2, 2 = level 3. */
export type LevelValues = readonly [number, number, number];

export type Level = 1 | 2 | 3;

export type Direction = 'attack' | 'defense' | 'growth' | 'flow';

export type Owner = 'player' | 'enemy';

/**
 * Every card effect is one member of this union.
 * Code that handles effects must switch on `kind` and end with `assertNever`,
 * so adding a new effect kind fails to compile until every handler covers it.
 */
export type Effect =
  /** Damage to the opposing card's side in the same slot. */
  | { readonly kind: 'attack'; readonly amount: LevelValues }
  /** Cancels that much of the opposing attack in the same slot only (R-08). */
  | { readonly kind: 'block'; readonly amount: LevelValues }
  /** Growth (R-14) on the target card for the rest of the battle; the target is chosen by R-12. */
  | { readonly kind: 'grow'; readonly target: 'next'; readonly amount: LevelValues };

export interface CardDef {
  readonly name: string;
  readonly direction: Direction;
  /** Energy cost to place the card (R-05). Enemy cards ignore it (R-17). */
  readonly cost: 0 | 1 | 2 | 3;
  readonly owner: Owner;
  readonly effect: Effect;
}

export interface EnemyDef {
  readonly name: string;
  readonly hp: number;
  /** Card ids in slots 1..N; null = empty slot. */
  readonly line: readonly (string | null)[];
}

export interface CardInstance {
  /** Stable id for this physical card within a run, e.g. "p1", "e2". */
  readonly uid: string;
  readonly cardId: string;
  readonly level: Level;
  /** Growth added to the card's value for the rest of the battle (R-14). Stays with this instance. */
  readonly growth: number;
}

export type Slot = CardInstance | null;

export interface SideState {
  readonly hp: number;
  readonly line: readonly Slot[];
}

/** The player side also owns the card piles and energy (R-03 to R-06). Index 0 is the top of a pile. */
export interface PlayerState extends SideState {
  readonly drawPile: readonly CardInstance[];
  readonly hand: readonly CardInstance[];
  readonly discard: readonly CardInstance[];
  readonly energy: number;
}

export type Outcome = 'ongoing' | 'won' | 'lost';

/**
 * While the outcome is 'ongoing' the battle is always in the placement phase of `round`:
 * the hand is drawn and energy is set. The `run` action ends placement and runs the round.
 */
export interface BattleState {
  readonly seed: number;
  readonly enemyId: string;
  /** 1-based number of the round whose placement is in progress. */
  readonly round: number;
  readonly player: PlayerState;
  readonly enemy: SideState;
  readonly outcome: Outcome;
  /** Seeded generator state (R-16). The only source of randomness. */
  readonly rng: number;
}

export type Action =
  /** Place a hand card (by uid) into a slot, 1-based (R-05). */
  | { readonly type: 'place'; readonly uid: string; readonly slot: number }
  /** End placement and run the round (R-06, R-07). */
  | { readonly type: 'run' };

/** Why the engine refused an action. The state is never changed when an action is refused. */
export type RejectReason =
  | 'battle-over'
  | 'card-not-in-hand'
  | 'slot-out-of-range'
  | 'not-enough-energy'
  /** Placing onto a same-name card is a merge (R-15), which is not built yet (T07). */
  | 'merge-not-built';

export class EngineError extends Error {
  readonly reason: RejectReason;
  constructor(reason: RejectReason, message: string) {
    super(message);
    this.name = 'EngineError';
    this.reason = reason;
  }
}

/** R-12: why a targeted effect fizzled. */
export type FizzleReason =
  /** The target would be past the end of the line (no wrap-around in v0). */
  | 'no-slot'
  /** The target slot is empty. */
  | 'empty-slot'
  /** The target card has no value that can change. */
  | 'no-value';

export type EndReason = 'enemy-defeated' | 'player-defeated' | 'both-defeated' | 'round-limit';

export type GameEvent =
  | { readonly type: 'shuffle'; readonly round: number; readonly source: 'deck' | 'discard'; readonly count: number }
  | { readonly type: 'draw'; readonly round: number; readonly uid: string; readonly cardId: string }
  | { readonly type: 'placement-start'; readonly round: number; readonly energy: number }
  | {
      readonly type: 'place';
      readonly round: number;
      readonly slot: number;
      readonly uid: string;
      readonly cardId: string;
      readonly cost: number;
      readonly energyAfter: number;
      /** uid of the card that was on the slot and went to the discard pile, if any. */
      readonly replaced: string | null;
    }
  | { readonly type: 'discard'; readonly round: number; readonly uid: string; readonly cardId: string; readonly from: 'hand' | 'line' }
  | { readonly type: 'round-start'; readonly round: number }
  | {
      readonly type: 'trigger';
      readonly round: number;
      readonly slot: number;
      readonly side: Owner;
      readonly uid: string;
      readonly cardId: string;
    }
  | {
      /** R-08: `side` blocked `blocked` of the `incoming` attack in this slot. Emitted only when blocked > 0. */
      readonly type: 'block';
      readonly round: number;
      readonly slot: number;
      readonly side: Owner;
      readonly incoming: number;
      readonly blocked: number;
    }
  | {
      readonly type: 'damage';
      readonly round: number;
      readonly slot: number;
      readonly target: Owner;
      readonly amount: number;
      readonly hpAfter: number;
    }
  | {
      /** R-14: the card in `slot` gave the card in `targetSlot` growth; `valueAfter` is its new value. */
      readonly type: 'grow';
      readonly round: number;
      readonly slot: number;
      readonly side: Owner;
      readonly uid: string;
      readonly cardId: string;
      readonly targetSlot: number;
      readonly targetUid: string;
      readonly targetCardId: string;
      readonly amount: number;
      readonly valueAfter: number;
    }
  | {
      /** R-12: the effect of the card in `slot` had no target and did nothing. */
      readonly type: 'fizzle';
      readonly round: number;
      readonly slot: number;
      readonly side: Owner;
      readonly uid: string;
      readonly cardId: string;
      readonly reason: FizzleReason;
    }
  | {
      readonly type: 'battle-end';
      readonly round: number;
      readonly outcome: Exclude<Outcome, 'ongoing'>;
      readonly reason: EndReason;
    };

export interface StepResult {
  readonly state: BattleState;
  readonly events: readonly GameEvent[];
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}
