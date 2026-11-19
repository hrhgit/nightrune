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
export type Effect = { readonly kind: 'attack'; readonly amount: LevelValues };

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
}

export type Slot = CardInstance | null;

export interface SideState {
  readonly hp: number;
  readonly line: readonly Slot[];
}

export type Outcome = 'ongoing' | 'won' | 'lost';

export interface BattleState {
  readonly enemyId: string;
  /** 1-based number of the round that the next `run` action will execute. */
  readonly round: number;
  readonly player: SideState;
  readonly enemy: SideState;
  readonly outcome: Outcome;
}

export type Action = { readonly type: 'run' };

export type EndReason = 'enemy-defeated' | 'player-defeated' | 'both-defeated' | 'round-limit';

export type GameEvent =
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
      readonly type: 'damage';
      readonly round: number;
      readonly slot: number;
      readonly target: Owner;
      readonly amount: number;
      readonly hpAfter: number;
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
