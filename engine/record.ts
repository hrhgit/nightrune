// Battle records and replay (R-16). A record is the seed, the enemy and the player's actions;
// replaying it through `step()` must give the same final state on every run and every machine.
// Pure: no I/O, no clock. Reading and writing files is the CLI's job.
import { ENEMIES, type EnemyId } from '../data/enemies.ts';
import { startBattle, step } from './battle.ts';
import { seedRng } from './rng.ts';
import { EngineError, type Action, type BattleState, type GameEvent, type RejectReason } from './types.ts';

// The format names the rules a record was played under. Bump it whenever a rule change can make
// the same actions end differently, so an old record is refused instead of replaying to a new result.
// /2: Echo copies the previous card instead of re-firing the next one (RULES.md ruling RL-1).
export const RECORD_FORMAT = 'nightrune-record/2';

export interface BattleRecord {
  readonly format: typeof RECORD_FORMAT;
  readonly seed: number;
  readonly enemyId: EnemyId;
  readonly actions: readonly Action[];
  /** stateHash() of the state after the last action, when the record was written. */
  readonly finalHash?: string;
}

/** JSON with object keys sorted, so the text depends only on the values in the state. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 64-bit FNV-1a over the canonical JSON of the state, as 16 hex digits. */
export function stateHash(state: BattleState): string {
  const text = canonical(state);
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

export function makeRecord(seed: number, enemyId: EnemyId, actions: readonly Action[], final: BattleState): BattleRecord {
  return { format: RECORD_FORMAT, seed, enemyId, actions: [...actions], finalHash: stateHash(final) };
}

function validSeed(seed: unknown): seed is number {
  if (typeof seed !== 'number') return false;
  try {
    seedRng(seed);
    return true;
  } catch {
    return false;
  }
}

function isEnemyId(id: unknown): id is EnemyId {
  return typeof id === 'string' && Object.hasOwn(ENEMIES, id);
}

function isAction(a: unknown): a is Action {
  if (a === null || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  if (o.type === 'run') return Object.keys(o).length === 1;
  return o.type === 'place' && typeof o.uid === 'string' && Number.isInteger(o.slot) && Object.keys(o).length === 3;
}

/** Checks the shape of parsed JSON. Returns the record, or the list of what is wrong with it. */
export function parseRecord(data: unknown): { ok: true; record: BattleRecord } | { ok: false; problems: string[] } {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return { ok: false, problems: ['the record is not a JSON object'] };
  const o = data as Record<string, unknown>;
  const problems: string[] = [];
  if (o.format !== RECORD_FORMAT) problems.push(`format must be "${RECORD_FORMAT}"`);
  if (!validSeed(o.seed)) problems.push('seed must be a whole number from 0 to 4294967295');
  if (!isEnemyId(o.enemyId)) problems.push(`enemyId must be one of: ${Object.keys(ENEMIES).join(', ')}`);
  if (!Array.isArray(o.actions)) problems.push('actions must be a list');
  else {
    const bad = o.actions.findIndex((a) => !isAction(a));
    if (bad !== -1) problems.push(`action ${bad} is not {"type":"run"} or {"type":"place","uid":"…","slot":N}`);
  }
  if (o.finalHash !== undefined && (typeof o.finalHash !== 'string' || !/^[0-9a-f]{16}$/.test(o.finalHash))) {
    problems.push('finalHash must be 16 hex digits');
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, record: data as BattleRecord };
}

export type ReplayResult =
  | { readonly ok: true; readonly state: BattleState; readonly events: readonly GameEvent[]; readonly hash: string }
  | {
      readonly ok: false;
      /** 0-based index of the action the engine refused. */
      readonly index: number;
      readonly action: Action;
      readonly reason: RejectReason;
      readonly message: string;
    };

/** Replays a record's actions from its seed. Stops at the first refused action. */
export function replay(record: BattleRecord): ReplayResult {
  const opening = startBattle({ enemyId: record.enemyId, seed: record.seed });
  let state = opening.state;
  const events: GameEvent[] = [...opening.events];
  for (const [index, action] of record.actions.entries()) {
    try {
      const result = step(state, action);
      state = result.state;
      events.push(...result.events);
    } catch (err) {
      if (err instanceof EngineError) return { ok: false, index, action, reason: err.reason, message: err.message };
      throw err;
    }
  }
  return { ok: true, state, events, hash: stateHash(state) };
}
