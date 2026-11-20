// Board layouts (web/layout.ts): where the lines, plaques, figures and strike paths go in the wide
// and the tall board, and which of the two a board gets from the width it has on screen.
// These are the numbers the canvas draws from and the page places its slot buttons from.
import { describe, expect, it } from 'vitest';
import { BOARD_FIT, fitFor, LAYOUTS, SLOT_NUMBER, SLOT_STONE, slotRect, strikePath, TALL, WIDE, type BoardLayout, type Rect } from '../web/layout.ts';

const SIDES = ['player', 'enemy'] as const;
const SLOTS = [1, 2, 3, 4] as const;

const inside = (L: BoardLayout, r: Rect): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= L.width && r.y + r.h <= L.height;
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** The disc that carries a slot's number, as a box. */
const numberDisc = (stone: Rect): Rect => ({
  x: stone.x + stone.w / 2 - SLOT_NUMBER.r,
  y: stone.y - SLOT_NUMBER.above - SLOT_NUMBER.r,
  w: SLOT_NUMBER.r * 2,
  h: SLOT_NUMBER.r * 2,
});
/** The eight stones of a layout with their number discs. */
const stonesOf = (L: BoardLayout): { name: string; stone: Rect; disc: Rect }[] =>
  SIDES.flatMap((side) => SLOTS.map((slot) => ({ name: `${side} ${slot}`, stone: slotRect(L, side, slot), disc: numberDisc(slotRect(L, side, slot)) })));

describe.each(LAYOUTS.map((L) => [L.id, L] as const))('the %s board', (_id, L) => {
  it('keeps every stone, number disc, plaque, tray and hit label inside the board', () => {
    for (const { name, stone, disc } of stonesOf(L)) {
      expect(inside(L, stone), `${name} stone`).toBe(true);
      expect(inside(L, disc), `${name} number`).toBe(true);
    }
    for (const side of SIDES) {
      expect(inside(L, L.hp[side]), `${side} plaque`).toBe(true);
      const label = L.hitLabel[side];
      // A hit label is centred on its point; "−99" is under two digits' worth wider than its font size.
      expect(inside(L, { x: label.x - label.px, y: label.y - label.px, w: label.px * 2, h: label.px * 1.5 }), `${side} hit label`).toBe(true);
    }
    if (L.handTray !== null) expect(inside(L, L.handTray)).toBe(true);
  });

  it('never puts two stones, or a stone and a number disc or plaque, on the same spot', () => {
    const all = stonesOf(L);
    all.forEach((a, i) => {
      for (const b of all.slice(i + 1)) {
        expect(overlap(a.stone, b.stone), `${a.name} and ${b.name}`).toBe(false);
        expect(overlap(a.stone, b.disc), `${a.name} and the number of ${b.name}`).toBe(false);
        expect(overlap(a.disc, b.stone), `the number of ${a.name} and ${b.name}`).toBe(false);
      }
      for (const side of SIDES) {
        expect(overlap(a.stone, L.hp[side]), `${a.name} and the ${side} plaque`).toBe(false);
        expect(overlap(a.disc, L.hp[side]), `the number of ${a.name} and the ${side} plaque`).toBe(false);
      }
      if (L.handTray !== null) expect(overlap(a.stone, L.handTray), `${a.name} and the hand tray`).toBe(false);
    });
    expect(overlap(L.hp.player, L.hp.enemy)).toBe(false);
  });

  it('stands both figures on the ground, the player on the left', () => {
    for (const side of SIDES) {
      expect(L.figure[side].y).toBeGreaterThan(L.horizonY);
      expect(L.figure[side].y).toBeLessThanOrEqual(L.height);
    }
    expect(L.figure.player.x).toBeLessThan(L.fire.x);
    expect(L.fire.x).toBeLessThan(L.figure.enemy.x);
  });

  it('runs every strike from the attacking stone to the defending stone and on to the defending figure', () => {
    for (const defender of SIDES) {
      const attacker = defender === 'player' ? 'enemy' : 'player';
      for (const slot of SLOTS) {
        const p = strikePath(L, defender, slot);
        const from = slotRect(L, attacker, slot);
        const to = slotRect(L, defender, slot);
        const name = `${attacker} ${slot} at ${defender}`;
        // Leaves from inside the attacking stone's edge, in that stone's column.
        expect(p.from.x, name).toBe(from.x + from.w / 2);
        expect(p.from.y, name).toBeGreaterThanOrEqual(from.y);
        expect(p.from.y, name).toBeLessThanOrEqual(from.y + from.h);
        // Meets the defending stone just outside one of its two horizontal edges, in its column.
        expect(p.ward.x, name).toBe(to.x + to.w / 2);
        expect(Math.min(Math.abs(p.ward.y - to.y), Math.abs(p.ward.y - (to.y + to.h))), name).toBeLessThanOrEqual(4);
        expect(p.ward.y > to.y && p.ward.y < to.y + to.h, name).toBe(false);
        // Ends on the defender's body.
        const fig = L.figure[defender];
        expect(p.chest.x, name).toBe(fig.x);
        expect(p.chest.y, name).toBeLessThan(fig.y);
        expect(p.chest.y, name).toBeGreaterThan(fig.y - fig.size);
        for (const pt of [p.from, p.arc, p.ward, p.bend, p.chest]) expect(inside(L, { ...pt, w: 0, h: 0 }), name).toBe(true);
      }
    }
  });
});

describe('the wide board', () => {
  it('has the two lines side by side, and a strike dips under the plaques between them', () => {
    expect(WIDE.lines.player.y).toBe(WIDE.lines.enemy.y);
    const p = strikePath(WIDE, 'enemy', 1);
    expect(p).toEqual({ from: { x: 64, y: 123 }, arc: { x: 318, y: 279 }, ward: { x: 572, y: 133 }, bend: { x: 653, y: 179 }, chest: { x: 734, y: 404 - 176 * 0.55 }, wardFacesUp: false });
    expect(p.arc.y).toBeGreaterThan(WIDE.hp.player.y + WIDE.hp.player.h);
  });

  it('is the only layout with a hand tray', () => {
    expect(WIDE.handTray).not.toBeNull();
    expect(TALL.handTray).toBeNull();
  });
});

describe('the tall board', () => {
  it('stacks the lines, the enemy at the top and the player at the bottom, each across the whole width', () => {
    expect(TALL.lines.enemy.y).toBeLessThan(TALL.lines.player.y);
    for (const side of SIDES) {
      const left = slotRect(TALL, side, 1).x;
      const right = slotRect(TALL, side, 4);
      expect(left).toBeLessThanOrEqual(12);
      expect(TALL.width - (right.x + right.w)).toBeLessThanOrEqual(12);
    }
  });

  it('faces slot i with slot i, and shows the two directions of one slot as two different curves', () => {
    for (const slot of SLOTS) {
      const down = strikePath(TALL, 'player', slot);
      const up = strikePath(TALL, 'enemy', slot);
      expect(down.from.x).toBe(down.ward.x);
      expect(down.from.y).toBeLessThan(down.ward.y);
      expect(up.from.y).toBeGreaterThan(up.ward.y);
      expect(down.arc.x).not.toBe(up.arc.x);
      // The ward faces the bolt: up on the player's stone, down on the enemy's.
      expect(down.wardFacesUp).toBe(true);
      expect(up.wardFacesUp).toBe(false);
    }
  });
});

describe('which board a width gets', () => {
  it('is tall below the threshold and wide from it', () => {
    expect(fitFor(BOARD_FIT.tallBelowPx - 1).layout).toBe(TALL);
    expect(fitFor(BOARD_FIT.tallBelowPx).layout).toBe(WIDE);
    expect(fitFor(320).layout).toBe(TALL);
    expect(fitFor(1320).layout).toBe(WIDE);
  });

  it('puts the hand in the tray only on a wide board at least trayFromPx across', () => {
    expect(fitFor(BOARD_FIT.trayFromPx - 1)).toMatchObject({ layout: WIDE, handInTray: false, maxWidthPx: null });
    expect(fitFor(BOARD_FIT.trayFromPx)).toMatchObject({ layout: WIDE, handInTray: true, maxWidthPx: null });
    expect(fitFor(BOARD_FIT.tallBelowPx - 1)).toMatchObject({ handInTray: false, maxWidthPx: BOARD_FIT.tallMaxPx });
  });

  it('gives a phone a slot to tap of at least 44 CSS pixels each way, at any width from 320', () => {
    // Widths a board can have: the tall board up to its cap, then the wide board from the threshold.
    for (let available = 320; available <= 1320; available += 1) {
      const fit = fitFor(available);
      const shown = Math.min(available, fit.maxWidthPx ?? available);
      const scale = shown / fit.layout.width;
      expect(SLOT_STONE.w * scale, `width at ${available}`).toBeGreaterThanOrEqual(44);
      expect(SLOT_STONE.h * scale, `height at ${available}`).toBeGreaterThanOrEqual(44);
    }
  });

  it('shows a line stone on a 375 px phone at more than twice the size the wide board would', () => {
    const available = 375 - 2 * 16; // the page's side padding on a phone
    const tall = (SLOT_STONE.w * available) / TALL.width;
    const wide = (SLOT_STONE.w * available) / WIDE.width;
    expect(fitFor(available).layout).toBe(TALL);
    expect(tall / wide).toBeGreaterThan(2);
  });
});
