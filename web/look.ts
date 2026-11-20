// How engine objects look on the board. Shared by the game page and the scene preview page,
// so a preview shows exactly the words and numbers the game shows.
import { cardDef, type CardInstance } from '../engine/index.ts';
import { cardEffectParts } from '../present/text.ts';
import { drawStone, STONE, type StoneLook } from './board.ts';
import { fitFor, type BoardFit, type BoardLayout } from './layout.ts';

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

type Below = { readonly before: HTMLElement } | { readonly after: HTMLElement };

/** The parts of a page that hold one board. */
export interface BoardHost {
  /**
   * The element whose width decides the fit. It must be the board's container, not the board: a
   * tall board is narrower than its container, and measuring the board would keep it tall for good.
   */
  readonly measured: HTMLElement;
  /** The box around the canvas; an in-tray hand is placed inside it. */
  readonly wrap: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly hand: HTMLElement;
  /** Where the hand goes when it is not in the tray. */
  readonly below: Below;
}

function applyFit(host: BoardHost, fit: BoardFit): void {
  const { wrap, canvas, hand, below } = host;
  const L = fit.layout;
  wrap.dataset['layout'] = L.id;
  wrap.style.maxWidth = fit.maxWidthPx === null ? '' : `${fit.maxWidthPx}px`;
  canvas.style.aspectRatio = `${L.width} / ${L.height}`;
  if (fit.handInTray && L.handTray !== null) {
    const t = L.handTray;
    hand.classList.add('in-tray');
    hand.style.left = `${(t.x / L.width) * 100}%`;
    hand.style.top = `${(t.y / L.height) * 100}%`;
    hand.style.width = `${(t.w / L.width) * 100}%`;
    hand.style.height = `${(t.h / L.height) * 100}%`;
    // Before the end-of-battle dialog, so the dialog covers the hand and its cards cannot be clicked.
    if (hand.parentElement !== wrap) wrap.insertBefore(hand, wrap.querySelector('.end'));
    return;
  }
  if (!hand.classList.contains('in-tray') && hand.isConnected) return;
  hand.classList.remove('in-tray');
  for (const prop of ['left', 'top', 'width', 'height']) hand.style.removeProperty(prop);
  if ('before' in below) below.before.before(hand);
  else below.after.after(hand);
}

/**
 * Picks the board's layout and the hand's place from the width available (fitFor), applies them,
 * and keeps them right as the page resizes. Returns the first fit. `resized` is called after every
 * resize of `measured`, whether or not the fit changed: the caller sizes the canvas and redraws.
 */
export function watchBoard(host: BoardHost, resized: (fit: BoardFit) => void): BoardFit {
  const measure = (): BoardFit => fitFor(host.measured.clientWidth);
  let fit = measure();
  applyFit(host, fit);
  new ResizeObserver(() => {
    const next = measure();
    if (next.layout !== fit.layout || next.handInTray !== fit.handInTray) applyFit(host, next);
    fit = next;
    resized(fit);
  }).observe(host.measured);
  return fit;
}

/** A board canvas never gets more pixels across than this, however large the screen. */
const BOARD_MAX_PX = 2560;

/**
 * Gives a board canvas as many pixels as it shows on screen, so a small board is not drawn large
 * and scaled down. Returns true when the size changed, which also clears the canvas: draw again.
 * Pixels per board unit are then `canvas.width / layout.width`.
 */
export function sizeBoardCanvas(canvas: HTMLCanvasElement, layout: BoardLayout): boolean {
  const dpr = window.devicePixelRatio || 1;
  // Before the canvas is laid out its width on screen is 0; use the board's own size until then.
  const shown = canvas.clientWidth > 0 ? canvas.clientWidth : layout.width;
  const width = Math.max(1, Math.min(BOARD_MAX_PX, Math.round(shown * dpr)));
  const height = Math.max(1, Math.round((width * layout.height) / layout.width));
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}
