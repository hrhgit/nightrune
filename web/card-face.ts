// Where things go on a card stone, and how its effect text wraps. Pure layout: no canvas, no DOM.
// Text is measured through the function the caller passes (the canvas's measureText on the page,
// the font files' metrics in tests), so the same code decides the wrap in both.
import type { EffectPart } from '../present/text.ts';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Effect text sizes in board pixels: the largest size that fits is used, never below the smallest. */
export const CARD_TEXT = { maxPx: 16, minPx: 9, stepPx: 0.5, lineHeight: 1.12, descent: 0.3 } as const;

/** Font of a run of effect text: the value is in a heavier weight than the words around it. */
export function cardTextFont(px: number, kind: EffectPart['kind']): string {
  return `${kind === 'value' ? 700 : 500} ${px}px "Alegreya Sans", sans-serif`;
}

/** The parts of a stone's face: rune at the top, effect text in the middle, name band at the bottom. */
export function cardFaceLayout(stone: Box): { rune: { cx: number; cy: number; size: number }; text: Box; nameBand: Box } {
  const { x, y, w, h } = stone;
  const rune = { cx: x + w / 2, cy: y + h * 0.17, size: Math.min(w, h) * 0.1 };
  const nameBand = { x: x + 8, y: y + h * 0.75, w: w - 16, h: h * 0.19 };
  const top = rune.cy + rune.size + 3;
  const text = { x: x + 7, y: top, w: w - 14, h: nameBand.y - 2 - top };
  return { rune, text, nameBand };
}

export interface TextRun {
  readonly kind: EffectPart['kind'];
  readonly text: string;
  readonly font: string;
  /** Left edge of the run. */
  readonly x: number;
  readonly width: number;
}

export interface TextLine {
  readonly runs: readonly TextRun[];
  /** Left edge of the line (lines are centred in the box). */
  readonly x: number;
  readonly width: number;
  readonly baseline: number;
}

export interface CardTextLayout {
  readonly px: number;
  readonly lines: readonly TextLine[];
  /** False when even the smallest size overflows the box; the lines are then at the smallest size. */
  readonly fits: boolean;
}

type Measure = (text: string, font: string) => number;
type Segment = { readonly kind: EffectPart['kind']; readonly text: string };

/** Words of the text, each a list of styled segments (a value can sit inside a word, as in "(6)"). */
function wordsOf(parts: readonly EffectPart[]): Segment[][] {
  const words: Segment[][] = [];
  let current: Segment[] = [];
  for (const part of parts) {
    for (const piece of part.text.split(/(\s+)/)) {
      if (piece === '') continue;
      if (/^\s+$/.test(piece)) {
        if (current.length > 0) words.push(current);
        current = [];
      } else current.push({ kind: part.kind, text: piece });
    }
  }
  if (current.length > 0) words.push(current);
  return words;
}

/** Runs of one line: words joined by single spaces, neighbouring segments of one style merged. */
function runsOf(words: readonly Segment[][]): Segment[] {
  const runs: { kind: EffectPart['kind']; text: string }[] = [];
  const add = (kind: EffectPart['kind'], text: string) => {
    const last = runs.at(-1);
    if (last !== undefined && last.kind === kind) last.text += text;
    else runs.push({ kind, text });
  };
  words.forEach((word, i) => {
    // A space takes the plain style: it joins the run before it if that run is plain, else starts one.
    if (i > 0) add('text', ' ');
    for (const s of word) add(s.kind, s.text);
  });
  return runs;
}

function measureLine(words: readonly Segment[][], px: number, measure: Measure): { runs: Omit<TextRun, 'x'>[]; width: number } {
  const runs = runsOf(words).map((r) => {
    const font = cardTextFont(px, r.kind);
    return { kind: r.kind, text: r.text, font, width: measure(r.text, font) };
  });
  return { runs, width: runs.reduce((n, r) => n + r.width, 0) };
}

function wrapAt(words: readonly Segment[][], box: Box, px: number, measure: Measure): CardTextLayout {
  const lines: Segment[][][] = [];
  let fits = true;
  let line: Segment[][] = [];
  for (const word of words) {
    const tried = [...line, word];
    if (line.length > 0 && measureLine(tried, px, measure).width > box.w) {
      lines.push(line);
      line = [word];
    } else line = tried;
    if (measureLine(line, px, measure).width > box.w) fits = false;
  }
  if (line.length > 0) lines.push(line);
  const lineGap = px * CARD_TEXT.lineHeight;
  const height = px + (lines.length - 1) * lineGap + px * CARD_TEXT.descent;
  if (height > box.h) fits = false;
  const top = box.y + Math.max(0, (box.h - height) / 2);
  return {
    px,
    fits,
    lines: lines.map((words, i) => {
      const { runs, width } = measureLine(words, px, measure);
      const x = box.x + (box.w - width) / 2;
      let at = x;
      const placed = runs.map((r) => {
        const run = { ...r, x: at };
        at += r.width;
        return run;
      });
      return { runs: placed, x, width, baseline: top + px + i * lineGap };
    }),
  };
}

/**
 * Wraps a card's effect text into `box` at the largest size that fits. Throws on empty text: a card
 * with nothing to say is a bug in the text layer, not something to draw as a blank stone.
 */
export function layoutCardText(parts: readonly EffectPart[], box: Box, measure: Measure): CardTextLayout {
  const words = wordsOf(parts);
  if (words.length === 0) throw new Error('A card has no effect text to draw.');
  let last: CardTextLayout | null = null;
  for (let px = CARD_TEXT.maxPx; px >= CARD_TEXT.minPx; px -= CARD_TEXT.stepPx) {
    last = wrapAt(words, box, px, measure);
    if (last.fits) return last;
  }
  if (last === null) throw new Error('CARD_TEXT has no sizes to try.');
  return last;
}
