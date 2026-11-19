// Scaffold-only setup: a fixed player line until drawing and placement exist (T02).
import type { CardId } from './cards.ts';

export const SCAFFOLD_PLAYER_LINE: readonly (CardId | null)[] = ['slash', null, 'slash', null];
