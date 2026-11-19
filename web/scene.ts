// Scene preview page: draws hand-built board moments from web/scenes.ts with the game's own
// drawing code, frozen in time, so how something looks can be checked without playing to it.
// `scene.html` shows every scene; `scene.html?id=<id>` shows one.
// It also records every piece of text drawn on a canvas, so `npm run scenes` can report the
// smallest text size on screen and any text drawn outside its canvas.
import '@fontsource/alegreya/600.css';
import '@fontsource/alegreya/700.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import './style.css';
import { cardDef, createBattle, enemyDef, type CardInstance, type EnemyId, type Level, type Owner, type Slot } from '../engine/index.ts';
import { BOARD, drawBoard } from './board.ts';
import { handCanvas, look, watchHand } from './look.ts';
import type { SceneReport, TextMark, TextOverlap } from './scene-report.ts';
import { SCENES, type CardRef, type SceneSpec } from './scenes.ts';

const ENEMY_ID: EnemyId = 'training-dummy';
// Starting HP comes from the engine, not a copy of the rule table.
const opening = createBattle({ enemyId: ENEMY_ID, seed: 1 });
const DEFAULT_HP: Record<Owner, number> = { player: opening.player.hp, enemy: opening.enemy.hp };

declare global {
  interface Window {
    __sceneReport?: SceneReport;
  }
}

function instance(ref: CardRef, uid: string): CardInstance {
  const [cardId, level]: readonly [string, Level] = typeof ref === 'string' ? [ref, 1] : ref;
  cardDef(cardId); // throws on an unknown id
  return { uid, cardId, level };
}

function line(spec: SceneSpec, side: Owner): Slot[] {
  const refs = side === 'player' ? spec.playerLine : spec.enemyLine;
  return refs.map((ref, i) => (ref === null ? null : instance(ref, `${side}-${i + 1}`)));
}

/** Text as drawn, before the page has laid the canvas out. */
interface RawMark {
  readonly scene: string;
  readonly kind: TextMark['canvas'];
  readonly el: HTMLCanvasElement;
  readonly text: string;
  /** Font size in backing-store pixels (after the context transform). */
  readonly backingPx: number;
  readonly clipped: boolean;
  /** Ink box in backing-store pixels. */
  readonly box: Box;
}

interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Wraps fillText so every call is recorded with its size and whether it leaves the canvas. */
function recordText(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, scene: string, kind: TextMark['canvas'], marks: RawMark[]): void {
  const original = ctx.fillText.bind(ctx);
  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    original(text, x, y, maxWidth);
    const m = ctx.measureText(text);
    const t = ctx.getTransform();
    const sizeMatch = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
    const fontPx = sizeMatch === null ? 0 : Number(sizeMatch[1]);
    const corners = [
      new DOMPoint(x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent),
      new DOMPoint(x + m.actualBoundingBoxRight, y + m.actualBoundingBoxDescent),
    ].map((p) => p.matrixTransform(t));
    const clipped = corners.some((p) => p.x < 0 || p.y < 0 || p.x > canvas.width || p.y > canvas.height);
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    if (text.trim() !== '') marks.push({ scene, kind, el: canvas, text, backingPx: fontPx * Math.hypot(t.a, t.b), clipped, box });
  };
}

/** Pairs of text on the same canvas whose ink overlaps by more than a pixel each way. */
function overlapsOf(raw: readonly RawMark[]): TextOverlap[] {
  const out: TextOverlap[] = [];
  raw.forEach((a, i) => {
    for (const b of raw.slice(i + 1)) {
      if (a.el !== b.el) continue;
      const w = Math.min(a.box.x1, b.box.x1) - Math.max(a.box.x0, b.box.x0);
      const h = Math.min(a.box.y1, b.box.y1) - Math.max(a.box.y0, b.box.y0);
      if (w > 1 && h > 1) out.push({ scene: a.scene, a: a.text, b: b.text });
    }
  });
  return out;
}

/** Converts recorded sizes to CSS pixels on screen, now that every canvas has its laid-out width. */
function onScreen(raw: readonly RawMark[]): TextMark[] {
  return raw.map((r) => ({
    scene: r.scene,
    canvas: r.kind,
    text: r.text,
    screenPx: Math.round(((r.backingPx * r.el.clientWidth) / r.el.width) * 10) / 10,
    clipped: r.clipped,
  }));
}

function renderScene(spec: SceneSpec, host: HTMLElement, marks: RawMark[], motion: boolean): void {
  const article = document.createElement('article');
  article.className = 'scene';
  article.id = `scene-${spec.id}`;
  article.dataset['scene'] = spec.id;
  const title = document.createElement('h2');
  const link = document.createElement('a');
  link.href = `?id=${encodeURIComponent(spec.id)}`;
  link.textContent = spec.title;
  title.append(link);
  const note = document.createElement('p');
  note.className = 'scene-look';
  note.textContent = spec.look;

  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'scene-board';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${spec.title}: ${spec.look}`);
  wrap.append(canvas);

  const hand = document.createElement('div');
  hand.className = 'hand';
  // The article goes into the page first, so a scene that fails below still has an element to screenshot.
  article.append(title, note, wrap);
  host.append(article);
  const handCards = (spec.hand ?? []).map((ref, i) => instance(ref, `hand-${i + 1}`));

  // Size the backing store after the canvas is in the page, as the game does.
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(BOARD.width * dpr);
  canvas.height = Math.round(BOARD.height * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('No 2D canvas');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lines = { player: line(spec, 'player'), enemy: line(spec, 'enemy') };
  const firing = new Map<string, number>();
  for (const f of spec.firing ?? []) {
    const card = lines[f.side][f.slot - 1];
    if (card === null || card === undefined) throw new Error(`${spec.id}: firing slot ${f.side} ${f.slot} is empty`);
    firing.set(card.uid, f.glow);
  }
  const hp = (side: Owner) => {
    const [now, max, before] = spec.hp?.[side] ?? [DEFAULT_HP[side], DEFAULT_HP[side]];
    return before === undefined ? { now, max } : { now, max, before };
  };
  recordText(canvas, ctx, spec.id, 'board', marks);
  const draw = (handTray: boolean) => drawBoard(ctx, {
    seed: spec.seed,
    time: spec.time ?? 1000,
    motion,
    enemyId: ENEMY_ID,
    enemyName: enemyDef(ENEMY_ID).name,
    hp: { player: hp('player'), enemy: hp('enemy') },
    lines,
    look,
    cursor: spec.cursor ?? null,
    firing,
    targets: new Set(spec.targets ?? []),
    hoverSlot: spec.hover ?? null,
    impacts: spec.impacts ?? [],
    handTray,
  });
  // The hand moves between the tray and below the board as the board resizes; redraw to match,
  // dropping the old drawing's text marks so the report describes only what is on screen.
  draw(
    watchHand(hand, wrap, { after: wrap }, (inTray) => {
      for (let i = marks.length - 1; i >= 0; i--) if (marks[i]?.el === canvas) marks.splice(i, 1);
      ctx.clearRect(0, 0, BOARD.width, BOARD.height);
      draw(inTray);
    }),
  );

  handCards.forEach((card, i) => {
    const holder = document.createElement('div');
    holder.className = 'card';
    if (spec.selected === i) holder.setAttribute('aria-pressed', 'true');
    holder.append(handCanvas(card, spec.selected === i, (c, hctx) => recordText(c, hctx, spec.id, 'hand', marks)));
    hand.append(holder);
  });
}

async function main(): Promise<void> {
  const host = document.getElementById('scenes');
  if (host === null) throw new Error('Missing #scenes');
  const params = new URL(window.location.href).searchParams;
  const id = params.get('id');
  const chosen = id === null ? SCENES : SCENES.filter((s) => s.id === id);
  const errors: string[] = [];
  if (chosen.length === 0) errors.push(`No scene with id "${id ?? ''}". Known: ${SCENES.map((s) => s.id).join(', ')}`);
  // Fonts must be loaded before drawing, or canvas text falls back and the picture changes.
  // Load every face the board uses, or canvas text falls back and the picture and measurements change.
  await Promise.all(
    ['600 16px "Alegreya"', '700 16px "Alegreya"', '400 16px "Alegreya Sans"', '500 16px "Alegreya Sans"', '700 16px "Alegreya Sans"'].map((f) =>
      document.fonts.load(f),
    ),
  );
  await document.fonts.ready;
  const motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const marks: RawMark[] = [];
  for (const spec of chosen) {
    try {
      renderScene(spec, host, marks, motion);
    } catch (err) {
      errors.push(`${spec.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const e of errors) {
    const p = document.createElement('p');
    p.className = 'scene-error';
    p.setAttribute('role', 'alert');
    p.textContent = e;
    host.append(p);
  }
  window.__sceneReport = { ready: true, scenes: chosen.map((s) => s.id), marks: onScreen(marks), overlaps: overlapsOf(marks), errors };
}

main().catch((err: unknown) => {
  // Always publish a report, so the screenshot script records the failure instead of timing out.
  window.__sceneReport = { ready: true, scenes: [], marks: [], overlaps: [], errors: [`page: ${err instanceof Error ? err.message : String(err)}`] };
});
