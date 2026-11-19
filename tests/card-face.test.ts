// Card faces (issue #21): every stone with a card shows its effect text, the value is drawn
// inside that text in its own weight and color, and the text fits the smallest stone.
// Widths come from the font files the page loads (tests/font-metrics.ts), not from a guess.
import { describe, expect, it } from 'vitest';
import { CARDS, type CardId } from '../data/cards.ts';
import { cardValue, type CardInstance, type Level } from '../engine/index.ts';
import { cardEffectParts, cardEffectText, type EffectPart } from '../present/text.ts';
import { cardFaceLayout, layoutCardText, type Box } from '../web/card-face.ts';
import { textWidth } from './font-metrics.ts';

// web/board.ts and web/look.ts are typed against the DOM and checked by web/tsconfig.json; the root
// typecheck (which covers tests/) has no DOM library. A computed specifier keeps them out of the root
// program, so the little of their API used here is restated, and the test runs the real code.
interface StoneLook {
  readonly name: string;
  readonly direction: string;
  readonly cost: number | null;
  readonly effect: readonly EffectPart[];
  readonly level: number;
}
interface StoneOptions {
  readonly glow: number;
  readonly highlight: 'none' | 'target' | 'hover';
  readonly pulse: number;
  readonly key: string;
}
interface BoardApi {
  drawStone(ctx: unknown, box: Box, card: CardInstance | null, look: StoneLook | null, opts: StoneOptions): void;
  slotRect(side: 'player' | 'enemy', slot: number): Box;
}
interface LookApi {
  look(card: CardInstance): StoneLook;
  readonly HAND_STONE_BOX: Box;
}
const webModule = (name: string): Promise<unknown> => import(`../web/${name}.ts`);
const { drawStone, slotRect } = (await webModule('board')) as BoardApi;
const { HAND_STONE_BOX, look } = (await webModule('look')) as LookApi;

const IDS = Object.keys(CARDS) as CardId[];
const LEVELS = [1, 2, 3] as const;
const card = (cardId: string, level: Level = 1, growth = 0): CardInstance => ({ uid: `${cardId}-${level}-${growth}`, cardId, level, growth });
const joined = (parts: readonly EffectPart[]): string => parts.map((p) => p.text).join('');
const OPTS: StoneOptions = { glow: 0, highlight: 'none', pulse: 1, key: 'test' };

/** The two stone sizes the page draws: a line slot and a hand card. */
const STONES = { slot: slotRect('player', 1), hand: HAND_STONE_BOX } as const;
const smallest = Object.values(STONES).reduce((a, b) => (a.w * a.h <= b.w * b.h ? a : b));

interface Drawn {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly font: string;
  readonly fillStyle: unknown;
}

/**
 * A stand-in 2D context: drawing calls do nothing, state is kept (with save/restore), fillText is
 * recorded, and measureText uses the real font metrics.
 */
function fakeContext(): { ctx: object; drawn: Drawn[]; calls: Map<string, number> } {
  const drawn: Drawn[] = [];
  const calls = new Map<string, number>();
  let state: Record<string, unknown> = { font: '10px sans-serif', fillStyle: '#000' };
  const stack: Record<string, unknown>[] = [];
  const gradient = { addColorStop: () => undefined };
  const methods: Record<string, (...args: never[]) => unknown> = {
    save: () => void stack.push({ ...state }),
    restore: () => void (state = stack.pop() ?? state),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: (text: string) => ({ width: textWidth(text, String(state['font'])) }),
    fillText: (text: string, x: number, y: number) =>
      void drawn.push({ text, x, y, font: String(state['font']), fillStyle: state['fillStyle'] }),
  };
  const ctx = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (!(prop in methods) && prop in state) return state[prop];
        calls.set(prop, (calls.get(prop) ?? 0) + 1);
        return methods[prop] ?? (() => undefined);
      },
      set: (_t, prop: string, value: unknown) => {
        state[prop] = value;
        return true;
      },
    },
  );
  return { ctx, drawn, calls };
}

const weightOf = (font: string): number => Number(/^(\d{3}) /.exec(font)?.[1]);

describe('card effect text as parts', () => {
  for (const id of IDS) {
    for (const level of LEVELS) {
      it(`${CARDS[id].name} level ${level}: the parts join to the same sentence as cardEffectText`, () => {
        const c = card(id, level);
        const parts = cardEffectParts(c);
        expect(joined(parts)).toBe(cardEffectText(c));
        const values = parts.filter((p) => p.kind === 'value');
        const value = cardValue(c);
        if (value === null) expect(values).toEqual([]);
        else {
          expect(values).toHaveLength(1);
          expect(values[0]?.text.replace('+', '')).toBe(String(value));
        }
      });
    }
  }

  it('the full sentences used by the aria-label and the log are unchanged', () => {
    expect(cardEffectText(card('slash'))).toBe('Deals 4 damage to the opposing slot.');
    expect(cardEffectText(card('parry', 3))).toBe('Blocks 9 damage from the opposing slot only.');
    expect(cardEffectText(card('whetstone', 2))).toBe('Gives the next card +2 for the rest of the battle.');
    expect(cardEffectText(card('echo'))).toBe('Acts as a copy of the previous card, in this slot.');
  });

  it('R-14 edge: after Whetstone grows a Slash at 4 by 2, the value part is the grown 6', () => {
    const grown = card('slash', 1, 2);
    expect(cardEffectText(grown)).toBe('Deals 6 damage to the opposing slot.');
    expect(cardEffectParts(grown).filter((p) => p.kind === 'value')).toEqual([{ kind: 'value', text: '6' }]);
  });

  it('edge: a value shown from an event payload replaces the card value in the parts', () => {
    expect(joined(cardEffectParts(card('slash'), 6))).toBe('Deals 6 damage to the opposing slot.');
  });

  it('edge: Echo has no number, so no part is a value', () => {
    expect(cardEffectParts(card('echo')).every((p) => p.kind === 'text')).toBe(true);
  });
});

describe('card text layout', () => {
  const measure = (text: string, font: string): number => textWidth(text, font);

  for (const [name, stone] of Object.entries(STONES)) {
    it(`the ${name} stone's text box lies inside the stone, above the name band`, () => {
      const face = cardFaceLayout(stone);
      expect(face.text.x).toBeGreaterThanOrEqual(stone.x + 4);
      expect(face.text.x + face.text.w).toBeLessThanOrEqual(stone.x + stone.w - 4);
      expect(face.text.y).toBeGreaterThan(face.rune.cy + face.rune.size);
      expect(face.text.y + face.text.h).toBeLessThanOrEqual(face.nameBand.y);
    });
  }

  it('edge: Parry level 3, the longest text, wraps to fit the smallest stone; measured widths fit the box', () => {
    const c = card('parry', 3);
    const box = cardFaceLayout(smallest).text;
    const out = layoutCardText(cardEffectParts(c), box, measure);
    expect(out.lines.length).toBeGreaterThan(1);
    expect(out.lines.map((l) => l.runs.map((r) => r.text).join('')).join(' ')).toBe(cardEffectText(c));
    for (const line of out.lines) {
      // Re-measure each line from its runs, in each run's own font, as the browser would draw it.
      const width = line.runs.reduce((n, r) => n + textWidth(r.text, r.font), 0);
      expect(width).toBeLessThanOrEqual(box.w);
      expect(line.x).toBeGreaterThanOrEqual(box.x);
      expect(line.x + width).toBeLessThanOrEqual(box.x + box.w + 0.01);
      // Ascent and descent stay within the box, so the text never reaches the name band.
      expect(line.baseline - out.px).toBeGreaterThanOrEqual(box.y);
      expect(line.baseline + out.px * 0.3).toBeLessThanOrEqual(box.y + box.h);
    }
    expect(out.px).toBeGreaterThanOrEqual(9);
  });

  it('every card at every level, and with growth up to 99, fits both stone sizes', () => {
    for (const stone of Object.values(STONES)) {
      const box = cardFaceLayout(stone).text;
      for (const id of IDS) {
        for (const level of LEVELS) {
          for (const growth of [0, 2, 99]) {
            const out = layoutCardText(cardEffectParts(card(id, level, growth)), box, measure);
            for (const line of out.lines) expect(line.runs.reduce((n, r) => n + textWidth(r.text, r.font), 0)).toBeLessThanOrEqual(box.w);
            const last = out.lines.at(-1);
            expect(last === undefined ? Infinity : last.baseline + out.px * 0.3).toBeLessThanOrEqual(box.y + box.h);
          }
        }
      }
    }
  });

  it('the value run is in a heavier weight than the plain runs', () => {
    const out = layoutCardText(cardEffectParts(card('slash')), cardFaceLayout(smallest).text, measure);
    const runs = out.lines.flatMap((l) => l.runs);
    const value = runs.filter((r) => r.kind === 'value');
    expect(value.map((r) => r.text)).toEqual(['4']);
    for (const r of runs.filter((r) => r.kind === 'text')) expect(weightOf(value[0]?.font ?? '')).toBeGreaterThan(weightOf(r.font));
  });

  it('failure: empty effect text throws instead of laying out a blank', () => {
    const box = cardFaceLayout(smallest).text;
    expect(() => layoutCardText([], box, measure)).toThrow();
    expect(() => layoutCardText([{ kind: 'text', text: '' }], box, measure)).toThrow();
    expect(() => layoutCardText([{ kind: 'text', text: '  ' }], box, measure)).toThrow();
  });
});

describe('drawing a stone', () => {
  const draw = (box: { x: number; y: number; w: number; h: number }, c: CardInstance | null, l: StoneLook | null) => {
    const f = fakeContext();
    drawStone(f.ctx, box, c, l, OPTS);
    return f;
  };
  const sentence = (drawn: readonly Drawn[], name: string): string =>
    drawn
      .filter((d) => d.text !== name)
      .map((d) => d.text)
      .join(' ')
      .replace(/ +/g, ' ');

  const cases: [string, { x: number; y: number; w: number; h: number }, CardInstance][] = [
    ['hand', STONES.hand, card('parry', 3)],
    ['player line', slotRect('player', 2), card('whetstone', 2)],
    ['enemy line', slotRect('enemy', 1), card('dummy-swing')],
  ];
  for (const [where, box, c] of cases) {
    it(`a ${where} stone draws its name and its effect text, and nothing else`, () => {
      const l = look(c);
      const { drawn } = draw(box, c, l);
      expect(drawn.some((d) => d.text === l.name)).toBe(true);
      // Words are drawn in runs per style; joining them gives the sentence back.
      expect(sentence(drawn, l.name)).toBe(cardEffectText(c));
      // The value appears once, as part of the sentence (no medallion copy of it).
      const value = cardValue(c);
      if (value !== null) expect(drawn.filter((d) => d.text.replace('+', '') === String(value))).toHaveLength(1);
    });
  }

  it('the value is drawn in a different weight and color from the rest of the line', () => {
    const c = card('slash', 1, 2);
    const { drawn } = draw(STONES.slot, c, look(c));
    const six = drawn.filter((d) => d.text === '6');
    expect(six).toHaveLength(1);
    const plain = drawn.filter((d) => d.text.startsWith('Deals'));
    expect(plain).toHaveLength(1);
    expect(weightOf(six[0]?.font ?? '')).toBeGreaterThan(weightOf(plain[0]?.font ?? ''));
    expect(six[0]?.fillStyle).not.toBe(plain[0]?.fillStyle);
    // Same line as the words around it.
    expect(six[0]?.y).toBe(plain[0]?.y);
  });

  it('edge: Echo draws its text with nothing in the value style', () => {
    const c = card('echo');
    const { drawn } = draw(STONES.hand, c, look(c));
    const body = drawn.filter((d) => d.text !== 'Echo');
    expect(body.length).toBeGreaterThan(0);
    expect(new Set(body.map((d) => d.font)).size).toBe(1);
    expect(new Set(body.map((d) => d.fillStyle)).size).toBe(1);
  });

  it('edge: enemy cards have no cost, so no cost gems; a player card draws one gem per cost point', () => {
    expect(look(card('dummy-swing')).cost).toBeNull();
    const c = card('echo');
    const gradients = (cost: number | null) => draw(STONES.hand, c, { ...look(c), cost }).calls.get('createLinearGradient') ?? 0;
    expect(gradients(2) - gradients(null)).toBe(2);
    expect(gradients(1) - gradients(null)).toBe(1);
  });

  it('failure: an empty socket draws no text', () => {
    expect(draw(STONES.slot, null, null).drawn).toEqual([]);
  });

  it('failure: a card whose effect text is empty makes drawing throw', () => {
    const c = card('slash');
    expect(() => draw(STONES.slot, c, { ...look(c), effect: [] })).toThrow(/effect text/);
    expect(() => draw(STONES.slot, c, { ...look(c), effect: [{ kind: 'text', text: '' }] })).toThrow(/effect text/);
  });
});
