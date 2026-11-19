// Canvas drawing for the battlefield. Draws what it is given; it never decides a rule.
// Visual randomness (stars, trees, stone grain, fire flicker) comes from the battle seed so the
// same seed always looks the same.
//
// Feedback when a slot fires is drawn from the engine's own block and damage events (`impacts`):
// a bolt leaves the attacking stone, a ward lights on the defending stone if it blocked, and what
// gets through flies on to the defending figure, which flinches while its HP bar drains.
// Every number shown comes from an event payload; nothing here adds or subtracts rule values.
import { nextUint32, type CardInstance, type GameEvent, type Owner, type Slot } from '../engine/index.ts';
import { drawEnemyFigure, drawWayfarer, type Reaction } from './figures.ts';
import { DIRECTION_GLOW, PALETTE } from './palette.ts';
import { RUNES } from './runes.ts';

export const BOARD = { width: 960, height: 540 } as const;
export const STONE = { w: 128, h: 116 } as const;
/*
 * Layout: the player stands on the left, the enemy on the right. Above each head is that side's
 * line: four stones, slot 1 to 4 from left to right, the actions it takes this round. Slot i of
 * one line meets slot i of the other. Between the line and the head is the HP plaque. The
 * campfire sits between the two figures, and the hand tray along the bottom middle.
 */
/** A stone on a line (smaller than a hand card). */
const SLOT_STONE = { w: 104, h: 94 } as const;
const SLOT_GAP = 4;
/** Centre x of each side's line and its y. */
const LINE_CX: Record<Owner, number> = { player: 226, enemy: 734 };
const LINE_Y = 82;
const slotX = (side: Owner, slot: number): number => LINE_CX[side] + (slot - 2.5) * (SLOT_STONE.w + SLOT_GAP);
/** Where the treeline meets the ground. */
const HORIZON_Y = 300;
const FIGURE: Record<Owner, { readonly x: number; readonly y: number; readonly size: number }> = {
  player: { x: 226, y: 404, size: 182 },
  enemy: { x: 734, y: 404, size: 176 },
};
const HP_PLAQUE = { w: 214, h: 46 } as const;
const HP_Y = LINE_Y + SLOT_STONE.h / 2 + 12;
const FIRE = { x: 480, y: 384, scale: 0.64 } as const;
/** The hand tray, bottom middle. The page lays the hand's buttons over it (see handTrayRect). */
const HAND_TRAY = { x: 236, y: 418, w: 488, h: 118 } as const;

/** The hand tray in board units, for placing the HTML hand over it. */
export function handTrayRect(): { x: number; y: number; w: number; h: number } {
  return { ...HAND_TRAY };
}

/** Phases of one impact, as fractions of its life (0 = event fired, 1 = gone). */
const PHASE = { bolt: 0.28, through: 0.5 } as const;

/** A block or damage event from the engine, and how far through its animation it is. */
export interface Impact {
  readonly event: Extract<GameEvent, { type: 'damage' } | { type: 'block' }>;
  /** 0 when the event fired, 1 when its marks are gone. */
  readonly age: number;
}

export interface StoneLook {
  readonly name: string;
  readonly direction: keyof typeof DIRECTION_GLOW;
  readonly cost: number | null;
  readonly value: number;
  readonly level: number;
}

export interface Scene {
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

/** Rectangle of a slot in board coordinates, used to place the HTML slot buttons. */
export function slotRect(side: Owner, slot: number): { x: number; y: number; w: number; h: number } {
  const cx = slotX(side, slot);
  return { x: cx - SLOT_STONE.w / 2, y: LINE_Y - SLOT_STONE.h / 2, w: SLOT_STONE.w, h: SLOT_STONE.h };
}

const other = (side: Owner): Owner => (side === 'player' ? 'enemy' : 'player');

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

function drawSky(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON_Y + 20);
  g.addColorStop(0, PALETTE.skyHigh);
  g.addColorStop(1, PALETTE.sky);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BOARD.width, HORIZON_Y + 20);

  // Moon with a soft halo, top right, behind the treeline.
  const mx = 480;
  const my = 150;
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

  const v = seededFor(`stars:${scene.seed}`, 90 * 4);
  for (let i = 0; i < 90; i++) {
    const at = (k: number): number => v[i * 4 + k] ?? 0;
    const x = at(0) * BOARD.width;
    const y = Math.pow(at(1), 1.4) * (HORIZON_Y - 6);
    const twinkle = scene.motion ? 0.7 + 0.3 * Math.sin(scene.time * 0.0016 + at(3) * 6.28) : 1;
    ctx.globalAlpha = (0.25 + at(2) * 0.6) * twinkle;
    ctx.fillStyle = PALETTE.text;
    ctx.beginPath();
    ctx.arc(x, y, 0.5 + at(2) * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Two rows of pine silhouettes along the horizon. */
function drawTreeline(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const rows: [string, number, number, number][] = [
    [PALETTE.treelineNear, HORIZON_Y - 2, 46, 34],
    [PALETTE.treeline, HORIZON_Y + 8, 58, 26],
  ];
  rows.forEach(([color, base, height, count], row) => {
    const v = seededFor(`trees:${row}:${scene.seed}`, count * 3);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, base + 14);
    for (let i = 0; i <= count; i++) {
      const x = (i / count) * BOARD.width + ((v[i * 3] ?? 0.5) - 0.5) * 18;
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
    ctx.lineTo(BOARD.width, base + 14);
    ctx.closePath();
    ctx.fill();
  });
}

function drawGround(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const top = HORIZON_Y + 14;
  const g = ctx.createLinearGradient(0, top, 0, BOARD.height);
  g.addColorStop(0, PALETTE.groundFar);
  g.addColorStop(0.35, PALETTE.ground);
  g.addColorStop(1, PALETTE.groundFar);
  ctx.fillStyle = g;
  ctx.fillRect(0, top, BOARD.width, BOARD.height - top);

  // Moss patches, pebbles and grass tufts, all seeded.
  const v = seededFor(`ground:${scene.seed}`, 40 * 4 + 50 * 3 + 60 * 3);
  let k = 0;
  const next = (): number => v[k++] ?? 0.5;
  for (let i = 0; i < 40; i++) {
    const x = next() * BOARD.width;
    const y = top + 10 + next() * (BOARD.height - top - 10);
    const r = 18 + next() * 46;
    ctx.fillStyle = rgba(next() > 0.5 ? PALETTE.moss : PALETTE.mossLight, 0.35);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 50; i++) {
    const x = next() * BOARD.width;
    const y = top + 8 + next() * (BOARD.height - top - 8);
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
  ctx.strokeStyle = PALETTE.mossLight;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  const sway = scene.motion ? Math.sin(scene.time * 0.0012) * 1.5 : 0;
  for (let i = 0; i < 60; i++) {
    const x = next() * BOARD.width;
    const y = top + 12 + next() * (BOARD.height - top - 12);
    const h = 4 + next() * 7;
    ctx.beginPath();
    for (const lean of [-0.5, 0, 0.6]) {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + lean * 2, y - h * 0.6, x + lean * 4 + sway, y - h);
    }
    ctx.stroke();
  }

  // Edge darkening, so the eye stays on the stones.
  const vig = ctx.createRadialGradient(BOARD.width * 0.55, BOARD.height * 0.55, 160, BOARD.width * 0.55, BOARD.height * 0.55, 620);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, BOARD.width, BOARD.height);
}

/** The campfire: light on the ground first (drawn early), then the fire itself (drawn later). */
function fireFlicker(scene: Scene): { t: number; flicker: number; p2: number } {
  const [p1 = 0, p2 = 0, p3 = 0] = seededFor(`fire:${scene.seed}`, 3).map((x) => x * Math.PI * 2);
  const t = scene.motion ? scene.time : 0;
  return { t, p2, flicker: 0.5 * Math.sin(t * 0.011 + p1) + 0.3 * Math.sin(t * 0.023 + p2) + 0.2 * Math.sin(t * 0.037 + p3) };
}

function drawFirelight(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { flicker } = fireFlicker(scene);
  const glow = ctx.createRadialGradient(FIRE.x, FIRE.y, 10, FIRE.x, FIRE.y, 300 + flicker * 14);
  glow.addColorStop(0, 'rgba(255, 150, 70, 0.30)');
  glow.addColorStop(0.5, 'rgba(255, 130, 60, 0.10)');
  glow.addColorStop(1, 'rgba(255, 150, 70, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, BOARD.width, BOARD.height);
}

function drawCampfire(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { t, flicker, p2 } = fireFlicker(scene);
  ctx.save();
  ctx.translate(FIRE.x, FIRE.y);
  ctx.scale(FIRE.scale, FIRE.scale);

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

    const runeColor = mix(PALETTE.runeDim, edge, Math.max(0.22, opts.glow));
    drawRune(ctx, card.cardId, x + w / 2, y + h / 2 - 6, Math.min(w, h) * 0.25, runeColor, opts.glow);

    // Name on a darker band along the bottom.
    ctx.fillStyle = 'rgba(10,12,20,0.35)';
    ctx.fillRect(x + 8, y + h - h * 0.25, w - 16, h * 0.19);
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${Math.round(h * 0.125)}px "Alegreya Sans", sans-serif`;
    ctx.fillText(look.name, x + w / 2, y + h - h * 0.1);

    // Value in a carved medallion, top right, ringed in the direction color.
    const mr = h * 0.15;
    const mx = x + w - mr - 6;
    const my = y + mr + 6;
    const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 1, mx, my, mr);
    mg.addColorStop(0, '#2B3140');
    mg.addColorStop(1, '#171B26');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = mix(PALETTE.text, edge, 0.35);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(h * 0.18)}px "Alegreya", serif`;
    ctx.fillText(String(look.value), mx, my + 1);
    ctx.textBaseline = 'alphabetic';

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

function drawHp(ctx: CanvasRenderingContext2D, side: Owner, label: string, hp: { now: number; max: number }, lostFrom: number | null, lostFade: number): void {
  const { w, h } = HP_PLAQUE;
  const x = LINE_CX[side] - w / 2;
  const y = HP_Y;
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
  const barW = 122;
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
    for (let slot = 1; slot <= 4; slot++) {
      const active = scene.cursor === slot;
      const r = slotRect(side, slot);
      const cx = r.x + r.w / 2;
      if (active) {
        // A soft band behind the slot that acts now, on both lines.
        const g = ctx.createRadialGradient(cx, LINE_Y, 10, cx, LINE_Y, r.w * 0.8);
        g.addColorStop(0, 'rgba(255, 201, 74, 0.28)');
        g.addColorStop(1, 'rgba(255, 201, 74, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(r.x - 20, r.y - 24, r.w + 40, r.h + 48);
      }
      // Slot number on a small disc above the stone.
      const ny = r.y - 13;
      ctx.fillStyle = active ? 'rgba(255,201,74,0.25)' : 'rgba(10,12,20,0.55)';
      ctx.beginPath();
      ctx.arc(cx, ny, 11, 0, Math.PI * 2);
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

function drawHandTray(ctx: CanvasRenderingContext2D): void {
  const { x, y, w, h } = HAND_TRAY;
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

interface Pt {
  readonly x: number;
  readonly y: number;
}

/** Where a strike starts, meets the defending stone, and ends on the defending figure. */
function strikePath(s: Strike): { from: Pt; arc: Pt; ward: Pt; bend: Pt; chest: Pt } {
  const fromX = slotX(other(s.defender), s.slot);
  const toX = slotX(s.defender, s.slot);
  const fig = FIGURE[s.defender];
  const lowY = LINE_Y + SLOT_STONE.h / 2;
  return {
    from: { x: fromX, y: lowY - 6 },
    // The bolt dips under the HP plaques, across the middle of the camp.
    arc: { x: (fromX + toX) / 2, y: lowY + 150 },
    ward: { x: toX, y: lowY + 4 },
    bend: { x: (toX + fig.x) / 2, y: lowY + 50 },
    chest: { x: fig.x, y: fig.y - fig.size * 0.55 },
  };
}

function quadPoint(a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

function comet(ctx: CanvasRenderingContext2D, head: { x: number; y: number }, tail: { x: number; y: number }, color: string, r: number, alpha: number): void {
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

/** A curved rune shield under the defending stone, facing the incoming bolt. */
function drawStoneWard(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, facingUp: boolean, strength: number): void {
  if (strength <= 0) return;
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.strokeStyle = DIRECTION_GLOW.defense;
  ctx.shadowColor = DIRECTION_GLOW.defense;
  ctx.shadowBlur = 20;
  ctx.lineCap = 'round';
  const r = SLOT_STONE.w * 0.62;
  const cy = at.y + (facingUp ? r * 0.72 : -r * 0.72);
  const mid = facingUp ? -Math.PI / 2 : Math.PI / 2;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(at.x, cy, r, mid - 0.75, mid + 0.75);
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
    ctx.lineTo(ax + Math.cos(mid + a) * 7, ay + Math.sin(mid + a) * 7);
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
 * With motion: the bolt travels (0..bolt), meets the ward (bolt), the rest flies on to the
 * figure (bolt..through), and the labels stay until the impact is removed.
 * Without motion: nothing moves; the whole path is drawn faintly at once and every label shows.
 */
function drawStrikes(ctx: CanvasRenderingContext2D, strikes: readonly Strike[], motion: boolean): void {
  const attack = DIRECTION_GLOW.attack;
  for (const s of strikes) {
    const p = strikePath(s);
    const age = motion ? s.age : PHASE.through;
    const fade = motion ? 1 - window01(s.age, 0.75, 1) : 1;

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
      drawStoneWard(ctx, p.ward, false, shown * fade * (motion ? 1 - 0.4 * window01(age, PHASE.bolt, 1) : 0.85));
      // Over the stone itself: the label belongs to the stone that blocked.
      const rise = motion ? window01(age, PHASE.bolt, 1) * 8 : 0;
      strikeLabel(ctx, `Blocked ${s.blocked}`, p.ward.x, LINE_Y + 10 - rise, DIRECTION_GLOW.defense, 20, shown * fade, motion ? 1 - window01(age, PHASE.bolt, PHASE.bolt + 0.12) : 0);
    }
    if (s.dealt > 0) {
      const shown = motion ? window01(age, PHASE.through - 0.04, PHASE.through) : 1;
      const fig = FIGURE[s.defender];
      const rise = motion ? window01(age, PHASE.through, 1) * 18 : 0;
      // Beside the head, on the side away from the middle so it never meets the other figure's label.
      const out = s.defender === 'player' ? -1 : 1;
      strikeLabel(ctx, `−${s.dealt}`, fig.x + out * 112, fig.y - fig.size * 0.62 - rise, PALETTE.flame, 34, shown * fade, motion ? 1 - window01(age, PHASE.through, PHASE.through + 0.15) : 0);
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
  const strikes = strikesOf(scene.impacts);
  drawSky(ctx, scene);
  drawTreeline(ctx, scene);
  drawGround(ctx, scene);
  drawFirelight(ctx, scene);
  if (scene.handTray) drawHandTray(ctx);
  drawCursorTrack(ctx, scene);
  const pulse = scene.motion ? 0.5 + 0.5 * Math.sin(scene.time * 0.006) : 1;
  for (const side of ['enemy', 'player'] as const) {
    scene.lines[side].forEach((card, i) => {
      const slot = i + 1;
      const isTarget = side === 'player' && scene.targets.has(slot);
      const highlight = isTarget ? (scene.hoverSlot === slot ? 'hover' : 'target') : 'none';
      drawStone(ctx, slotRect(side, slot), card, card === null ? null : scene.look(card), {
        glow: card === null ? 0 : (scene.firing.get(card.uid) ?? 0),
        highlight,
        pulse,
        key: `${side}${slot}`,
      });
    });
  }
  drawEnemyFigure(ctx, scene.enemyId, { ...FIGURE.enemy, time: scene.time, motion: scene.motion, reaction: reactionOf('enemy', strikes, scene.motion) });
  drawCampfire(ctx, scene);
  drawWayfarer(ctx, { ...FIGURE.player, time: scene.time, motion: scene.motion, reaction: reactionOf('player', strikes, scene.motion) });
  for (const side of ['enemy', 'player'] as const) {
    const hp = scene.hp[side];
    // Until the bolt reaches the figure, keep showing the HP from before the hit.
    const landed = !hitInFlight(side, scene.impacts, scene.motion) || hp.before === undefined;
    const shown = landed ? hp : { now: hp.before ?? hp.now, max: hp.max };
    drawHp(ctx, side, side === 'player' ? 'You' : scene.enemyName, shown, landed ? (hp.before ?? null) : null, hpLostFade(side, scene.impacts, scene.motion));
  }
  drawStrikes(ctx, strikes, scene.motion);
}
