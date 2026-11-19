// Hand-built board moments for the scene preview page (scene.html) and `npm run scenes`.
// A scene is only a picture: it sets what is on the board directly instead of playing up to it,
// so it can show any moment quickly. Card ids are still checked by the engine (cardDef throws).
// Add a scene here when a card or effect gets a new look, so it can be checked without playing.
import type { GameEvent, Level, Owner } from '../engine/index.ts';

/** Events the board animates when a slot fires. */
export type ImpactEvent = Extract<GameEvent, { type: 'damage' } | { type: 'block' } | { type: 'grow' } | { type: 'copy' } | { type: 'fizzle' }>;

/** A card id at level 1, or [card id, level]. */
/** A card id, or [id, level], or [id, level, growth] (R-14). */
export type CardRef = string | readonly [string, Level] | readonly [string, Level, number];
type Line = readonly [CardRef | null, CardRef | null, CardRef | null, CardRef | null];

export interface SceneSpec {
  readonly id: string;
  readonly title: string;
  /** What to look at in this scene. */
  readonly look: string;
  readonly seed: number;
  readonly enemyLine: Line;
  readonly playerLine: Line;
  readonly hand?: readonly CardRef[];
  /** Index into `hand` of the selected card. */
  readonly selected?: number;
  /** `before`: HP before the hit shown in `impacts`, so the bar can show what was lost. */
  readonly hp?: Partial<Record<Owner, readonly [now: number, max: number, before?: number]>>;
  /** Turn-order cursor column, 1-based. */
  readonly cursor?: number;
  /** Stones glowing as they fire, with strength 0..1. */
  readonly firing?: readonly { readonly side: Owner; readonly slot: number; readonly glow: number }[];
  /** Player slots shown as placement targets. */
  readonly targets?: readonly number[];
  readonly hover?: number;
  /** Block and damage events being animated, at an age from 0 (just fired) to 1 (gone). */
  readonly impacts?: readonly { readonly event: ImpactEvent; readonly age: number }[];
  /** Frozen animation clock in ms; drives fire flicker and target pulse. */
  readonly time?: number;
}

const DUMMY: Line = [null, 'dummy-swing', null, 'dummy-swing'];
const EMPTY: Line = [null, null, null, null];

export const SCENES: readonly SceneSpec[] = [
  {
    id: 'opening',
    title: 'Opening',
    look: 'Empty player line, enemy line, full HP, a hand of four.',
    seed: 7,
    enemyLine: DUMMY,
    playerLine: EMPTY,
    hand: ['parry', 'parry', 'slash', 'slash'],
  },
  {
    id: 'placing',
    title: 'Choosing a slot',
    look: 'Selected hand card, target highlight on all four slots, hover on slot 2.',
    seed: 7,
    enemyLine: DUMMY,
    playerLine: EMPTY,
    hand: ['parry', 'slash', 'slash'],
    selected: 0,
    targets: [1, 2, 3, 4],
    hover: 2,
  },
  {
    id: 'parry-block',
    title: 'Parry blocks',
    look: 'Slot 2 firing: a ward on the Parry with "Blocked 3", nothing reaches the wayfarer, player HP full.',
    seed: 7,
    enemyLine: DUMMY,
    playerLine: ['slash', 'parry', null, 'parry'],
    cursor: 2,
    firing: [
      { side: 'enemy', slot: 2, glow: 1 },
      { side: 'player', slot: 2, glow: 1 },
    ],
    impacts: [{ event: { type: 'block', round: 1, slot: 2, side: 'player', incoming: 3, blocked: 3 }, age: 0.4 }],
  },
  {
    id: 'whetstone-grow',
    title: 'Whetstone grows the next card',
    look: 'Slot 1 firing: a gold spark runs from the Whetstone to the Slash in slot 2 and "+1" rises over it; the Slash reads "Deal 5" with 5 highlighted.',
    seed: 7,
    enemyLine: DUMMY,
    playerLine: ['whetstone', ['slash', 1, 1], null, 'whetstone'],
    cursor: 1,
    firing: [{ side: 'player', slot: 1, glow: 1 }],
    impacts: [
      {
        event: { type: 'grow', round: 1, slot: 1, side: 'player', uid: 'p1', cardId: 'whetstone', sourceSlot: 1, targetSlot: 2, targetUid: 'p2', targetCardId: 'slash', amount: 1, valueAfter: 5 },
        age: 0.5,
      },
    ],
  },
  {
    id: 'whetstone-fizzle',
    title: 'Whetstone in slot 4 fizzles',
    look: 'Slot 4 firing: "fizzles" across the Whetstone; no spark, nothing wraps around to slot 1.',
    seed: 7,
    enemyLine: DUMMY,
    playerLine: ['slash', null, null, 'whetstone'],
    cursor: 4,
    firing: [
      { side: 'player', slot: 4, glow: 1 },
      { side: 'enemy', slot: 4, glow: 1 },
    ],
    impacts: [{ event: { type: 'fizzle', round: 1, slot: 4, side: 'player', uid: 'p4', cardId: 'whetstone', sourceSlot: 4, target: 'next', targetSlot: null, reason: 'no-slot' }, age: 0.5 }],
  },
  {
    id: 'echo-copy',
    title: 'Echo copies the previous card',
    look: 'Slot 2 firing: a green arc runs back from the Echo to the Slash in slot 1, "copy" rises over the Slash, and both stones glow. Echo\'s text has no number, so nothing in it is highlighted.',
    seed: 7,
    enemyLine: DUMMY,
    playerLine: ['slash', 'echo', null, null],
    cursor: 2,
    firing: [
      { side: 'player', slot: 2, glow: 1 },
      { side: 'player', slot: 1, glow: 1 },
      { side: 'enemy', slot: 2, glow: 1 },
    ],
    impacts: [
      {
        event: { type: 'copy', round: 1, slot: 2, side: 'player', uid: 'p2', cardId: 'echo', sourceSlot: 2, targetSlot: 1, targetUid: 'p1', targetCardId: 'slash', asCardId: 'slash', asUid: 'p1', asSlot: 1 },
        age: 0.5,
      },
    ],
  },
  {
    id: 'echo-after-whetstone',
    title: 'Echo copies Whetstone and grows the card after the Echo',
    look: 'Slot 2 firing: a green arc from the Echo back to the Whetstone with "copy", then an amber arc from the Echo forward to the Slash in slot 3 with "+1"; the Slash shows its new value.',
    seed: 7,
    enemyLine: DUMMY,
    playerLine: ['whetstone', 'echo', ['slash', 1, 1], null],
    cursor: 2,
    firing: [
      { side: 'player', slot: 2, glow: 1 },
      { side: 'player', slot: 1, glow: 1 },
      { side: 'enemy', slot: 2, glow: 1 },
    ],
    impacts: [
      {
        event: { type: 'copy', round: 1, slot: 2, side: 'player', uid: 'p2', cardId: 'echo', sourceSlot: 2, targetSlot: 1, targetUid: 'p1', targetCardId: 'whetstone', asCardId: 'whetstone', asUid: 'p1', asSlot: 1 },
        age: 0.5,
      },
      {
        event: { type: 'grow', round: 1, slot: 2, side: 'player', uid: 'p2', cardId: 'echo', sourceSlot: 2, targetSlot: 3, targetUid: 'p3', targetCardId: 'slash', amount: 1, valueAfter: 5 },
        age: 0.5,
      },
    ],
  },
  {
    id: 'trade-hits',
    title: 'Both sides hit',
    look: 'Slot 1 firing both ways: each figure flinches with its own damage number and a pale band on its HP bar. The enemy Slash is placed by hand (R-17 shared effects).',
    seed: 11,
    enemyLine: ['slash', 'dummy-swing', null, 'dummy-swing'],
    playerLine: [['slash', 2], null, null, null],
    hp: { player: [26, 30, 30], enemy: [18, 24, 24] },
    cursor: 1,
    firing: [
      { side: 'enemy', slot: 1, glow: 1 },
      { side: 'player', slot: 1, glow: 1 },
    ],
    impacts: [
      { event: { type: 'damage', round: 2, slot: 1, target: 'enemy', amount: 6, hpAfter: 18 }, age: 0.6 },
      { event: { type: 'damage', round: 2, slot: 1, target: 'player', amount: 4, hpAfter: 26 }, age: 0.6 },
    ],
  },
  {
    id: 'partial-block',
    title: 'Partial block',
    look: 'Slot 4 firing: ward with "Blocked 6" on the Parry, a thinner bolt goes on to the wayfarer for 3.',
    seed: 13,
    enemyLine: [null, 'dummy-swing', null, ['slash', 3]],
    playerLine: [null, null, null, ['parry', 2]],
    hp: { player: [27, 30, 30] },
    cursor: 4,
    firing: [
      { side: 'enemy', slot: 4, glow: 1 },
      { side: 'player', slot: 4, glow: 1 },
    ],
    impacts: [
      { event: { type: 'block', round: 2, slot: 4, side: 'player', incoming: 9, blocked: 6 }, age: 0.42 },
      { event: { type: 'damage', round: 2, slot: 4, target: 'player', amount: 3, hpAfter: 27 }, age: 0.42 },
    ],
  },
  {
    id: 'bolt-flying',
    title: 'Bolt in flight',
    look: 'Slot 1 just fired: a bolt leaves the player Slash toward the enemy line; no number yet.',
    seed: 11,
    enemyLine: DUMMY,
    playerLine: [['slash', 2], null, null, null],
    hp: { enemy: [18, 24, 24] },
    cursor: 1,
    firing: [{ side: 'player', slot: 1, glow: 1 }],
    impacts: [{ event: { type: 'damage', round: 2, slot: 1, target: 'enemy', amount: 6, hpAfter: 18 }, age: 0.16 }],
  },
  {
    id: 'full-lines',
    title: 'Full lines, top levels',
    look: 'Every slot filled, level 3 values, long names, no overlap between stones.',
    seed: 3,
    enemyLine: [['dummy-swing', 3], ['dummy-swing', 3], ['dummy-swing', 3], ['dummy-swing', 3]],
    playerLine: [['slash', 3], ['parry', 3], ['slash', 3], ['parry', 3]],
    hand: [['slash', 3], ['parry', 3]],
  },
  {
    id: 'low-hp',
    title: 'Low HP',
    look: 'Nearly empty HP bars on both sides (red when low), a big damage number on the dummy.',
    seed: 19,
    enemyLine: DUMMY,
    playerLine: [['slash', 3], null, null, null],
    hp: { player: [2, 30], enemy: [1, 24, 10] },
    cursor: 1,
    firing: [{ side: 'player', slot: 1, glow: 0.8 }],
    impacts: [{ event: { type: 'damage', round: 5, slot: 1, target: 'enemy', amount: 9, hpAfter: 1 }, age: 0.62 }],
  },
];
