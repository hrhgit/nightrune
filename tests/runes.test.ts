// Every card in the table has a rune glyph for the web board (partial A-1, icon completeness).
import { describe, expect, it } from 'vitest';
import { CARDS } from '../data/cards.ts';
import { RUNES } from '../web/runes.ts';

describe('A-1 every card has a rune', () => {
  for (const id of Object.keys(CARDS)) {
    it(`${id} has at least one stroke inside the -1..1 box`, () => {
      const strokes = RUNES[id];
      expect(strokes, `add a rune for ${id} in web/runes.ts`).toBeDefined();
      expect(strokes?.length).toBeGreaterThan(0);
      for (const stroke of strokes ?? []) {
        expect(stroke.length).toBeGreaterThanOrEqual(2);
        for (const [x, y] of stroke) {
          expect(Math.abs(x)).toBeLessThanOrEqual(1);
          expect(Math.abs(y)).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});
