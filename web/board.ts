// Canvas drawing for the battlefield. Draws what it is given; it never decides a rule.
// Visual randomness (stars, stone outlines, fire flicker) comes from the battle seed so the
// same seed always looks the same.
import { nextUint32, type CardInstance, type Owner, type Slot } from '../engine/index.ts';
import { DIRECTION_GLOW, PALETTE } from './palette.ts';
import { RUNES } from './runes.ts';

export const BOARD = { width: 960, height: 540 } as const;
export const STONE = { w: 128, h: 116 } as const;
const COLUMN_X = [350, 505, 660, 815] as const;
const LINE_Y: Record<Owner, number> = { enemy: 148, player: 394 };
const MID_Y = (LINE_Y.enemy + LINE_Y.player) / 2;

export interface StoneLook {
  readonly name: string;
  readonly direction: keyof typeof DIRECTION_GLOW;
  readonly cost: number | null;
  readonly value: number;
  readonly level: number;
}

export interface Floater {
  readonly side: Owner;
  readonly slot: number;
  readonly text: string;
  /** 0 when spawned, 1 when gone. */
  readonly age: number;
}

export interface Scene {
  readonly seed: number;
  readonly time: number;
  readonly motion: boolean;
  readonly enemyName: string;
  readonly hp: Record<Owner, { readonly now: number; readonly max: number }>;
  readonly lines: Record<Owner, readonly Slot[]>;
  readonly look: (card: CardInstance) => StoneLook;
  /** Active column of the turn-order cursor, 1-based, or null when not running. */
  readonly cursor: number | null;
  /** uids that are firing now, with glow strength 0..1. */
  readonly firing: ReadonlyMap<string, number>;
  /** Player slots that accept the selected card (from the engine), 1-based. */
  readonly targets: ReadonlySet<number>;
  readonly hoverSlot: number | null;
  readonly floaters: readonly Floater[];
}

/** Rectangle of a slot in board coordinates, used to place the HTML slot buttons. */
export function slotRect(side: Owner, slot: number): { x: number; y: number; w: number; h: number } {
  const cx = COLUMN_X[slot - 1] ?? 0;
  return { x: cx - STONE.w / 2, y: LINE_Y[side] - STONE.h / 2, w: STONE.w, h: STONE.h };
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

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  phase: number;
}

let starCache: { seed: number; stars: Star[] } | null = null;

function starsFor(seed: number): Star[] {
  if (starCache?.seed === seed) return starCache.stars;
  const count = 120;
  const v = seeded(hashString(`stars:${seed}`), count * 5);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const at = (k: number): number => v[i * 5 + k] ?? 0;
    stars.push({ x: at(0) * BOARD.width, y: Math.pow(at(1), 1.6) * BOARD.height * 0.8, r: 0.5 + at(2) * 1.3, a: 0.25 + at(3) * 0.6, phase: at(4) * Math.PI * 2 });
  }
  starCache = { seed, stars };
  return stars;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function drawSky(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const g = ctx.createLinearGradient(0, 0, 0, BOARD.height);
  g.addColorStop(0, PALETTE.skyHigh);
  g.addColorStop(0.7, PALETTE.sky);
  g.addColorStop(1, '#10141F');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BOARD.width, BOARD.height);
  for (const s of starsFor(scene.seed)) {
    const twinkle = scene.motion ? 0.75 + 0.25 * Math.sin(scene.time * 0.0016 + s.phase) : 1;
    ctx.globalAlpha = s.a * twinkle;
    ctx.fillStyle = PALETTE.text;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCampfire(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const cx = 132;
  const base = 330;
  const [p1 = 0, p2 = 0, p3 = 0] = seeded(hashString(`fire:${scene.seed}`), 3).map((x) => x * Math.PI * 2);
  const t = scene.motion ? scene.time : 0;
  const flicker = 0.5 * Math.sin(t * 0.011 + p1) + 0.3 * Math.sin(t * 0.023 + p2) + 0.2 * Math.sin(t * 0.037 + p3);

  // Light on the ground.
  const glow = ctx.createRadialGradient(cx, base, 10, cx, base, 230 + flicker * 12);
  glow.addColorStop(0, 'rgba(255, 150, 70, 0.28)');
  glow.addColorStop(1, 'rgba(255, 150, 70, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 60, 420, 480);

  // Ring of small stones and two crossed logs.
  ctx.fillStyle = PALETTE.stoneDark;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.05 + (0.9 * i) / 6);
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * 54, base + 10 + Math.sin(a) * 10, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#3B2F2B';
  for (const angle of [-0.32, 0.32]) {
    ctx.save();
    ctx.translate(cx, base + 4);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.roundRect(-52, -7, 104, 14, 7);
    ctx.fill();
    ctx.restore();
  }

  // Flames: three nested tongues.
  const layers: [string, number, number][] = [
    [PALETTE.flame, 1, 0],
    [PALETTE.ember, 0.68, 0.6],
    ['#FFF3C4', 0.36, 1.2],
  ];
  for (const [color, scale, offset] of layers) {
    const h = (96 + flicker * 10) * scale;
    const w = 40 * scale;
    const lean = Math.sin(t * 0.004 + offset + p2) * 6 * scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - w, base);
    ctx.quadraticCurveTo(cx - w * 1.05, base - h * 0.55, cx + lean, base - h);
    ctx.quadraticCurveTo(cx + w * 1.05, base - h * 0.55, cx + w, base);
    ctx.closePath();
    ctx.fill();
  }

  // Sparks rising on a fixed seeded schedule.
  if (scene.motion) {
    const sparkSeeds = seeded(hashString(`sparks:${scene.seed}`), 12);
    for (let i = 0; i < 6; i++) {
      const period = 1800 + (sparkSeeds[i] ?? 0) * 1400;
      const life = ((t + (sparkSeeds[i + 6] ?? 0) * period) % period) / period;
      ctx.globalAlpha = 1 - life;
      ctx.fillStyle = PALETTE.ember;
      ctx.beginPath();
      ctx.arc(cx + Math.sin(life * 6 + i) * 18, base - 70 - life * 140, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function stoneOutline(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, key: string): void {
  const j = seeded(hashString(key), 8).map((v) => (v - 0.5) * 10);
  const at = (i: number): number => j[i] ?? 0;
  ctx.beginPath();
  ctx.moveTo(x + at(0), y + at(1));
  ctx.lineTo(x + w + at(2), y + at(3));
  ctx.lineTo(x + w + at(4), y + h + at(5));
  ctx.lineTo(x + at(6), y + h + at(7));
  ctx.closePath();
}

function mix(hexA: string, hexB: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(hexA.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(hexB.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + ((pb[i] ?? v) - v) * t));
  return `rgb(${c.join(',')})`;
}

function drawRune(ctx: CanvasRenderingContext2D, cardId: string, cx: number, cy: number, size: number, color: string, glow: number): void {
  const strokes = RUNES[cardId];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2.5, size * 0.11);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 22 * glow;
  if (strokes === undefined) {
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    for (const stroke of strokes) {
      ctx.beginPath();
      stroke.forEach(([px, py], i) => {
        const X = cx + px * size;
        const Y = cy + py * size;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      ctx.stroke();
    }
  }
  ctx.restore();
}

export interface StoneOptions {
  /** 0 = dim, 1 = fully lit. */
  readonly glow: number;
  readonly highlight: 'none' | 'target' | 'hover';
  readonly pulse: number;
  readonly key: string;
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
    stoneOutline(ctx, x + 6, y + 6, w - 12, h - 12, `socket:${opts.key}`);
    ctx.fillStyle = PALETTE.socket;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    const edge = DIRECTION_GLOW[look.direction];
    stoneOutline(ctx, x, y, w, h, `stone:${card.uid}`);
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, PALETTE.stoneLight);
    g.addColorStop(1, PALETTE.stoneDark);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = edge;
    ctx.globalAlpha = 0.45 + 0.55 * opts.glow;
    ctx.lineWidth = 1.5 + opts.glow * 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const runeColor = mix(PALETTE.runeDim, edge, Math.max(0.18, opts.glow));
    drawRune(ctx, card.cardId, x + w / 2, y + h / 2 - 8, Math.min(w, h) * 0.27, runeColor, opts.glow);

    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${Math.round(h * 0.12)}px "Alegreya Sans", sans-serif`;
    ctx.fillText(look.name, x + w / 2, y + h - h * 0.09);

    // Value, top right, in the direction color.
    ctx.textAlign = 'right';
    ctx.fillStyle = mix(PALETTE.text, edge, 0.55);
    ctx.font = `700 ${Math.round(h * 0.17)}px "Alegreya", serif`;
    ctx.fillText(String(look.value), x + w - w * 0.08, y + h * 0.21);

    // Cost, top left, as small diamonds.
    if (look.cost !== null) {
      ctx.fillStyle = PALETTE.text;
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < look.cost; i++) {
        const dx = x + w * 0.12 + i * w * 0.08;
        const dy = y + h * 0.14;
        const r = w * 0.03;
        ctx.beginPath();
        ctx.moveTo(dx, dy - r);
        ctx.lineTo(dx + r, dy);
        ctx.lineTo(dx, dy + r);
        ctx.lineTo(dx - r, dy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Level notches along the bottom edge.
    ctx.strokeStyle = PALETTE.runeDim;
    ctx.lineWidth = 2;
    for (let i = 0; i < look.level; i++) {
      const nx = x + w / 2 + (i - (look.level - 1) / 2) * 8;
      ctx.beginPath();
      ctx.moveTo(nx, y + h - 4);
      ctx.lineTo(nx, y + h + 3);
      ctx.stroke();
    }
  }

  if (opts.highlight !== 'none') {
    stoneOutline(ctx, x - 4, y - 4, w + 8, h + 8, `hl:${opts.key}`);
    ctx.setLineDash(opts.highlight === 'target' ? [8, 6] : []);
    ctx.strokeStyle = PALETTE.ember;
    ctx.globalAlpha = opts.highlight === 'hover' ? 1 : 0.55 + 0.45 * opts.pulse;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

function drawHp(ctx: CanvasRenderingContext2D, label: string, hp: { now: number; max: number }, x: number, y: number): void {
  const width = 190;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.text;
  ctx.font = '600 20px "Alegreya", serif';
  ctx.fillText(label, x, y);
  ctx.textAlign = 'right';
  ctx.font = '500 17px "Alegreya Sans", sans-serif';
  ctx.fillText(`${hp.now} / ${hp.max}`, x + width, y);
  ctx.fillStyle = PALETTE.socket;
  ctx.beginPath();
  ctx.roundRect(x, y + 9, width, 10, 5);
  ctx.fill();
  const frac = hp.max > 0 ? Math.max(0, Math.min(1, hp.now / hp.max)) : 0;
  if (frac > 0) {
    ctx.fillStyle = PALETTE.ember;
    ctx.beginPath();
    ctx.roundRect(x, y + 9, Math.max(10, width * frac), 10, 5);
    ctx.fill();
  }
}

function drawCursorTrack(ctx: CanvasRenderingContext2D, scene: Scene): void {
  if (scene.cursor !== null) {
    const r = slotRect('enemy', scene.cursor);
    const top = r.y - 16;
    const bottom = LINE_Y.player + STONE.h / 2 + 16;
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, 'rgba(255, 201, 74, 0.04)');
    g.addColorStop(0.5, 'rgba(255, 201, 74, 0.20)');
    g.addColorStop(1, 'rgba(255, 201, 74, 0.04)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(r.x - 10, top, r.w + 20, bottom - top, 14);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // System sans for slot numbers: Alegreya's old-style 2 reads like a z at this size.
  ctx.font = '700 16px system-ui, sans-serif';
  for (let slot = 1; slot <= COLUMN_X.length; slot++) {
    const active = scene.cursor === slot;
    ctx.fillStyle = active ? PALETTE.ember : PALETTE.runeDim;
    ctx.globalAlpha = active ? 1 : 0.55;
    ctx.fillText(String(slot), COLUMN_X[slot - 1] ?? 0, MID_Y);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx: CanvasRenderingContext2D, floaters: readonly Floater[]): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 30px "Alegreya", serif';
  for (const f of floaters) {
    const r = slotRect(f.side, f.slot);
    ctx.globalAlpha = Math.max(0, 1 - f.age);
    ctx.fillStyle = PALETTE.flame;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.fillText(f.text, r.x + r.w / 2, r.y + r.h * 0.4 - f.age * 46);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

export function drawBoard(ctx: CanvasRenderingContext2D, scene: Scene): void {
  drawSky(ctx, scene);
  drawCampfire(ctx, scene);
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
  drawHp(ctx, scene.enemyName, scene.hp.enemy, 40, 60);
  drawHp(ctx, 'You', scene.hp.player, 40, 492);
  drawFloaters(ctx, scene.floaters);
}
