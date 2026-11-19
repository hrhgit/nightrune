// How engine objects look on the board. Shared by the game page and the scene preview page,
// so a preview shows exactly the words and numbers the game shows.
import { cardDef, type CardInstance, type Owner } from '../engine/index.ts';
import { cardValue } from '../present/text.ts';
import { drawStone, STONE, type Floater, type StoneLook } from './board.ts';
import type { FloaterSource } from './scenes.ts';

export function look(card: CardInstance): StoneLook {
  const def = cardDef(card.cardId);
  return { name: def.name, direction: def.direction, cost: def.owner === 'player' ? def.cost : null, value: cardValue(card), level: card.level };
}

/** The label an event puts over a stone. Damage and block labels show with or without motion. */
export function floaterFor(e: FloaterSource): Omit<Floater, 'age'> {
  const side: Owner = e.type === 'damage' ? e.target : e.side;
  return e.type === 'damage'
    ? { side, slot: e.slot, kind: 'damage', text: `−${e.amount}` }
    : { side, slot: e.slot, kind: 'block', text: `Blocked ${e.blocked}` };
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
