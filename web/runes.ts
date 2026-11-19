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
  // A raised guard: a kite shield outline with a bar across it.
  parry: [
    [
      [-0.55, -0.65],
      [0.55, -0.65],
      [0.5, 0.05],
      [0, 0.72],
      [-0.5, 0.05],
      [-0.55, -0.65],
    ],
    [
      [-0.3, -0.15],
      [0.3, -0.15],
    ],
  ],
  // A whetstone: a slanted slab, with a chevron pointing right at the next stone.
  whetstone: [
    [
      [-0.7, 0.55],
      [-0.35, 0.2],
      [0.45, 0.2],
      [0.1, 0.55],
      [-0.7, 0.55],
    ],
    [
      [-0.35, -0.65],
      [0.2, -0.25],
      [-0.35, 0.05],
    ],
    [
      [0.1, -0.65],
      [0.65, -0.25],
      [0.1, 0.05],
    ],
  ],
  // An echo: two rings of sound spreading back toward the previous stone, from a point on the right.
  echo: [
    [
      [0.2, 0.42],
      [0.04, 0.33],
      [-0.06, 0.18],
      [-0.1, 0.0],
      [-0.06, -0.18],
      [0.04, -0.33],
      [0.2, -0.42],
    ],
    [
      [0.06, 0.8],
      [-0.23, 0.62],
      [-0.43, 0.34],
      [-0.5, 0.0],
      [-0.43, -0.34],
      [-0.23, -0.62],
      [0.06, -0.8],
    ],
    [
      [0.35, -0.12],
      [0.35, 0.12],
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
