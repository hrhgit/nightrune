// Turns user-typed seed text into a seed the engine accepts. Shared by the page and the CLI so
// both reject the same inputs; the engine's seedRng stays the authority on the valid range.
import { seedRng } from '../engine/index.ts';

/** A decimal whole number the engine accepts as a seed, or null. */
export function parseSeed(text: string | undefined): number | null {
  const trimmed = (text ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  try {
    seedRng(n);
    return n;
  } catch {
    return null;
  }
}

export const SEED_HELP = 'A seed is a whole number from 0 to 4294967295.';
