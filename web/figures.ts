// The two figures on the board: the player (a hooded wayfarer with a rune staff) and the enemy.
// Each enemy id has its own figure; an unknown id falls back to a plain shadow so a new enemy
// never breaks the board. Figures react only to what the scene says happened (damage and block
// labels from engine events); they decide nothing.
import type { EnemyId } from '../engine/index.ts';
import { DIRECTION_GLOW, PALETTE } from './palette.ts';

/** How a figure is moving right now, from the labels over its side. */
export interface Reaction {
  /** 0..1, strongest just after a hit. */
  readonly hit: number;
  /** 0..1, strongest just after a block. */
  readonly block: number;
}

export interface FigurePose {
  /** Feet position on the board. */
  readonly x: number;
  readonly y: number;
  /** Height in board units. */
  readonly size: number;
  readonly time: number;
  readonly motion: boolean;
  readonly reaction: Reaction;
}

type FigureDraw = (ctx: CanvasRenderingContext2D, pose: FigurePose) => void;

function ellipseShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, w);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, w, w * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Short stroke of straw, used for bundles and skirts. */
function strawTuft(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, spread: number, angle: number, count: number): void {
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const a = angle + t * spread;
    const l = len * (0.75 + 0.25 * Math.cos(i * 2.3));
    ctx.strokeStyle = i % 3 === 0 ? PALETTE.strawDark : PALETTE.straw;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + t * 4, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
}

/** A short X-shaped cross stitch. */
function crossStitch(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
}

/** One layer canvas per figure size, so two figures do not reallocate a canvas every frame. */
const layers = new Map<string, HTMLCanvasElement>();

/**
 * Draws a figure on its own layer so the red hurt wash tints only the figure, not the scene
 * behind it, then copies the layer onto the board at the board's resolution.
 */
function onLayer(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, hurt: number, draw: (l: CanvasRenderingContext2D) => void): void {
  const t = ctx.getTransform();
  const scale = Math.hypot(t.a, t.b) || 1;
  const w = Math.ceil(box.w * scale);
  const h = Math.ceil(box.h * scale);
  const key = `${w}x${h}`;
  let layer = layers.get(key);
  if (layer === undefined) {
    if (layers.size > 8) layers.clear();
    layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    layers.set(key, layer);
  }
  const l = layer.getContext('2d');
  if (l === null) {
    draw(ctx);
    return;
  }
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.clearRect(0, 0, w, h);
  l.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);
  draw(l);
  if (hurt > 0) {
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-atop';
    l.globalAlpha = 0.45 * hurt;
    l.fillStyle = PALETTE.flame;
    l.fillRect(0, 0, w, h);
    l.globalCompositeOperation = 'source-over';
    l.globalAlpha = 1;
  }
  ctx.drawImage(layer, box.x, box.y, box.w, box.h);
}

/** A blue arc of rune light in front of a figure while it blocks. */
function blockWard(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, amount: number, facing: 1 | -1): void {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.strokeStyle = DIRECTION_GLOW.defense;
  ctx.shadowColor = DIRECTION_GLOW.defense;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  const mid = facing === 1 ? 0 : Math.PI;
  ctx.beginPath();
  ctx.arc(cx, cy, r, mid - 0.9, mid + 0.9);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 9, mid - 0.7, mid + 0.7);
  ctx.stroke();
  // Three small rune ticks on the arc.
  for (const a of [-0.5, 0, 0.5]) {
    const ax = cx + Math.cos(mid + a) * r;
    const ay = cy + Math.sin(mid + a) * r;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(mid + a) * 8, ay + Math.sin(mid + a) * 8);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Player: a hooded wayfarer leaning on a rune staff, lit from the right by the campfire.
// ---------------------------------------------------------------------------

export function drawWayfarer(ctx: CanvasRenderingContext2D, pose: FigurePose): void {
  const u = pose.size / 150;
  ellipseShadow(ctx, pose.x + 6 * u, pose.y, 58 * u);
  onLayer(ctx, { x: pose.x - 70 * u, y: pose.y - 175 * u, w: 140 * u, h: 182 * u }, pose.reaction.hit, (l) => wayfarerBody(l, pose));
  blockWard(ctx, pose.x + 30 * u, pose.y - 80 * u, 62 * u, pose.reaction.block, 1);
}

function wayfarerBody(ctx: CanvasRenderingContext2D, pose: FigurePose): void {
  const { x, y, size: s, time, motion, reaction } = pose;
  const breathe = motion ? Math.sin(time * 0.0021) : 0;
  const flinch = motion ? reaction.hit * Math.sin(time * 0.05) * 4 : 0;
  const u = s / 150; // the figure is drawn on a 150-unit-tall grid

  ctx.save();
  ctx.translate(x + flinch, y);
  ctx.scale(u, u * (1 + breathe * 0.012));

  // Staff (behind the cloak hand), with a crystal that glows.
  ctx.strokeStyle = PALETTE.woodDark;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(40, 0);
  ctx.lineTo(30, -138);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.wood;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(41, -2);
  ctx.lineTo(31.5, -136);
  ctx.stroke();
  // Crystal head: a diamond held by two prongs.
  const pulse = motion ? 0.75 + 0.25 * Math.sin(time * 0.003) : 0.9;
  ctx.save();
  ctx.shadowColor = PALETTE.crystal;
  ctx.shadowBlur = 16 * pulse;
  ctx.fillStyle = PALETTE.crystal;
  ctx.beginPath();
  ctx.moveTo(30, -162);
  ctx.lineTo(38, -149);
  ctx.lineTo(30, -136);
  ctx.lineTo(22, -149);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(30, -158);
  ctx.lineTo(33, -150);
  ctx.lineTo(29, -150);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PALETTE.woodDark;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(24, -140);
  ctx.quadraticCurveTo(21, -150, 25, -158);
  ctx.moveTo(36, -140);
  ctx.quadraticCurveTo(39, -150, 35, -158);
  ctx.stroke();

  // Cloak body: a long bell shape with a ragged hem.
  const cloak = ctx.createLinearGradient(-40, 0, 40, 0);
  cloak.addColorStop(0, PALETTE.cloakDark);
  cloak.addColorStop(0.65, PALETTE.cloak);
  cloak.addColorStop(1, PALETTE.cloakLight); // firelit side
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.moveTo(-14, -112);
  ctx.bezierCurveTo(-30, -90, -42, -40, -44, -2);
  ctx.lineTo(-34, 2);
  ctx.lineTo(-26, -4);
  ctx.lineTo(-16, 3);
  ctx.lineTo(-6, -3);
  ctx.lineTo(4, 3);
  ctx.lineTo(14, -3);
  ctx.lineTo(24, 2);
  ctx.lineTo(34, -2);
  ctx.bezierCurveTo(32, -40, 26, -90, 14, -112);
  ctx.closePath();
  ctx.fill();

  // Fold lines.
  ctx.strokeStyle = PALETTE.cloakDark;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  for (const [x0, x1] of [
    [-8, -20],
    [6, 8],
    [-2, -30],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0, -86);
    ctx.quadraticCurveTo((x0 + x1) / 2 + 3, -45, x1, -6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Scarf / mantle over the shoulders.
  ctx.fillStyle = PALETTE.leather;
  ctx.beginPath();
  ctx.moveTo(-24, -96);
  ctx.quadraticCurveTo(0, -80, 24, -98);
  ctx.lineTo(20, -110);
  ctx.quadraticCurveTo(0, -100, -20, -110);
  ctx.closePath();
  ctx.fill();
  // A strap across the chest to a satchel on the left hip.
  ctx.strokeStyle = PALETTE.woodDark;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(16, -96);
  ctx.lineTo(-22, -42);
  ctx.stroke();
  ctx.fillStyle = PALETTE.leather;
  ctx.beginPath();
  ctx.roundRect(-36, -46, 22, 18, 4);
  ctx.fill();
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(-36, -46, 22, 5);

  // Hand on the staff.
  ctx.fillStyle = PALETTE.cloakDark;
  ctx.beginPath();
  ctx.ellipse(33, -86, 7, 9, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.cloakLight;
  ctx.beginPath();
  ctx.ellipse(35, -88, 3, 5, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Hood: a peaked shape with a dark opening and two ember eyes.
  ctx.fillStyle = PALETTE.cloak;
  ctx.beginPath();
  ctx.moveTo(-22, -104);
  ctx.bezierCurveTo(-26, -128, -12, -150, 6, -152);
  ctx.bezierCurveTo(12, -146, 24, -132, 22, -104);
  ctx.quadraticCurveTo(0, -94, -22, -104);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.cloakLight;
  ctx.beginPath();
  ctx.moveTo(10, -146);
  ctx.bezierCurveTo(20, -134, 24, -120, 22, -104);
  ctx.lineTo(17, -106);
  ctx.bezierCurveTo(18, -122, 15, -134, 10, -146);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.hood;
  ctx.beginPath();
  ctx.ellipse(1, -118, 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.fillStyle = PALETTE.ember;
  ctx.shadowColor = PALETTE.ember;
  ctx.shadowBlur = 6;
  for (const ex of [-4, 6]) {
    ctx.beginPath();
    ctx.ellipse(ex, -118, 1.8, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Training Dummy: a straw-stuffed sack on a post, with a painted target and straw arms.
// ---------------------------------------------------------------------------

export function drawTrainingDummy(ctx: CanvasRenderingContext2D, pose: FigurePose): void {
  const u = pose.size / 170;
  ellipseShadow(ctx, pose.x, pose.y, 52 * u);
  onLayer(ctx, { x: pose.x - 95 * u, y: pose.y - 212 * u, w: 190 * u, h: 222 * u }, pose.reaction.hit, (l) => dummyBody(l, pose));
  blockWard(ctx, pose.x, pose.y - 110 * u, 66 * u, pose.reaction.block, -1);
}

function dummyBody(ctx: CanvasRenderingContext2D, pose: FigurePose): void {
  const { x, y, size: s, time, motion, reaction } = pose;
  const u = s / 170;
  const idle = motion ? Math.sin(time * 0.0017) * 0.02 : 0;
  const wobble = motion ? reaction.hit * Math.sin(time * 0.03) * 0.12 : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(u, u);

  // Base stake hammered into the ground, with a little mound of earth.
  ctx.fillStyle = PALETTE.moss;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 7, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(-6, -40, 12, 42);

  // Everything above the stake sways about its top.
  ctx.translate(0, -36);
  ctx.rotate(idle + wobble);

  // Post.
  ctx.fillStyle = PALETTE.wood;
  ctx.fillRect(-5, -126, 10, 126);
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(2, -126, 3, 126);

  // Cross bar (arms) with straw bundles bound at each end.
  ctx.save();
  ctx.translate(0, -96);
  ctx.rotate(-0.06);
  ctx.fillStyle = PALETTE.wood;
  ctx.beginPath();
  ctx.roundRect(-62, -5, 124, 10, 3);
  ctx.fill();
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(-62, 2, 124, 3);
  for (const side of [-1, 1] as const) {
    strawTuft(ctx, side * 58, 0, 22, 1.1, side === 1 ? 0 : Math.PI, 9);
    ctx.strokeStyle = PALETTE.rope;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(side * 54, -7);
    ctx.lineTo(side * 54, 7);
    ctx.moveTo(side * 49, -7);
    ctx.lineTo(side * 49, 7);
    ctx.stroke();
  }
  ctx.restore();

  // Straw skirt under the torso.
  strawTuft(ctx, 0, -46, 30, 1.6, Math.PI / 2, 15);

  // Torso: a burlap sack, rounder at the bottom, cinched at the waist with rope.
  const sack = ctx.createLinearGradient(-34, 0, 34, 0);
  sack.addColorStop(0, PALETTE.burlapDark);
  sack.addColorStop(0.55, PALETTE.burlap);
  sack.addColorStop(1, PALETTE.burlapDark);
  ctx.fillStyle = sack;
  ctx.beginPath();
  ctx.moveTo(-24, -108);
  ctx.bezierCurveTo(-38, -98, -40, -64, -30, -48);
  ctx.quadraticCurveTo(0, -38, 30, -48);
  ctx.bezierCurveTo(40, -64, 38, -98, 24, -108);
  ctx.quadraticCurveTo(0, -114, -24, -108);
  ctx.closePath();
  ctx.fill();
  // Weave texture: faint cross-hatching.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = PALETTE.burlapDark;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  for (let i = -44; i <= 44; i += 5) {
    ctx.beginPath();
    ctx.moveTo(i, -116);
    ctx.lineTo(i + 3, -40);
    ctx.stroke();
  }
  for (let j = -112; j <= -40; j += 5) {
    ctx.beginPath();
    ctx.moveTo(-44, j);
    ctx.lineTo(44, j + 2);
    ctx.stroke();
  }
  ctx.restore();

  // Painted target on the chest.
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.flame;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(0, -76, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -76, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PALETTE.flame;
  ctx.beginPath();
  ctx.arc(0, -76, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Rope at the waist and a stitched seam up the side.
  ctx.strokeStyle = PALETTE.rope;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-31, -52);
  ctx.quadraticCurveTo(0, -44, 31, -52);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.stitch;
  ctx.lineWidth = 1.5;
  for (let j = -100; j < -56; j += 7) crossStitch(ctx, 24, j, 2);

  // Head: a tied-off sack with stitched eyes and a crooked mouth, straw poking out on top.
  strawTuft(ctx, 0, -148, 16, 1.4, -Math.PI / 2, 9);
  ctx.fillStyle = PALETTE.burlap;
  ctx.beginPath();
  ctx.ellipse(0, -130, 21, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.burlapDark;
  ctx.beginPath();
  ctx.ellipse(6, -127, 14, 16, 0, -0.6, 1.6);
  ctx.fill();
  ctx.strokeStyle = PALETTE.rope;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-12, -112);
  ctx.quadraticCurveTo(0, -108, 12, -112);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.stitch;
  ctx.lineWidth = 2;
  crossStitch(ctx, -8, -134, 3.5);
  crossStitch(ctx, 8, -134, 3.5);
  ctx.beginPath();
  ctx.moveTo(-9, -121);
  ctx.lineTo(-3, -123);
  ctx.lineTo(3, -120);
  ctx.lineTo(9, -122);
  ctx.stroke();

  ctx.restore();
}

function drawUnknownEnemy(ctx: CanvasRenderingContext2D, pose: FigurePose): void {
  ellipseShadow(ctx, pose.x, pose.y, 40);
  ctx.fillStyle = PALETTE.treelineNear;
  ctx.beginPath();
  ctx.ellipse(pose.x, pose.y - pose.size / 2, pose.size * 0.25, pose.size / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** One figure per enemy id. Typed by the enemy table, so a new enemy without a figure does not compile. */
export const ENEMY_FIGURES: Readonly<Record<EnemyId, FigureDraw>> = {
  'training-dummy': drawTrainingDummy,
};

export function drawEnemyFigure(ctx: CanvasRenderingContext2D, enemyId: string, pose: FigurePose): void {
  const draw: FigureDraw | undefined = (ENEMY_FIGURES as Readonly<Record<string, FigureDraw>>)[enemyId];
  (draw ?? drawUnknownEnemy)(ctx, pose);
}
