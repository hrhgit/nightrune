// Starting deck. The design's starter deck is 4 Slash, 3 Parry, 1 Whetstone, 1 Echo, 1 Scout
// (10 cards). Until the remaining cards are built, each missing card is stood in for by Slash;
// each ticket that adds one of them swaps it back in here.
import type { CardId } from './cards.ts';

export const STARTER_DECK: readonly CardId[] = [
  'slash', 'slash', 'slash', 'slash',
  'parry', 'parry', 'parry',
  'whetstone',
  'slash', // stand-in for Echo (T05)
  'slash', // stand-in for Scout (T08)
];
