// One rune glyph per card id, drawn as strokes in a -1..1 box. Pure data (no DOM), so a test
// can check that every card in the table has a rune.

/** A stroke is a polyline of [x, y] points. */
export type RuneStroke = readonly (readonly [number, number])[];

export const RUNES: Readonly<Record<string, readonly RuneStroke[]>> = {
  // A blade: one long cut with a guard across it.
  slash: [
    [
      [-0.55, 0.7],
      [0.55, -0.7],
    ],
    [
      [-0.45, -0.05],
      [0.05, 0.35],
    ],
    [
      [0.2, -0.55],
      [0.55, -0.35],
    ],
  ],
  // A straw flail: a stem with a hooked head.
  'dummy-swing': [
    [
      [0, 0.75],
      [0, -0.35],
      [0.4, -0.7],
      [0.6, -0.35],
      [0.25, -0.1],
    ],
    [
      [-0.4, 0.25],
      [0.4, 0.25],
    ],
  ],
};
