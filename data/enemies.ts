// The enemy table. Enemy numbers live here and nowhere else.
import type { EnemyDef } from '../engine/types.ts';
import type { CardId } from './cards.ts';

type EnemyTable = Record<string, EnemyDef & { readonly line: readonly (CardId | null)[] }>;

export const ENEMIES = {
  'training-rig': {
    name: 'Training Rig',
    hp: 24,
    line: [null, 'piston', null, 'piston'],
  },
} as const satisfies EnemyTable;

export type EnemyId = keyof typeof ENEMIES;
