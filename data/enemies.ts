// The enemy table. Enemy numbers live here and nowhere else.
import type { EnemyDef } from '../engine/types.ts';
import type { CardId } from './cards.ts';

type EnemyTable = Record<string, EnemyDef & { readonly line: readonly (CardId | null)[] }>;

export const ENEMIES = {
  'training-dummy': {
    name: 'Training Dummy',
    hp: 24,
    line: [null, 'dummy-swing', null, 'dummy-swing'],
  },
} as const satisfies EnemyTable;

export type EnemyId = keyof typeof ENEMIES;
