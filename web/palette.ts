// "Runestone night camp" palette (design doc section 13). Colors live here only.
import type { Direction } from '../engine/index.ts';

export const PALETTE = {
  sky: '#161C2B',
  skyHigh: '#1E2538',
  socket: '#2A3142',
  stone: '#5A6072',
  stoneLight: '#6B7186',
  stoneDark: '#454A5A',
  runeDim: '#9BA3B6',
  text: '#F4F6FF',
  ember: '#FFC94A',
  flame: '#FF6A4A',
} as const;

/** Glow color per card direction. Dim stones keep a thin edge in this color too. */
export const DIRECTION_GLOW: Record<Direction, string> = {
  attack: '#FF6A4A',
  defense: '#5AB6FF',
  growth: '#FFC94A',
  flow: '#7DF0B0',
};
