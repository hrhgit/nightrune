// Where things go on the board, in board units. Pure numbers: no canvas and no DOM, so tests can
// check them (tests/layout.test.ts).
//
// Two layouts draw the same battle. `WIDE` puts the two lines side by side above the figures and
// suits a board at least BOARD_FIT.tallBelowPx wide on screen. `TALL` stacks them, the enemy's line
// along the top and the player's along the bottom, so that on a phone the four stones of a line
// span the whole width instead of less than half of it.
import type { Owner } from '../engine/index.ts';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** A stone on a line (smaller than a hand card). */
export const SLOT_STONE = { w: 104, h: 94 } as const;
export const SLOT_GAP = 4;
/** The slot number sits on a disc this far above a stone's top edge, with this radius. */
export const SLOT_NUMBER = { above: 13, r: 11 } as const;

export interface BoardLayout {
  readonly id: 'wide' | 'tall';
  readonly width: number;
  readonly height: number;
  /** Centre of each side's line: slot 1 to 4 from left to right. */
  readonly lines: Record<Owner, Pt>;
  /** Where the treeline meets the ground. */
  readonly horizonY: number;
  /** Each figure's feet and height. */
  readonly figure: Record<Owner, { readonly x: number; readonly y: number; readonly size: number }>;
  readonly hp: Record<Owner, Rect>;
  readonly moon: Pt;
  readonly fire: { readonly x: number; readonly y: number; readonly scale: number };
  /** The tray the page lays the hand over, or null when this layout never holds the hand. */
  readonly handTray: Rect | null;
  /** Where "−N" appears when a figure is hit, and its font size. */
  readonly hitLabel: Record<Owner, { readonly x: number; readonly y: number; readonly px: number }>;
  /** The picture in words, for the canvas's label. */
  readonly description: string;
}

const WIDE_FIGURE = { player: { x: 226, y: 404, size: 182 }, enemy: { x: 734, y: 404, size: 176 } } as const;

export const WIDE: BoardLayout = {
  id: 'wide',
  width: 960,
  height: 540,
  lines: { player: { x: 226, y: 82 }, enemy: { x: 734, y: 82 } },
  horizonY: 300,
  figure: WIDE_FIGURE,
  hp: { player: { x: 119, y: 141, w: 214, h: 46 }, enemy: { x: 627, y: 141, w: 214, h: 46 } },
  moon: { x: 480, y: 150 },
  fire: { x: 480, y: 384, scale: 0.64 },
  handTray: { x: 236, y: 418, w: 488, h: 118 },
  // Beside the head, on the side away from the middle, so the two labels never meet.
  hitLabel: {
    player: { x: WIDE_FIGURE.player.x - 112, y: WIDE_FIGURE.player.y - WIDE_FIGURE.player.size * 0.62, px: 34 },
    enemy: { x: WIDE_FIGURE.enemy.x + 112, y: WIDE_FIGURE.enemy.y - WIDE_FIGURE.enemy.size * 0.62, px: 34 },
  },
  description: 'you on the left, the enemy on the right, each with a line of four slots above their head.',
};

const TALL_FIGURE = { player: { x: 112, y: 384, size: 150 }, enemy: { x: 328, y: 384, size: 146 } } as const;

export const TALL: BoardLayout = {
  id: 'tall',
  width: 440,
  height: 530,
  lines: { player: { x: 220, y: 467 }, enemy: { x: 220, y: 78 } },
  horizonY: 292,
  figure: TALL_FIGURE,
  // Both plaques share one band under the enemy's line, each above its own figure, as on the wide
  // board. A band of its own for the player's plaque would make the board 50 units taller.
  hp: { player: { x: 10, y: 132, w: 200, h: 46 }, enemy: { x: 230, y: 132, w: 200, h: 46 } },
  moon: { x: 220, y: 210 },
  fire: { x: 220, y: 368, scale: 0.5 },
  handTray: null,
  hitLabel: {
    player: { x: 34, y: TALL_FIGURE.player.y - TALL_FIGURE.player.size * 0.62, px: 28 },
    enemy: { x: 406, y: TALL_FIGURE.enemy.y - TALL_FIGURE.enemy.size * 0.62, px: 28 },
  },
  description: "you on the left, the enemy on the right; the enemy's line of four slots runs along the top and yours along the bottom.",
};

export const LAYOUTS: readonly BoardLayout[] = [WIDE, TALL];

/** Centre x of a slot's stone. */
export function slotX(layout: BoardLayout, side: Owner, slot: number): number {
  return layout.lines[side].x + (slot - 2.5) * (SLOT_STONE.w + SLOT_GAP);
}

/** Rectangle of a slot's stone, also used to place the HTML slot buttons. */
export function slotRect(layout: BoardLayout, side: Owner, slot: number): Rect {
  return { x: slotX(layout, side, slot) - SLOT_STONE.w / 2, y: layout.lines[side].y - SLOT_STONE.h / 2, w: SLOT_STONE.w, h: SLOT_STONE.h };
}

const other = (side: Owner): Owner => (side === 'player' ? 'enemy' : 'player');

/** The path of a strike against `defender` in `slot`, as two curves: stone to stone, then on to the figure. */
export interface StrikePath {
  /** Leaves the attacking stone here. */
  readonly from: Pt;
  /** Control point of the curve from `from` to `ward`. */
  readonly arc: Pt;
  /** Meets the defending stone here; a block shows its ward at this point. */
  readonly ward: Pt;
  /** Control point of the curve from `ward` to `chest`. */
  readonly bend: Pt;
  /** Ends on the defending figure. */
  readonly chest: Pt;
  /** True when the strike reaches the defending stone from above, so the ward faces up. */
  readonly wardFacesUp: boolean;
}

export function strikePath(layout: BoardLayout, defender: Owner, slot: number): StrikePath {
  const attacker = other(defender);
  const fromX = slotX(layout, attacker, slot);
  const toX = slotX(layout, defender, slot);
  const fromY = layout.lines[attacker].y;
  const toY = layout.lines[defender].y;
  const half = SLOT_STONE.h / 2;
  const fig = layout.figure[defender];
  const chest = { x: fig.x, y: fig.y - fig.size * 0.55 };
  let from: Pt;
  let arc: Pt;
  let ward: Pt;
  if (fromY === toY) {
    // Lines side by side: the bolt leaves the bottom of one stone, dips under the HP plaques across
    // the middle of the camp, and comes up under the other.
    const lowY = toY + half;
    from = { x: fromX, y: lowY - 6 };
    arc = { x: (fromX + toX) / 2, y: lowY + 150 };
    ward = { x: toX, y: lowY + 4 };
  } else {
    // Lines stacked: slot i faces slot i across the camp. The two directions bow to opposite sides,
    // so a slot where both sides attack shows two bolts, not one.
    const down = toY > fromY ? 1 : -1;
    from = { x: fromX, y: fromY + down * (half - 6) };
    arc = { x: (fromX + toX) / 2 + down * 46, y: (fromY + toY) / 2 };
    ward = { x: toX, y: toY - down * (half + 4) };
  }
  const toFigure = chest.y > ward.y ? 1 : -1;
  return { from, arc, ward, bend: { x: (toX + fig.x) / 2, y: ward.y + toFigure * 46 }, chest, wardFacesUp: arc.y < ward.y };
}

/** Which layout a board gets, and whether the hand sits in its tray, from the width available to it. */
export interface BoardFit {
  readonly layout: BoardLayout;
  /** The widest the board is shown, in CSS pixels, or null for "as wide as its container". */
  readonly maxWidthPx: number | null;
  /** True when the hand's buttons are laid over the board's tray; false when the hand goes below the board. */
  readonly handInTray: boolean;
}

export const BOARD_FIT = {
  /** Below this available width the tall layout is used. */
  tallBelowPx: 700,
  /** The tall board is not shown wider than this, or it would be taller than most screens. */
  tallMaxPx: 480,
  /**
   * The hand sits in the wide board's tray only when the board is at least this wide on screen; a
   * narrower board would shrink the cards' names below readable size, so the hand goes below it.
   */
  trayFromPx: 880,
} as const;

export function fitFor(availablePx: number): BoardFit {
  if (availablePx < BOARD_FIT.tallBelowPx) return { layout: TALL, maxWidthPx: BOARD_FIT.tallMaxPx, handInTray: false };
  return { layout: WIDE, maxWidthPx: null, handInTray: availablePx >= BOARD_FIT.trayFromPx };
}
