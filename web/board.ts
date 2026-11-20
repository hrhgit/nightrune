// Canvas drawing for the battlefield. Draws what it is given; it never decides a rule.
// Visual randomness (stars, trees, stone grain, fire flicker) comes from the battle seed so the
// same seed always looks the same.
//
// Feedback when a slot fires is drawn from the engine's own block and damage events (`impacts`):
// a bolt leaves the attacking stone, a ward lights on the defending stone if it blocked, and what
// gets through flies on to the defending figure, which flinches while its HP bar drains.
// Every number shown comes from an event payload; nothing here adds or subtracts rule values.
import { nextUint32, type CardInstance, type GameEvent, type Owner, type Slot } from '../engine/index.ts';
import type { EffectPart } from '../present/text.ts';
import { cardFaceLayout, layoutCardText, type Box, type CardTextLayout } from './card-face.ts';
import { drawEnemyFigure, drawWayfarer, type Reaction } from './figures.ts';
import { SLOT_NUMBER, SLOT_STONE, slotRect, slotX, strikePath, WARD, WIDE, type BoardLayout, type Pt, type Rect } from './layout.ts';
import { DIRECTION_GLOW, PALETTE } from './palette.ts';
import { RUNES } from './runes.ts';

/** A hand card's stone. Stones on a line are smaller (SLOT_STONE in layout.ts). */
export const STONE = { w: 128, h: 116 } as const;
/*
 * Where everything sits comes from the scene's layout (web/layout.ts). In both layouts the player
 * stands on the left and the enemy on the right with the campfire between them; slot i of one line
 * meets slot i of the other.
 */

/** Phases of one impact, as fractions of its life (0 = event fired, 1 = gone). */
const PHASE = { bolt: 0.28, through: 0.5 } as const;

/** A block or damage event from the engine, and how far through its animation it is. */
export interface Impact {
  readonly event: Extract<GameEvent, { type: 'damage' } | { type: 'block' } | { type: 'grow' } | { type: 'copy' } | { type: 'fizzle' }>;
  /** 0 when the event fired, 1 when its marks are gone. */
  readonly age: number;
}

export interface StoneLook {
  readonly name: string;
  readonly direction: keyof typeof DIRECTION_GLOW;
  readonly cost: number | null;
  /** What the card does, from present/text.ts; its value part is drawn in its own weight and color. */
  readonly effect: readonly EffectPart[];
  readonly level: number;
}

export interface Scene {
  /** Where things go; the page picks it from the board's width on screen. */
  readonly layout: BoardLayout;
  readonly seed: number;
  readonly time: number;
  readonly motion: boolean;
  readonly enemyId: string;
  readonly enemyName: string;
  /** `before`: HP shown before the latest hit, so the bar can show what was just lost. */
  readonly hp: Record<Owner, { readonly now: number; readonly max: number; readonly before?: number }>;
  readonly lines: Record<Owner, readonly Slot[]>;
  readonly look: (card: CardInstance) => StoneLook;
  /** Active column of the turn-order cursor, 1-based, or null when not running. */
  readonly cursor: number | null;
  /** uids that are firing now, with glow strength 0..1. */
  readonly firing: ReadonlyMap<string, number>;
  /** Player slots that accept the selected card (from the engine), 1-based. */
  readonly targets: ReadonlySet<number>;
  readonly hoverSlot: number | null;
  readonly impacts: readonly Impact[];
  /** Draw the hand tray; false when the page shows the hand below the board (narrow screens). */
  readonly handTray: boolean;
}

// ---------------------------------------------------------------------------
// Seeded helpers
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** n seeded numbers in [0, 1). */
function seeded(seed: number, n: number): number[] {
  const out: number[] = [];
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    const r = nextUint32(s);
    s = r.state;
    out.push(r.value / 2 ** 32);
  }
  return out;
}

/** Seeded numbers for a key, cached: scenery is drawn every frame and must not change. */
const seededCache = new Map<string, number[]>();
function seededFor(key: string, n: number): number[] {
  const hit = seededCache.get(key);
  if (hit !== undefined && hit.length >= n) return hit;
  const v = seeded(hashString(key), n);
  if (seededCache.size > 512) seededCache.clear();
  seededCache.set(key, v);
  return v;
}

function mix(hexA: string, hexB: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(hexA.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(hexB.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + ((pb[i] ?? v) - v) * t));
  return `rgb(${c.join(',')})`;
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r ?? 0},${g ?? 0},${b ?? 0},${a})`;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
/** Progress of `age` through the window [from, to], 0..1. */
const window01 = (age: number, from: number, to: number): number => clamp01((age - from) / (to - from));
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------
//
// Sky, moon, treeline and ground are the same in every frame, so they are painted once into two
// layers and copied onto the board each frame: `back` (sky and moon) and `front` (trees and
// ground, clear above the trees). Stars twinkle between the two and grass sways over the front
// one, so those are still drawn every frame. The darkening toward the board's edges is painted
// into both layers; stars and grass take the same darkening from vignetteDim, because nothing is
// painted over them any more.

/** The edge darkening: none inside r0 of the centre, strongest (alpha `max`) from r1 outward. */
function vignetteOf(L: BoardLayout): { cx: number; cy: number; r0: number; r1: number; max: number } {
  const s = Math.max(L.width, L.height) / WIDE.width;
  return { cx: L.width * 0.55, cy: L.height * 0.55, r0: 160 * s, r1: 620 * s, max: 0.45 };
}

/** How much of a color the edge darkening leaves at a point: 1 in the middle, less toward the corners. */
function vignetteDim(L: BoardLayout, x: number, y: number): number {
  const v = vignetteOf(L);
  return 1 - v.max * window01(Math.hypot(x - v.cx, y - v.cy), v.r0, v.r1);
}

/** Darkens what is already painted on a layer, and leaves its clear parts clear. */
function paintVignette(ctx: CanvasRenderingContext2D, L: BoardLayout): void {
  const v = vignetteOf(L);
  const g = ctx.createRadialGradient(v.cx, v.cy, v.r0, v.cx, v.cy, v.r1);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${v.max})`);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.width, L.height);
  ctx.restore();
}

/** A hex color with each channel multiplied by k (0..1). */
function dim(hex: string, k: number): string {
  const c = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k));
  return `rgb(${c.join(',')})`;
}

function paintSky(ctx: CanvasRenderingContext2D, L: BoardLayout): void {
  const g = ctx.createLinearGradient(0, 0, 0, L.horizonY + 20);
  g.addColorStop(0, PALETTE.skyHigh);
  g.addColorStop(1, PALETTE.sky);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.width, L.horizonY + 20);

  // Moon with a soft halo, behind the treeline.
  const { x: mx, y: my } = L.moon;
  const halo = ctx.createRadialGradient(mx, my, 8, mx, my, 90);
  halo.addColorStop(0, rgba(PALETTE.moon, 0.22));
  halo.addColorStop(1, rgba(PALETTE.moon, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 90, 0, 180, my + 90);
  ctx.fillStyle = PALETTE.moon;
  ctx.beginPath();
  ctx.arc(mx, my, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(PALETTE.pebble, 0.35);
  for (const [dx, dy, r] of [
    [-4, -3, 3.2],
    [5, 4, 2.2],
    [3, -7, 1.4],
  ] as const) {
    ctx.beginPath();
    ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

interface Star {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly alpha: number;
  readonly phase: number;
  readonly color: string;
}

/** Scenery details that are worked out once per layout and seed, then drawn every frame. */
const detailCache = new Map<string, unknown>();
function details<T>(key: string, build: () => T): T {
  if (detailCache.has(key)) return detailCache.get(key) as T;
  if (detailCache.size > 16) detailCache.clear();
  const v = build();
  detailCache.set(key, v);
  return v;
}

function starsOf(L: BoardLayout, seed: number): readonly Star[] {
  return details(`stars:${L.id}:${seed}`, () => {
    // As many stars per unit of width as the wide board has.
    const count = Math.round((90 * L.width) / WIDE.width);
    const v = seededFor(`stars:${seed}`, count * 4);
    return Array.from({ length: count }, (_, i): Star => {
      const at = (k: number): number => v[i * 4 + k] ?? 0;
      const x = at(0) * L.width;
      const y = Math.pow(at(1), 1.4) * (L.horizonY - 6);
      return { x, y, r: 0.5 + at(2) * 1.1, alpha: 0.25 + at(2) * 0.6, phase: at(3) * 6.28, color: dim(PALETTE.text, vignetteDim(L, x, y)) };
    });
  });
}

function drawStars(ctx: CanvasRenderingContext2D, scene: Scene): void {
  for (const s of starsOf(scene.layout, scene.seed)) {
    const twinkle = scene.motion ? 0.7 + 0.3 * Math.sin(scene.time * 0.0016 + s.phase) : 1;
    ctx.globalAlpha = s.alpha * twinkle;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Two rows of pine silhouettes along the horizon. */
function paintTreeline(ctx: CanvasRenderingContext2D, L: BoardLayout, seed: number): void {
  const rows: [string, number, number, number][] = [
    [PALETTE.treelineNear, L.horizonY - 2, 46, 34],
    [PALETTE.treeline, L.horizonY + 8, 58, 26],
  ];
  rows.forEach(([color, base, height, perWideBoard], row) => {
    const count = Math.round((perWideBoard * L.width) / WIDE.width);
    // One tree more than there are numbers for: the tree on the right edge takes the middle values.
    const v = seededFor(`trees:${row}:${seed}`, count * 3);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, base + 14);
    for (let i = 0; i <= count; i++) {
      const x = (i / count) * L.width + ((v[i * 3] ?? 0.5) - 0.5) * 18;
      const h = height * (0.55 + (v[i * 3 + 1] ?? 0.5) * 0.6);
      const w = 14 + (v[i * 3 + 2] ?? 0.5) * 12;
      // A pine: three stacked tiers.
      ctx.lineTo(x - w, base);
      ctx.lineTo(x - w * 0.45, base - h * 0.42);
      ctx.lineTo(x - w * 0.75, base - h * 0.42);
      ctx.lineTo(x - w * 0.25, base - h * 0.75);
      ctx.lineTo(x - w * 0.45, base - h * 0.75);
      ctx.lineTo(x, base - h);
      ctx.lineTo(x + w * 0.45, base - h * 0.75);
      ctx.lineTo(x + w * 0.25, base - h * 0.75);
      ctx.lineTo(x + w * 0.75, base - h * 0.42);
      ctx.lineTo(x + w * 0.45, base - h * 0.42);
      ctx.lineTo(x + w, base);
    }
    ctx.lineTo(L.width, base + 14);
    ctx.closePath();
    ctx.fill();
  });
}

/** Ground details: counts keep the wide board's density, and one seeded list feeds all three kinds in order. */
function groundOf(L: BoardLayout, seed: number): { top: number; moss: number; pebbles: number; grass: number; v: readonly number[] } {
  const top = L.horizonY + 14;
  const share = (L.width * (L.height - top)) / (WIDE.width * (WIDE.height - (WIDE.horizonY + 14)));
  const moss = Math.round(40 * share);
  const pebbles = Math.round(50 * share);
  const grass = Math.round(60 * share);
  return { top, moss, pebbles, grass, v: seededFor(`ground:${seed}`, moss * 4 + pebbles * 3 + grass * 3) };
}

/** The ground with its moss patches and pebbles, all seeded. Grass is drawn each frame (drawGrass). */
function paintGround(ctx: CanvasRenderingContext2D, L: BoardLayout, seed: number): void {
  const { top, moss, pebbles, v } = groundOf(L, seed);
  const g = ctx.createLinearGradient(0, top, 0, L.height);
  g.addColorStop(0, PALETTE.groundFar);
  g.addColorStop(0.35, PALETTE.ground);
  g.addColorStop(1, PALETTE.groundFar);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, L.width, L.height - top);

  let k = 0;
  const next = (): number => v[k++] ?? 0.5;
  for (let i = 0; i < moss; i++) {
    const x = next() * L.width;
    const y = top + 10 + next() * (L.height - top - 10);
    const r = 18 + next() * 46;
    ctx.fillStyle = rgba(next() > 0.5 ? PALETTE.moss : PALETTE.mossLight, 0.35);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < pebbles; i++) {
    const x = next() * L.width;
    const y = top + 8 + next() * (L.height - top - 8);
    const r = 1.5 + next() * 3.5;
    ctx.fillStyle = PALETTE.pebble;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.25, r * 0.4, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

interface Tuft {
  readonly x: number;
  readonly y: number;
  readonly h: number;
  readonly color: string;
}

function tuftsOf(L: BoardLayout, seed: number): readonly Tuft[] {
  return details(`grass:${L.id}:${seed}`, () => {
    const { top, moss, pebbles, grass, v } = groundOf(L, seed);
    // Grass takes its numbers after the moss and pebbles took theirs.
    let k = moss * 4 + pebbles * 3;
    const next = (): number => v[k++] ?? 0.5;
    return Array.from({ length: grass }, (): Tuft => {
      const x = next() * L.width;
      const y = top + 12 + next() * (L.height - top - 12);
      return { x, y, h: 4 + next() * 7, color: dim(PALETTE.mossLight, vignetteDim(L, x, y)) };
    });
  });
}

function drawGrass(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  const sway = scene.motion ? Math.sin(scene.time * 0.0012) * 1.5 : 0;
  for (const { x, y, h, color } of tuftsOf(scene.layout, scene.seed)) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (const lean of [-0.5, 0, 0.6]) {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean * 2, y - h * 0.6, x + lean * 4 + sway, y - h);
    }
    ctx.stroke();
  }
}

/** The two painted scenery layers for one layout, seed and pixel scale. */
interface Backdrop {
  readonly key: string;
  readonly back: HTMLCanvasElement;
  readonly front: HTMLCanvasElement;
}

let backdrop: Backdrop | null = null;
function paintLayer(L: BoardLayout, scale: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  layer.width = Math.ceil(L.width * scale);
  layer.height = Math.ceil(L.height * scale);
  const ctx = layer.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D is not available');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  paint(ctx);
  paintVignette(ctx, L);
  return layer;
}

/** Draws the scenery up to and including the grass, painting the layers only when layout, seed or scale changed. */
function drawScenery(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const L = scene.layout;
  const t = ctx.getTransform();
  // Layers are painted at the board's own pixel scale, so copying them does not resample.
  const scale = Math.hypot(t.a, t.b);
  const key = `${L.id}:${scene.seed}:${scale}`;
  if (backdrop === null || backdrop.key !== key) {
    backdrop = {
      key,
      back: paintLayer(L, scale, (c) => paintSky(c, L)),
      front: paintLayer(L, scale, (c) => {
        paintTreeline(c, L, scene.seed);
        paintGround(c, L, scene.seed);
      }),
    };
  }
  const copy = (layer: HTMLCanvasElement): void => ctx.drawImage(layer, 0, 0, layer.width / scale, layer.height / scale);
  copy(backdrop.back);
  drawStars(ctx, scene);
  copy(backdrop.front);
  drawGrass(ctx, scene);
}

/** The campfire: light on the ground first (drawn early), then the fire itself (drawn later). */
function fireFlicker(scene: Scene): { t: number; flicker: number; p2: number } {
  const [p1 = 0, p2 = 0, p3 = 0] = seededFor(`fire:${scene.seed}`, 3).map((x) => x * Math.PI * 2);
  const t = scene.motion ? scene.time : 0;
  return { t, p2, flicker: 0.5 * Math.sin(t * 0.011 + p1) + 0.3 * Math.sin(t * 0.023 + p2) + 0.2 * Math.sin(t * 0.037 + p3) };
}

function drawFirelight(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { flicker } = fireFlicker(scene);
  const fire = scene.layout.fire;
  const r = (300 + flicker * 14) * (fire.scale / WIDE.fire.scale);
  const glow = ctx.createRadialGradient(fire.x, fire.y, 10, fire.x, fire.y, r);
  glow.addColorStop(0, 'rgba(255, 150, 70, 0.30)');
  glow.addColorStop(0.5, 'rgba(255, 130, 60, 0.10)');
  glow.addColorStop(1, 'rgba(255, 150, 70, 0)');
  ctx.fillStyle = glow;
  // The glow is clear beyond r, so only its own square is filled, not the whole board.
  ctx.fillRect(fire.x - r, fire.y - r, r * 2, r * 2);
}

function drawCampfire(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { t, flicker, p2 } = fireFlicker(scene);
  const fire = scene.layout.fire;
  ctx.save();
  ctx.translate(fire.x, fire.y);
  ctx.scale(fire.scale, fire.scale);

  // Ring of stones, the back half first.
  const ring = (front: boolean): void => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (Math.sin(a) > 0 !== front) continue;
      const sx = Math.cos(a) * 60;
      const sy = 8 + Math.sin(a) * 16;
      const sg = ctx.createLinearGradient(sx, sy - 9, sx, sy + 9);
      sg.addColorStop(0, PALETTE.stoneLight);
      sg.addColorStop(1, PALETTE.stoneDark);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 14, 9, a * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  ring(false);
  // Embers bed.
  const bed = ctx.createRadialGradient(0, 8, 2, 0, 8, 50);
  bed.addColorStop(0, 'rgba(255,140,60,0.9)');
  bed.addColorStop(1, 'rgba(120,40,20,0)');
  ctx.fillStyle = bed;
  ctx.beginPath();
  ctx.ellipse(0, 8, 50, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  // Crossed logs with bark ends.
  for (const angle of [-0.35, 0.35]) {
    ctx.save();
    ctx.translate(0, 6);
    ctx.rotate(angle);
    ctx.fillStyle = PALETTE.woodDark;
    ctx.beginPath();
    ctx.roundRect(-54, -8, 108, 16, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.wood;
    ctx.fillRect(-46, -6, 92, 3);
    ctx.fillStyle = PALETTE.straw;
    ctx.beginPath();
    ctx.ellipse(angle < 0 ? -54 : 54, 0, 4, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Flames: three nested tongues plus two side licks.
  const layers: [string, number, number, number][] = [
    [PALETTE.flame, 1, 0, 0],
    [PALETTE.flame, 0.55, 1.7, -26],
    [PALETTE.flame, 0.5, 2.4, 24],
    [PALETTE.ember, 0.68, 0.6, 0],
    ['#FFF3C4', 0.36, 1.2, 0],
  ];
  for (const [color, scale, offset, dx] of layers) {
    const h = (100 + flicker * 12) * scale;
    const w = 40 * scale;
    const lean = Math.sin(t * 0.004 + offset + p2) * 7 * scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(dx - w, 4);
    ctx.bezierCurveTo(dx - w * 1.2, -h * 0.45, dx + lean - w * 0.2, -h * 0.7, dx + lean, -h);
    ctx.bezierCurveTo(dx + lean + w * 0.3, -h * 0.65, dx + w * 1.2, -h * 0.45, dx + w, 4);
    ctx.closePath();
    ctx.fill();
  }
  ring(true);

  // Sparks rising on a fixed seeded schedule.
  if (scene.motion) {
    const sparkSeeds = seededFor(`sparks:${scene.seed}`, 16);
    for (let i = 0; i < 8; i++) {
      const period = 1800 + (sparkSeeds[i] ?? 0) * 1400;
      const life = ((t + (sparkSeeds[i + 8] ?? 0) * period) % period) / period;
      ctx.globalAlpha = 1 - life;
      ctx.fillStyle = PALETTE.ember;
      ctx.beginPath();
      ctx.arc(Math.sin(life * 6 + i) * 22, -70 - life * 170, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Stones
// ---------------------------------------------------------------------------

function stoneOutline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, key: string): void {
  const j = seededFor(key, 12).map((v) => (v - 0.5) * 8);
  const at = (i: number): number => j[i] ?? 0;
  // Eight points: four corners cut at an angle, so stones read as hewn rather than as cards.
  const c = 10;
  ctx.beginPath();
  ctx.moveTo(x + c + at(0), y + at(1));
  ctx.lineTo(x + w - c + at(2), y + at(3) * 0.5);
  ctx.lineTo(x + w + at(4) * 0.5, y + c + at(5));
  ctx.lineTo(x + w + at(6) * 0.5, y + h - c + at(7));
  ctx.lineTo(x + w - c + at(8), y + h + at(9) * 0.5);
  ctx.lineTo(x + c + at(10), y + h + at(11) * 0.5);
  ctx.lineTo(x + at(0) * 0.5, y + h - c + at(3));
  ctx.lineTo(x + at(5) * 0.5, y + c + at(9));
  ctx.closePath();
}

function drawRune(ctx: CanvasRenderingContext2D, cardId: string, cx: number, cy: number, size: number, color: string, glow: number): void {
  const strokes = RUNES[cardId];
  const path = (): void => {
    ctx.beginPath();
    if (strokes === undefined) {
      ctx.arc(cx, cy, size * 0.6, 0, Math.PI * 2);
      return;
    }
    for (const stroke of strokes) {
      stroke.forEach(([px, py], i) => {
        const X = cx + px * size;
        const Y = cy + py * size;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
    }
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const width = Math.max(2.5, size * 0.12);
  // The groove: a dark cut with a light lower lip, then the rune light inside it.
  ctx.lineWidth = width + 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.translate(0, -1);
  path();
  ctx.stroke();
  ctx.translate(0, 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  path();
  ctx.stroke();
  ctx.translate(0, -1);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 24 * glow;
  path();
  ctx.stroke();
  ctx.restore();
}

export interface StoneOptions {
  /** 0 = dim, 1 = fully lit. */
  readonly glow: number;
  readonly highlight: 'none' | 'target' | 'hover';
  readonly pulse: number;
  readonly key: string;
}

function drawSocket(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, key: string): void {
  // A shallow pit cut into the ground: dark floor, shadow on the far lip, light on the near lip.
  stoneOutline(ctx, x + 4, y + 4, w - 8, h - 8, `socket:${key}`);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#141821');
  g.addColorStop(1, PALETTE.socket);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 10;
  ctx.translate(0, 4);
  stoneOutline(ctx, x + 4, y + 4, w - 8, h - 8, `socket:${key}`);
  ctx.stroke();
  ctx.restore();
  stoneOutline(ctx, x + 4, y + 4, w - 8, h - 8, `socket:${key}`);
  ctx.strokeStyle = 'rgba(155,163,182,0.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawCostGem(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, '#FFE7A0');
  g.addColorStop(1, '#C98A1E');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.8, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.8, cy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.7);
  ctx.lineTo(cx + r * 0.3, cy - r * 0.1);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
}

/** Plain words of a card's effect text: a little dimmer than the name, so the value stands out. */
const CARD_TEXT_COLOR = mix(PALETTE.text, PALETTE.runeDim, 0.3);

/**
 * Effect text layouts by text and stone size, laid out at the origin and moved to the stone when
 * drawn: the board is redrawn every frame, and wrapping measures the text many times over.
 * Cleared when web fonts finish loading, since widths measured with a fallback font are wrong.
 */
const cardTextCache = new Map<string, CardTextLayout>();
const CARD_TEXT_CACHE_MAX = 256;

export function clearCardTextCache(): void {
  cardTextCache.clear();
}
if (typeof document !== 'undefined') document.fonts.addEventListener('loadingdone', clearCardTextCache);

function cardText(ctx: CanvasRenderingContext2D, effect: StoneLook['effect'], box: Box): CardTextLayout {
  const key = `${box.w}x${box.h}|${effect.map((p) => `${p.kind}:${p.text}`).join('\u0000')}`;
  let rel = cardTextCache.get(key);
  if (rel === undefined) {
    const face = cardFaceLayout({ x: 0, y: 0, w: box.w, h: box.h });
    rel = layoutCardText(effect, face.text, (t, font) => {
      ctx.font = font;
      return ctx.measureText(t).width;
    });
    if (cardTextCache.size >= CARD_TEXT_CACHE_MAX) cardTextCache.clear();
    cardTextCache.set(key, rel);
  }
  return {
    ...rel,
    lines: rel.lines.map((line) => ({
      ...line,
      x: line.x + box.x,
      baseline: line.baseline + box.y,
      runs: line.runs.map((run) => ({ ...run, x: run.x + box.x })),
    })),
  };
}

/** Draws one stone (or an empty socket when `card` is null) centred in the given box. */
export function drawStone(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  card: CardInstance | null,
  look: StoneLook | null,
  opts: StoneOptions,
): void {
  const { x, y, w, h } = box;
  if (card === null || look === null) {
    drawSocket(ctx, x, y, w, h, opts.key);
  } else {
    const edge = DIRECTION_GLOW[look.direction];
    const key = `stone:${card.uid}`;
    // Laid out before anything is drawn, so a card with no effect text throws on a clean canvas.
    const face = cardFaceLayout(box);
    const text = cardText(ctx, look.effect, box);

    // Body with a drop shadow, lit from the top left.
    stoneOutline(ctx, x, y, w, h, key);
    const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
    g.addColorStop(0, PALETTE.stoneLight);
    g.addColorStop(0.55, PALETTE.stone);
    g.addColorStop(1, PALETTE.stoneDark);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    // Grain, a hairline crack, and the bevel: all inside the outline.
    ctx.save();
    stoneOutline(ctx, x, y, w, h, key);
    ctx.clip();
    const grain = seededFor(`grain:${card.uid}`, 30 * 3 + 6);
    for (let i = 0; i < 30; i++) {
      const gx = x + (grain[i * 3] ?? 0) * w;
      const gy = y + (grain[i * 3 + 1] ?? 0) * h;
      ctx.fillStyle = (grain[i * 3 + 2] ?? 0) > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.arc(gx, gy, 0.8 + (grain[i * 3 + 2] ?? 0) * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    const c0 = grain[90] ?? 0.5;
    const c1 = grain[91] ?? 0.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w * (0.65 + c0 * 0.3), y);
    ctx.lineTo(x + w * (0.72 + c1 * 0.1), y + h * 0.18);
    ctx.lineTo(x + w * (0.82 + c0 * 0.1), y + h * 0.3);
    ctx.stroke();
    // Bevel: light along the top-left edges, shadow along the bottom-right.
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.translate(2, 2);
    stoneOutline(ctx, x, y, w, h, key);
    ctx.stroke();
    ctx.translate(-4, -4);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    stoneOutline(ctx, x, y, w, h, key);
    ctx.stroke();
    ctx.restore();

    // Edge in the direction color, brighter while firing.
    stoneOutline(ctx, x, y, w, h, key);
    ctx.save();
    ctx.strokeStyle = edge;
    ctx.globalAlpha = 0.5 + 0.5 * opts.glow;
    ctx.lineWidth = 1.5 + opts.glow * 2;
    if (opts.glow > 0) {
      ctx.shadowColor = edge;
      ctx.shadowBlur = 16 * opts.glow;
    }
    ctx.stroke();
    ctx.restore();

    // Small rune at the top, between the cost gems and the cracked corner.
    const runeColor = mix(PALETTE.runeDim, edge, Math.max(0.22, opts.glow));
    drawRune(ctx, card.cardId, face.rune.cx, face.rune.cy, face.rune.size, runeColor, opts.glow);

    // What the card does, wrapped to the stone. The value is drawn inside the sentence, heavier
    // and in the direction color; the words come from present/text.ts as they are.
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    for (const line of text.lines) {
      for (const run of line.runs) {
        ctx.font = run.font;
        ctx.fillStyle = run.kind === 'value' ? mix(PALETTE.text, edge, 0.6) : CARD_TEXT_COLOR;
        ctx.fillText(run.text, run.x, line.baseline);
      }
    }
    ctx.restore();

    // Name on a darker band along the bottom.
    ctx.fillStyle = 'rgba(10,12,20,0.35)';
    ctx.fillRect(face.nameBand.x, face.nameBand.y, face.nameBand.w, face.nameBand.h);
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${Math.round(h * 0.125)}px "Alegreya Sans", sans-serif`;
    ctx.fillText(look.name, x + w / 2, y + h - h * 0.1);

    // Cost, top left, as amber gems.
    if (look.cost !== null) {
      for (let i = 0; i < look.cost; i++) drawCostGem(ctx, x + w * 0.14 + i * w * 0.1, y + h * 0.16, w * 0.045);
    }

    // Level notches along the bottom edge.
    ctx.strokeStyle = PALETTE.ember;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < look.level; i++) {
      const nx = x + w / 2 + (i - (look.level - 1) / 2) * 9;
      ctx.beginPath();
      ctx.moveTo(nx, y + h - 3);
      ctx.lineTo(nx, y + h + 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (opts.highlight !== 'none') {
    stoneOutline(ctx, x - 5, y - 5, w + 10, h + 10, `hl:${opts.key}`);
    ctx.setLineDash(opts.highlight === 'target' ? [8, 6] : []);
    ctx.strokeStyle = PALETTE.ember;
    ctx.globalAlpha = opts.highlight === 'hover' ? 1 : 0.55 + 0.45 * opts.pulse;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// HP plaques
// ---------------------------------------------------------------------------

function drawHp(ctx: CanvasRenderingContext2D, plaque: Rect, label: string, hp: { now: number; max: number }, lostFrom: number | null, lostFade: number): void {
  const { x, y, w, h } = plaque;
  ctx.fillStyle = 'rgba(10,12,20,0.62)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(155,163,182,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Name on its own row, the bar and numbers below it.
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.text;
  ctx.font = '600 18px "Alegreya", serif';
  ctx.fillText(label, x + 12, y + 19);

  const barX = x + 12;
  const barY = y + 27;
  // The rest of the row holds the numbers, up to "99 / 99".
  const barW = w - 92;
  const barH = 12;
  ctx.fillStyle = '#0E1118';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 6);
  ctx.fill();
  const frac = (v: number): number => (hp.max > 0 ? clamp01(v / hp.max) : 0);
  // What was just lost stays visible as a pale band that fades out.
  if (lostFrom !== null && lostFrom > hp.now && lostFade > 0) {
    ctx.fillStyle = rgba('#FFF3C4', 0.85 * lostFade);
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(12, barW * frac(lostFrom)), barH, 6);
    ctx.fill();
  }
  const f = frac(hp.now);
  if (f > 0) {
    const low = f <= 0.25;
    const bg = ctx.createLinearGradient(0, barY, 0, barY + barH);
    bg.addColorStop(0, low ? '#FF8A6A' : '#FFD872');
    bg.addColorStop(1, low ? PALETTE.flame : '#E0A22E');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(12, barW * f), barH, 6);
    ctx.fill();
  }
  ctx.textAlign = 'right';
  ctx.font = '700 17px "Alegreya Sans", sans-serif';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`${hp.now} / ${hp.max}`, x + w - 12, barY + barH);
}

// ---------------------------------------------------------------------------
// Turn order and impacts
// ---------------------------------------------------------------------------

function drawCursorTrack(ctx: CanvasRenderingContext2D, scene: Scene): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const side of ['player', 'enemy'] as const) {
    const lineY = scene.layout.lines[side].y;
    for (let slot = 1; slot <= scene.lines[side].length; slot++) {
      const active = scene.cursor === slot;
      const r = slotRect(scene.layout, side, slot);
      const cx = r.x + r.w / 2;
      if (active) {
        // A soft band behind the slot that acts now, on both lines.
        const g = ctx.createRadialGradient(cx, lineY, 10, cx, lineY, r.w * 0.8);
        g.addColorStop(0, 'rgba(255, 201, 74, 0.28)');
        g.addColorStop(1, 'rgba(255, 201, 74, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(r.x - 20, r.y - 24, r.w + 40, r.h + 48);
      }
      // Slot number on a small disc above the stone.
      const ny = r.y - SLOT_NUMBER.above;
      ctx.fillStyle = active ? 'rgba(255,201,74,0.25)' : 'rgba(10,12,20,0.55)';
      ctx.beginPath();
      ctx.arc(cx, ny, SLOT_NUMBER.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = active ? PALETTE.ember : 'rgba(155,163,182,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // System sans for slot numbers: Alegreya's old-style 2 reads like a z at this size.
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillStyle = active ? PALETTE.ember : PALETTE.runeDim;
      ctx.fillText(String(slot), cx, ny + 1);
    }
  }
}

function drawHandTray(ctx: CanvasRenderingContext2D, tray: Rect): void {
  const { x, y, w, h } = tray;
  // A low slab of dark wood with a lit front edge.
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(40,30,22,0.9)');
  g.addColorStop(1, 'rgba(20,15,12,0.95)');
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h + 20, 14);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,170,90,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 1);
  ctx.lineTo(x + w - 12, y + 1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (const fy of [0.35, 0.7]) {
    ctx.beginPath();
    ctx.moveTo(x + 16, y + h * fy);
    ctx.lineTo(x + w - 16, y + h * fy + 2);
    ctx.stroke();
  }
}

/** One slot firing at one defender, gathered from that slot's block and damage events. */
interface Strike {
  readonly defender: Owner;
  readonly slot: number;
  /** From the block event, or 0 when there was none. */
  readonly blocked: number;
  /** From the damage event, or 0 when there was none. */
  readonly dealt: number;
  readonly age: number;
}

function strikesOf(impacts: readonly Impact[]): Strike[] {
  const bySlot = new Map<string, { defender: Owner; slot: number; blocked: number; dealt: number; age: number }>();
  for (const { event: e, age } of impacts) {
    if (e.type !== 'damage' && e.type !== 'block') continue;
    const defender = e.type === 'damage' ? e.target : e.side;
    const key = `${defender}:${e.slot}`;
    const s = bySlot.get(key) ?? { defender, slot: e.slot, blocked: 0, dealt: 0, age };
    if (e.type === 'damage') s.dealt = e.amount;
    else s.blocked = e.blocked;
    s.age = Math.min(s.age, age);
    bySlot.set(key, s);
  }
  return [...bySlot.values()];
}

function quadPoint(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

function comet(ctx: CanvasRenderingContext2D, head: Pt, tail: Pt, color: string, r: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(1, rgba(color, 0.9));
  ctx.strokeStyle = g;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 1.6;
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(head.x, head.y);
  ctx.stroke();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#FFF3C4';
  ctx.beginPath();
  ctx.arc(head.x, head.y, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r, 0, Math.PI * 2);
  ctx.globalAlpha = alpha * 0.5;
  ctx.fill();
  ctx.restore();
}

/** A curved rune shield on the edge of the defending stone that the bolt reaches, facing the bolt (WARD in layout.ts). */
function drawStoneWard(ctx: CanvasRenderingContext2D, at: Pt, facingUp: boolean, strength: number): void {
  if (strength <= 0) return;
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.strokeStyle = DIRECTION_GLOW.defense;
  ctx.shadowColor = DIRECTION_GLOW.defense;
  ctx.shadowBlur = 20;
  ctx.lineCap = 'round';
  const r = WARD.r;
  const cy = at.y + (facingUp ? r * WARD.centre : -r * WARD.centre);
  const mid = facingUp ? -Math.PI / 2 : Math.PI / 2;
  ctx.lineWidth = WARD.stroke;
  ctx.beginPath();
  ctx.arc(at.x, cy, r, mid - WARD.halfAngle, mid + WARD.halfAngle);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(at.x, cy, r - 9, mid - 0.6, mid + 0.6);
  ctx.stroke();
  for (const a of [-0.45, 0, 0.45]) {
    const ax = at.x + Math.cos(mid + a) * r;
    const ay = cy + Math.sin(mid + a) * r;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(mid + a) * WARD.tick, ay + Math.sin(mid + a) * WARD.tick);
    ctx.stroke();
  }
  ctx.restore();
}

/** Labels: "Blocked N" beside the ward on the stone, "−N" by the figure that lost HP. */
function strikeLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, px: number, alpha: number, pop: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(px * (1 + 0.25 * pop))}px "Alegreya", serif`;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(8,10,16,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * A strike is drawn in two passes, with the HP plaques between them. With motion: the bolt travels
 * (0..bolt), meets the ward (bolt), the rest flies on to the figure (bolt..through), and the labels
 * stay until the impact is removed. Without motion: nothing moves; the whole path is drawn faintly
 * at once and every label shows.
 *
 * First pass: the bolts, or the still trail. A path can cross a plaque, so this goes under them.
 */
function drawStrikeBolts(ctx: CanvasRenderingContext2D, layout: BoardLayout, strikes: readonly Strike[], motion: boolean): void {
  const attack = DIRECTION_GLOW.attack;
  for (const s of strikes) {
    const p = strikePath(layout, s.defender, s.slot);
    const age = motion ? s.age : PHASE.through;

    if (!motion) {
      // A still trail along the whole path.
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = attack;
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.from.x, p.from.y);
      ctx.quadraticCurveTo(p.arc.x, p.arc.y, p.ward.x, p.ward.y);
      if (s.dealt > 0) ctx.quadraticCurveTo(p.bend.x, p.bend.y, p.chest.x, p.chest.y);
      ctx.stroke();
      ctx.restore();
    } else {
      const t1 = easeOut(window01(age, 0, PHASE.bolt));
      if (t1 > 0 && t1 < 1) comet(ctx, quadPoint(p.from, p.arc, p.ward, t1), quadPoint(p.from, p.arc, p.ward, Math.max(0, t1 - 0.25)), attack, 9, 1);
      const t2 = easeOut(window01(age, PHASE.bolt, PHASE.through));
      if (s.dealt > 0 && t2 > 0 && t2 < 1) {
        // Thinner when part of it was blocked.
        const share = s.dealt / (s.dealt + s.blocked);
        comet(ctx, quadPoint(p.ward, p.bend, p.chest, t2), quadPoint(p.ward, p.bend, p.chest, Math.max(0, t2 - 0.35)), attack, 5 + 5 * share, 1);
      }
    }
  }
}

/** Second pass: the ward and its sparks on the defending stone, and the labels. These go over everything. */
function drawStrikeMarks(ctx: CanvasRenderingContext2D, layout: BoardLayout, strikes: readonly Strike[], motion: boolean): void {
  for (const s of strikes) {
    const p = strikePath(layout, s.defender, s.slot);
    const age = motion ? s.age : PHASE.through;
    const fade = motion ? 1 - window01(s.age, 0.75, 1) : 1;

    if (motion) {
      // Sparks where the bolt hits the ward.
      const t3 = window01(age, PHASE.bolt, PHASE.bolt + 0.25);
      if (s.blocked > 0 && t3 > 0 && t3 < 1) {
        const v = seededFor(`shards:${s.defender}:${s.slot}`, 16);
        ctx.save();
        ctx.globalAlpha = 1 - t3;
        ctx.fillStyle = DIRECTION_GLOW.defense;
        for (let i = 0; i < 8; i++) {
          const a = (v[i] ?? 0) * Math.PI * 2;
          const d = (10 + (v[i + 8] ?? 0) * 34) * easeOut(t3);
          ctx.beginPath();
          ctx.arc(p.ward.x + Math.cos(a) * d, p.ward.y + Math.sin(a) * d * 0.6, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    if (s.blocked > 0) {
      const shown = motion ? window01(age, PHASE.bolt - 0.04, PHASE.bolt) : 1;
      drawStoneWard(ctx, p.ward, p.wardFacesUp, shown * fade * (motion ? 1 - 0.4 * window01(age, PHASE.bolt, 1) : 0.85));
      // Over the stone itself: the label belongs to the stone that blocked.
      const rise = motion ? window01(age, PHASE.bolt, 1) * 8 : 0;
      strikeLabel(ctx, `Blocked ${s.blocked}`, p.ward.x, layout.lines[s.defender].y + 10 - rise, DIRECTION_GLOW.defense, 20, shown * fade, motion ? 1 - window01(age, PHASE.bolt, PHASE.bolt + 0.12) : 0);
    }
    if (s.dealt > 0) {
      const shown = motion ? window01(age, PHASE.through - 0.04, PHASE.through) : 1;
      const at = layout.hitLabel[s.defender];
      const rise = motion ? window01(age, PHASE.through, 1) * 18 : 0;
      strikeLabel(ctx, `−${s.dealt}`, at.x, at.y - rise, PALETTE.flame, at.px, shown * fade, motion ? 1 - window01(age, PHASE.through, PHASE.through + 0.15) : 0);
    }
  }
}

/** How each figure moves, from the strikes against it. */
function reactionOf(side: Owner, strikes: readonly Strike[], motion: boolean): Reaction {
  let hit = 0;
  let block = 0;
  for (const s of strikes) {
    if (s.defender !== side) continue;
    if (s.dealt > 0) hit = Math.max(hit, motion ? (s.age < PHASE.through ? 0 : 1 - window01(s.age, PHASE.through, 1)) : 0.5);
    // A ward on the figure only when nothing got through; a partial block shows on the stone alone.
    if (s.blocked > 0 && s.dealt === 0) block = Math.max(block, motion ? (s.age < PHASE.bolt ? 0 : 0.5 * (1 - window01(s.age, PHASE.bolt, 1))) : 0.35);
  }
  return { hit, block };
}

/** True while a damage bolt against this side has not reached the figure yet (motion only). */
function hitInFlight(side: Owner, impacts: readonly Impact[], motion: boolean): boolean {
  return motion && impacts.some(({ event: e, age }) => e.type === 'damage' && e.target === side && age < PHASE.through);
}

/** How strongly to show the pale "just lost" band on a side's HP bar, from damage against that side. */
function hpLostFade(side: Owner, impacts: readonly Impact[], motion: boolean): number {
  let fade = 0;
  for (const { event: e, age } of impacts) {
    if (e.type !== 'damage' || e.target !== side) continue;
    fade = Math.max(fade, motion ? (age < PHASE.through ? 1 : 1 - window01(age, PHASE.through, 1)) : 1);
  }
  return fade;
}

export function drawBoard(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const L = scene.layout;
  const strikes = strikesOf(scene.impacts);
  drawScenery(ctx, scene);
  drawFirelight(ctx, scene);
  if (scene.handTray && L.handTray !== null) drawHandTray(ctx, L.handTray);
  drawCursorTrack(ctx, scene);
  const pulse = scene.motion ? 0.5 + 0.5 * Math.sin(scene.time * 0.006) : 1;
  for (const side of ['enemy', 'player'] as const) {
    scene.lines[side].forEach((card, i) => {
      const slot = i + 1;
      const isTarget = side === 'player' && scene.targets.has(slot);
      const highlight = isTarget ? (scene.hoverSlot === slot ? 'hover' : 'target') : 'none';
      drawStone(ctx, slotRect(L, side, slot), card, card === null ? null : scene.look(card), {
        glow: card === null ? 0 : (scene.firing.get(card.uid) ?? 0),
        highlight,
        pulse,
        key: `${side}${slot}`,
      });
    });
  }
  drawEnemyFigure(ctx, scene.enemyId, { ...L.figure.enemy, time: scene.time, motion: scene.motion, reaction: reactionOf('enemy', strikes, scene.motion) });
  drawCampfire(ctx, scene);
  drawWayfarer(ctx, { ...L.figure.player, time: scene.time, motion: scene.motion, reaction: reactionOf('player', strikes, scene.motion) });
  // Bolts under the plaques, so a path that crosses one never covers its name or numbers.
  drawStrikeBolts(ctx, L, strikes, scene.motion);
  for (const side of ['enemy', 'player'] as const) {
    const hp = scene.hp[side];
    // Until the bolt reaches the figure, keep showing the HP from before the hit.
    const landed = !hitInFlight(side, scene.impacts, scene.motion) || hp.before === undefined;
    const shown = landed ? hp : { now: hp.before ?? hp.now, max: hp.max };
    drawHp(ctx, L.hp[side], side === 'player' ? 'You' : scene.enemyName, shown, landed ? (hp.before ?? null) : null, hpLostFade(side, scene.impacts, scene.motion));
  }
  drawStrikeMarks(ctx, L, strikes, scene.motion);
  drawGrowth(ctx, L, scene.impacts, scene.motion);
}

/**
 * R-12, R-13, R-14 feedback, from the engine's grow, copy and fizzle events: a spark runs from the
 * source stone to its target and a label rises over the target ("+N" for growth, "copy" for a
 * copy); a fizzled effect shows "fizzles" under its stone.
 */
function drawGrowth(ctx: CanvasRenderingContext2D, layout: BoardLayout, impacts: readonly Impact[], motion: boolean): void {
  for (const { event: e, age } of impacts) {
    if (e.type !== 'grow' && e.type !== 'copy' && e.type !== 'fizzle') continue;
    const fade = motion ? 1 - window01(age, 0.7, 1) : 1;
    const lineY = layout.lines[e.side].y;
    const from = slotX(layout, e.side, e.sourceSlot);
    if (e.type === 'fizzle') {
      strikeLabel(ctx, 'fizzles', from, lineY + 4, PALETTE.text, 19, fade, 0);
      continue;
    }
    const glow = e.type === 'grow' ? DIRECTION_GLOW.growth : DIRECTION_GLOW.flow;
    const to = slotX(layout, e.side, e.type === 'copy' ? e.asSlot : e.targetSlot); // R-13.5: a chain points at the card copied
    const t = motion ? Math.min(1, age / 0.25) : 1;
    const top = lineY - SLOT_STONE.h / 2;
    ctx.save();
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = glow;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from, top + 4);
    ctx.quadraticCurveTo((from + to) / 2, top - 26, from + (to - from) * t, top + 4 - Math.sin(Math.PI * t) * 15 * (1 - t));
    ctx.stroke();
    ctx.restore();
    const label = e.type === 'grow' ? `+${e.amount}` : 'copy';
    if (t >= 1) strikeLabel(ctx, label, to, top - 6 - (motion ? 10 * window01(age, 0.25, 1) : 0), glow, 22, fade, motion ? 1 - window01(age, 0.25, 0.4) : 0);
  }
}
