// Seeded random number generator (R-16). The generator state is a plain uint32 stored in
// BattleState, so the same seed and the same actions always give the same results.
// Algorithm: mulberry32 (public domain).

export type RngState = number;

const UINT32_LIMIT = 2 ** 32;

/** Accepts an integer seed in [0, 2^32) and returns the initial generator state. */
export function seedRng(seed: number): RngState {
  if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_LIMIT) {
    throw new RangeError(`Seed must be an integer in [0, ${UINT32_LIMIT}), got ${seed}`);
  }
  return seed;
}

/** Returns the next uint32 and the advanced state. Pure: the input state is not changed. */
export function nextUint32(state: RngState): { readonly value: number; readonly state: RngState } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: (t ^ (t >>> 14)) >>> 0, state: next };
}

/** Integer in [0, bound). */
export function nextBelow(state: RngState, bound: number): { readonly value: number; readonly state: RngState } {
  const r = nextUint32(state);
  return { value: Math.floor((r.value / UINT32_LIMIT) * bound), state: r.state };
}

/** Fisher–Yates shuffle driven by the seeded generator. Returns a new array. */
export function shuffle<T>(items: readonly T[], state: RngState): { readonly items: T[]; readonly state: RngState } {
  const out = [...items];
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextBelow(s, i + 1);
    s = r.state;
    const j = r.value;
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return { items: out, state: s };
}
