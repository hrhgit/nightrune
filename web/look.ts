// How engine objects look on the board. Shared by the game page and the scene preview page,
// so a preview shows exactly the words and numbers the game shows.
import { cardDef, type CardInstance } from '../engine/index.ts';
import { cardEffectParts } from '../present/text.ts';
import { BOARD, drawStone, handTrayRect, STONE, type StoneLook } from './board.ts';

export function look(card: CardInstance): StoneLook {
  const def = cardDef(card.cardId);
  return { name: def.name, direction: def.direction, cost: def.owner === 'player' ? def.cost : null, effect: cardEffectParts(card), level: card.level };
}

/** Board units of a hand card canvas: extra margin so the jagged outline, notches and shadow are not clipped. */
export const HAND_CANVAS = { w: STONE.w, h: STONE.h + 12 } as const;

/** Where the stone sits on a hand card canvas, in board units. */
export const HAND_STONE_BOX = { x: 10, y: 8, w: STONE.w - 20, h: STONE.h - 12 } as const;

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
    drawStone(cctx, HAND_STONE_BOX, card, look(card), {
      glow: selected ? 0.8 : 0,
      highlight: 'none',
      pulse: 1,
      key: card.uid,
    });
  }
  return c;
}

/**
 * The hand sits in the tray drawn on the board only when the board is at least this wide on screen;
 * a narrower board would shrink the cards' names below readable size, so the hand goes below it.
 */
export const TRAY_MIN_BOARD_PX = 880;

type Below = { readonly before: HTMLElement } | { readonly after: HTMLElement };

function placeHand(hand: HTMLElement, wrap: HTMLElement, below: Below, inTray: boolean): void {
  if (inTray) {
    const t = handTrayRect();
    hand.classList.add('in-tray');
    hand.style.left = `${(t.x / BOARD.width) * 100}%`;
    hand.style.top = `${(t.y / BOARD.height) * 100}%`;
    hand.style.width = `${(t.w / BOARD.width) * 100}%`;
    hand.style.height = `${(t.h / BOARD.height) * 100}%`;
    // Before the end-of-battle dialog, so the dialog covers the hand and its cards cannot be clicked.
    wrap.insertBefore(hand, wrap.querySelector('.end'));
    return;
  }
  hand.classList.remove('in-tray');
  for (const prop of ['left', 'top', 'width', 'height']) hand.style.removeProperty(prop);
  if ('before' in below) below.before.before(hand);
  else below.after.after(hand);
}

/**
 * Put the hand in the board's tray or below the board, by the board's width on screen, and keep it
 * there as the board resizes. `changed` is called with the new choice whenever it flips.
 * Returns the initial choice: whether the board should draw the tray.
 */
export function watchHand(hand: HTMLElement, wrap: HTMLElement, below: Below, changed: (inTray: boolean) => void): boolean {
  const wide = () => wrap.getBoundingClientRect().width >= TRAY_MIN_BOARD_PX;
  let inTray = wide();
  placeHand(hand, wrap, below, inTray);
  new ResizeObserver(() => {
    const next = wide();
    if (next === inTray) return;
    inTray = next;
    placeHand(hand, wrap, below, inTray);
    changed(inTray);
  }).observe(wrap);
  return inTray;
}
