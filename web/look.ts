// How engine objects look on the board. Shared by the game page and the scene preview page,
// so a preview shows exactly the words and numbers the game shows.
import { cardDef, type CardInstance } from '../engine/index.ts';
import { cardValue } from '../present/text.ts';
import { BOARD, drawStone, handTrayRect, STONE, type StoneLook } from './board.ts';

export function look(card: CardInstance): StoneLook {
  const def = cardDef(card.cardId);
  return { name: def.name, direction: def.direction, cost: def.owner === 'player' ? def.cost : null, value: cardValue(card), level: card.level };
}

/** Board units of a hand card canvas: extra margin so the jagged outline, notches and shadow are not clipped. */
export const HAND_CANVAS = { w: STONE.w, h: STONE.h + 12 } as const;

/** A canvas showing one hand card, as the hand row draws it. */
export function handCanvas(
  card: CardInstance,
  selected: boolean,
  /** Called with the context before drawing; the scene page uses it to record text. */
  prepare?: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(HAND_CANVAS.w * dpr);
  c.height = Math.round(HAND_CANVAS.h * dpr);
  const cctx = c.getContext('2d');
  if (cctx !== null) {
    prepare?.(c, cctx);
    cctx.scale(dpr, dpr);
    drawStone(cctx, { x: 10, y: 8, w: STONE.w - 20, h: STONE.h - 12 }, card, look(card), {
      glow: selected ? 0.8 : 0,
      highlight: 'none',
      pulse: 1,
      key: card.uid,
    });
  }
  return c;
}

/**
 * Wide screens show the hand in the tray drawn on the board; narrow ones show it below the board,
 * where the cards can be big enough to read. Keep in step with the 720px breakpoint in style.css.
 */
export const trayQuery = window.matchMedia('(min-width: 721px)');

/**
 * Put the hand in the board's tray (wide screens) or just after `below` (narrow screens).
 * Returns whether the board should draw the tray. Re-run when trayQuery changes.
 */
export function placeHand(hand: HTMLElement, wrap: HTMLElement, below: { before: HTMLElement } | { after: HTMLElement }): boolean {
  if (trayQuery.matches) {
    const t = handTrayRect();
    hand.classList.add('in-tray');
    hand.style.left = `${(t.x / BOARD.width) * 100}%`;
    hand.style.top = `${(t.y / BOARD.height) * 100}%`;
    hand.style.width = `${(t.w / BOARD.width) * 100}%`;
    hand.style.height = `${(t.h / BOARD.height) * 100}%`;
    if (hand.parentElement !== wrap) wrap.append(hand);
    return true;
  }
  hand.classList.remove('in-tray');
  hand.style.removeProperty('left');
  hand.style.removeProperty('top');
  hand.style.removeProperty('width');
  hand.style.removeProperty('height');
  if ('before' in below) below.before.before(hand);
  else below.after.after(hand);
  return false;
}
