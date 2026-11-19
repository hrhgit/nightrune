// Text widths from the font files the page loads, for tests that check text fits a box.
// Reads a WOFF 1.0 file from @fontsource (head, hhea, hmtx and cmap tables) and sums glyph
// advance widths. Kerning (GPOS) is not applied; for Alegreya Sans at card sizes it changes a
// line by well under a pixel, and the text box is inset from the stone's edge by more than that.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

interface Face {
  readonly unitsPerEm: number;
  readonly advance: (codePoint: number) => number;
}

function readTables(file: string): Map<string, Buffer> {
  const buf = readFileSync(file);
  if (buf.toString('latin1', 0, 4) !== 'wOFF') throw new Error(`${file} is not a WOFF 1.0 file`);
  const numTables = buf.readUInt16BE(12);
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < numTables; i++) {
    const at = 44 + i * 20;
    const tag = buf.toString('latin1', at, at + 4);
    const offset = buf.readUInt32BE(at + 4);
    const compLength = buf.readUInt32BE(at + 8);
    const origLength = buf.readUInt32BE(at + 12);
    const raw = buf.subarray(offset, offset + compLength);
    tables.set(tag, compLength < origLength ? inflateSync(raw) : raw);
  }
  return tables;
}

function table(tables: Map<string, Buffer>, tag: string): Buffer {
  const t = tables.get(tag);
  if (t === undefined) throw new Error(`font has no ${tag} table`);
  return t;
}

/** Glyph id per code point from a format 4 (BMP) cmap subtable. */
function cmapFormat4(cmap: Buffer): (codePoint: number) => number {
  const count = cmap.readUInt16BE(2);
  let sub = -1;
  for (let i = 0; i < count; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const encoding = cmap.readUInt16BE(6 + i * 8);
    const offset = cmap.readUInt32BE(8 + i * 8);
    if (((platform === 3 && encoding === 1) || platform === 0) && cmap.readUInt16BE(offset) === 4) sub = offset;
  }
  if (sub < 0) throw new Error('font has no format 4 cmap');
  const segCount = cmap.readUInt16BE(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + segCount * 2 + 2;
  const deltas = starts + segCount * 2;
  const rangeOffsets = deltas + segCount * 2;
  return (cp) => {
    for (let s = 0; s < segCount; s++) {
      if (cp > cmap.readUInt16BE(ends + s * 2)) continue;
      const start = cmap.readUInt16BE(starts + s * 2);
      if (cp < start) return 0;
      const delta = cmap.readInt16BE(deltas + s * 2);
      const ro = cmap.readUInt16BE(rangeOffsets + s * 2);
      if (ro === 0) return (cp + delta) & 0xffff;
      const glyph = cmap.readUInt16BE(rangeOffsets + s * 2 + ro + (cp - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}

function loadFace(file: string): Face {
  const tables = readTables(file);
  const unitsPerEm = table(tables, 'head').readUInt16BE(18);
  const numberOfHMetrics = table(tables, 'hhea').readUInt16BE(34);
  const hmtx = table(tables, 'hmtx');
  const glyphOf = cmapFormat4(table(tables, 'cmap'));
  return {
    unitsPerEm,
    advance: (cp) => {
      const glyph = glyphOf(cp);
      if (glyph === 0) throw new Error(`font has no glyph for U+${cp.toString(16)}`);
      return hmtx.readUInt16BE(Math.min(glyph, numberOfHMetrics - 1) * 4);
    },
  };
}

const FILES: Record<string, string> = {
  'Alegreya Sans': 'node_modules/@fontsource/alegreya-sans/files/alegreya-sans-latin-{w}-normal.woff',
  Alegreya: 'node_modules/@fontsource/alegreya/files/alegreya-latin-{w}-normal.woff',
};
const faces = new Map<string, Face>();

/**
 * Width in CSS pixels of `text` drawn in a canvas font string such as
 * `500 11px "Alegreya Sans", sans-serif` (weight, size, first family).
 */
export function textWidth(text: string, font: string): number {
  const m = /^(\d{3}) (\d+(?:\.\d+)?)px "([^"]+)"/.exec(font);
  if (m === null) throw new Error(`cannot read font "${font}"`);
  const [, weight = '', size = '', family = ''] = m;
  const pattern = FILES[family];
  if (pattern === undefined) throw new Error(`no font file for "${family}"`);
  const file = pattern.replace('{w}', weight);
  let face = faces.get(file);
  if (face === undefined) {
    face = loadFace(file);
    faces.set(file, face);
  }
  let units = 0;
  for (const ch of text) units += face.advance(ch.codePointAt(0) ?? 0);
  return (units / face.unitsPerEm) * Number(size);
}
