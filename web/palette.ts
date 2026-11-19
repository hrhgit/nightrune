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
  // Ground and scenery.
  ground: '#1A2026',
  groundFar: '#141922',
  moss: '#26322E',
  mossLight: '#34443B',
  pebble: '#3A4150',
  treeline: '#0D1119',
  treelineNear: '#111722',
  moon: '#F2EBD3',
  // Figures.
  wood: '#6B4A32',
  woodDark: '#45301F',
  burlap: '#A08560',
  burlapDark: '#7A6244',
  straw: '#D9B866',
  strawDark: '#A8873F',
  rope: '#C9B58A',
  stitch: '#3B2E22',
  cloak: '#2E3A52',
  cloakDark: '#1E2638',
  cloakLight: '#45577A',
  hood: '#0B0E15',
  leather: '#5A3E2B',
  crystal: '#8FD3FF',
} as const;

/** Glow color per card direction. Dim stones keep a thin edge in this color too. */
export const DIRECTION_GLOW: Record<Direction, string> = {
  attack: '#FF6A4A',
  defense: '#5AB6FF',
  growth: '#FFC94A',
  flow: '#7DF0B0',
};
