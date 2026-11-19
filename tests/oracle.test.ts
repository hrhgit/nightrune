// R-07 R-08 R-10 R-11 R-12 R-13 R-14: the engine against an independent reading of the rules
// (tests/oracle.ts). Every card arrangement, alone and together, on both lines, over several
// rounds; then whole games with seeded random placements. Any result the rules do not allow
// is a difference; the only accepted kind is the one RULES.md marks "differs" (R-12.3).
import { describe, expect, it } from 'vitest';
import { CARDS, type CardId } from '../data/cards.ts';
import { RULES } from '../data/rules.ts';
import { createBattle, legalPlacements, nextBelow, seedRng, step, type BattleState, type RngState, type Slot } from '../engine/index.ts';
import { actualRound, expectedRound, type RoundOutcome } from './oracle.ts';

const PLAYER_CARDS = (Object.keys(CARDS) as CardId[]).filter((id) => CARDS[id].owner === 'player');
const ALL_CARDS = Object.keys(CARDS) as CardId[];

/** Every line of 4 slots over `cards` plus empty. */
function allLines(cards: readonly CardId[]): (CardId | null)[][] {
  const choices = [null, ...cards];
  let lines: (CardId | null)[][] = [[]];
  for (let i = 0; i < RULES.lineLength; i++) lines = lines.flatMap((l) => choices.map((c) => [...l, c]));
  return lines;
}

function enemyLine(ids: readonly (CardId | null)[]): Slot[] {
  return ids.map((id, i) => (id === null ? null : { uid: `e${i + 1}`, cardId: id, level: 1, growth: 0 }));
}

type Verdict = 'same' | 'known R-12.3' | 'differs';

function judge(before: BattleState, after: BattleState, events: Parameters<typeof actualRound>[1]): { verdict: Verdict; expected: RoundOutcome; actual: RoundOutcome } {
  const actual = actualRound(before, events, after);
  const expected = expectedRound(before, { refireNeedsValue: true });
  if (JSON.stringify(actual) === JSON.stringify(expected)) return { verdict: 'same', expected, actual };
  const asEngine = expectedRound(before, { refireNeedsValue: false });
  return { verdict: JSON.stringify(actual) === JSON.stringify(asEngine) ? 'known R-12.3' : 'differs', expected, actual };
}

/** A few enemy lines: the Training Dummy, and seeded random lines over every card in the table. */
function enemyLines(): (CardId | null)[][] {
  const out: (CardId | null)[][] = [[null, 'dummy-swing', null, 'dummy-swing']];
  let rng: RngState = seedRng(99);
  const pick = (): CardId | null => {
    const r = nextBelow(rng, ALL_CARDS.length + 1);
    rng = r.state;
    return r.value === 0 ? null : (ALL_CARDS[r.value - 1] ?? null);
  };
  for (let i = 0; i < 24; i++) out.push(Array.from({ length: RULES.lineLength }, pick));
  return out;
}

describe('R-07 R-08 R-10 R-11 R-12 R-13 R-14 every arrangement of cards does only what the rules allow', () => {
  it('R-12.3 matches the independent reading for every player line × 25 enemy lines × 3 rounds; the only difference is the known one', () => {
    const counts: Record<Verdict, number> = { same: 0, 'known R-12.3': 0, differs: 0 };
    const firstDiffs: unknown[] = [];
    for (const enemy of enemyLines()) {
      for (const player of allLines(PLAYER_CARDS)) {
        let state = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: player, playerHp: 60 });
        state = { ...state, enemy: { ...state.enemy, hp: 60, line: enemyLine(enemy) } };
        for (let round = 0; round < 3 && state.outcome === 'ongoing'; round++) {
          const { state: after, events } = step(state, { type: 'run' });
          const j = judge(state, after, events);
          counts[j.verdict]++;
          if (j.verdict === 'differs' && firstDiffs.length < 3) firstDiffs.push({ player, enemy, round: state.round, expected: j.expected, actual: j.actual });
          state = after;
        }
      }
    }
    expect(firstDiffs).toEqual([]);
    expect(counts.differs).toBe(0);
    // Echo right after Echo exists among these lines, so the known difference must show up;
    // if it stops showing up, the engine changed and RULES.md R-12.3 should be revisited.
    expect(counts['known R-12.3']).toBeGreaterThan(0);
    // Most battles last the 3 rounds; a few end early when a side reaches 0.
    expect(counts.same + counts['known R-12.3']).toBeGreaterThan(625 * 25 * 2);
  });
});

describe('R-10 R-11 every player line, played to the end of the battle', () => {
  it('R-11.1 matches the independent reading in every round up to the round limit', () => {
    const counts: Record<Verdict, number> = { same: 0, 'known R-12.3': 0, differs: 0 };
    const endings = { 'round-limit': 0, other: 0 };
    for (const player of allLines(PLAYER_CARDS)) {
      // Enough HP on both sides that most battles reach the round limit.
      let state = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: player, playerHp: 500 });
      state = { ...state, enemy: { ...state.enemy, hp: 500 } };
      while (state.outcome === 'ongoing') {
        const { state: after, events } = step(state, { type: 'run' });
        counts[judge(state, after, events).verdict]++;
        const end = events.find((e) => e.type === 'battle-end');
        if (end !== undefined) endings[end.reason === 'round-limit' ? 'round-limit' : 'other']++;
        state = after;
      }
    }
    expect(counts.differs).toBe(0);
    expect(endings['round-limit']).toBeGreaterThan(0);
    // Every battle ended exactly once, and no battle ran past the round limit.
    expect(endings['round-limit'] + endings.other).toBe(625);
    expect(counts.same + counts['known R-12.3']).toBeLessThanOrEqual(625 * RULES.maxRounds);
  });
});

/** Seeded random placements: any legal placement, any number of them, then run. */
function playRandom(seed: number, check: (before: BattleState, action: Parameters<typeof step>[1], result: ReturnType<typeof step>) => void): BattleState {
  let state = createBattle({ enemyId: 'training-dummy', seed });
  let rng = seedRng(seed ^ 0x5eed);
  const below = (n: number): number => {
    const r = nextBelow(rng, n);
    rng = r.state;
    return r.value;
  };
  while (state.outcome === 'ongoing') {
    const options = legalPlacements(state);
    const choice = below(options.length + 1); // options.length means "run now"
    const pick = options[choice];
    const action = pick === undefined ? ({ type: 'run' } as const) : ({ type: 'place', uid: pick.uid, slot: pick.slot } as const);
    const result = step(state, action);
    check(state, action, result);
    state = result.state;
  }
  return state;
}

describe('R-03 R-04 R-05 R-06 R-07 R-08 R-10 R-11 R-12 R-13 R-14 whole games with seeded random placements', () => {
  it('R-05.1 R-05.5 R-06.1 R-04.1 R-03.1 every placement and every round of 300 games does only what the rules allow', () => {
    const counts: Record<Verdict, number> = { same: 0, 'known R-12.3': 0, differs: 0 };
    const problems: string[] = [];
    const ended = { won: 0, lost: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const final = playRandom(seed, (before, action, { state: after, events }) => {
        const where = `seed ${seed} round ${before.round}`;
        if (action.type === 'place') {
          const card = before.player.hand.find((c) => c.uid === action.uid);
          if (card === undefined) return void problems.push(`${where}: placed a card not in hand`);
          const cost = CARDS[card.cardId as CardId].cost;
          const old = before.player.line[action.slot - 1] ?? null;
          // R-05.1: energy drops by the cost. R-05.5: a replaced card goes to the discard pile.
          if (after.player.energy !== before.player.energy - cost) problems.push(`${where}: energy ${before.player.energy} → ${after.player.energy} for cost ${cost}`);
          if (after.player.line[action.slot - 1]?.uid !== card.uid) problems.push(`${where}: card not on its slot`);
          if (old !== null && after.player.discard.at(-1)?.uid !== old.uid) problems.push(`${where}: replaced card not discarded`);
          if (after.player.hand.some((c) => c.uid === card.uid)) problems.push(`${where}: placed card still in hand`);
          return;
        }
        // R-06.1: the hand is discarded before the run.
        const handUids = before.player.hand.map((c) => c.uid);
        const discards = events.flatMap((e) => (e.type === 'discard' && e.from === 'hand' ? [e.uid] : []));
        if (JSON.stringify(discards) !== JSON.stringify(handUids)) problems.push(`${where}: hand not discarded`);
        const j = judge({ ...before, player: { ...before.player, hand: [], discard: [...before.player.discard, ...before.player.hand] } }, after, events);
        counts[j.verdict]++;
        if (j.verdict === 'differs' && problems.length < 5) problems.push(`${where}: ${JSON.stringify({ expected: j.expected, actual: j.actual })}`);
        if (after.outcome === 'ongoing') {
          // R-04.1 and R-03.1 for the next placement.
          if (after.player.energy !== RULES.energyPerRound) problems.push(`${where}: energy not reset`);
          const available = after.player.hand.length + after.player.drawPile.length + after.player.discard.length;
          if (after.player.hand.length !== Math.min(RULES.handSize, available)) problems.push(`${where}: hand ${after.player.hand.length}`);
        }
      });
      if (final.outcome === 'won') ended.won++;
      else ended.lost++;
    }
    expect(problems).toEqual([]);
    expect(counts.differs).toBe(0);
    expect(counts.same).toBeGreaterThan(300);
    expect(ended.won + ended.lost).toBe(300);
  });
});
