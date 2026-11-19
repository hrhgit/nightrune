// The card table. All card numbers live here and nowhere else.
// Values are placeholders until simulation runs exist.
import type { CardDef } from '../engine/types.ts';

export const CARDS = {
  slash: {
    name: 'Slash',
    direction: 'attack',
    cost: 1,
    owner: 'player',
    effect: { kind: 'attack', amount: [4, 6, 9] },
  },
  parry: {
    name: 'Parry',
    direction: 'defense',
    cost: 1,
    owner: 'player',
    effect: { kind: 'block', amount: [4, 6, 9] },
  },
  whetstone: {
    name: 'Whetstone',
    direction: 'growth',
    cost: 1,
    owner: 'player',
    effect: { kind: 'grow', target: 'next', amount: [1, 2, 3] },
  },
  echo: {
    name: 'Echo',
    direction: 'flow',
    cost: 2,
    owner: 'player',
    // Acts as a copy of the previous card, in its own slot (R-13). The upgraded effect is not decided; merging (T07) is not built.
    effect: { kind: 'copy', target: 'previous' },
  },
  'dummy-swing': {
    name: 'Straw Swing',
    direction: 'attack',
    cost: 0,
    owner: 'enemy',
    effect: { kind: 'attack', amount: [3, 3, 3] },
  },
} as const satisfies Record<string, CardDef>;

export type CardId = keyof typeof CARDS;
