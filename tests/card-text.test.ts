// Each card's own text, read literally, holds when the card is played in the situation its text
// describes. The cases come from the card table, so a new card cannot be added without one:
// the switch on the effect kind stops compiling until the new kind has a case.
// Where a text does not hold in some other situation, RULES.md "Open design questions" says so.
import { describe, expect, it } from 'vitest';
import { CARDS, type CardId } from '../data/cards.ts';
import { assertNever, createBattle, step, type BattleState, type CardInstance, type GameEvent, type Level } from '../engine/index.ts';
import { cardEffectText } from '../present/text.ts';

const IDS = Object.keys(CARDS) as CardId[];

function card(cardId: string, uid: string, level: Level = 1): CardInstance {
  return { uid, cardId, level, growth: 0 };
}

/** A battle with the given lines on both sides and plenty of HP, so nothing ends it. */
function battle(player: (CardInstance | null)[], enemy: (CardInstance | null)[]): BattleState {
  const base = createBattle({ enemyId: 'training-dummy', seed: 1, playerLine: [null, null, null, null], playerHp: 100 });
  return { ...base, player: { ...base.player, line: player }, enemy: { ...base.enemy, hp: 100, line: enemy } };
}

const numberIn = (text: string): number => Number(/(\d+)/.exec(text)?.[1]);
const damageTo = (events: readonly GameEvent[], target: 'player' | 'enemy', slot: number): number =>
  events.reduce((n, e) => n + (e.type === 'damage' && e.target === target && e.slot === slot ? e.amount : 0), 0);

describe('every card does what its own text says', () => {
  for (const id of IDS) {
    for (const level of [1, 2, 3] as const) {
      const text = cardEffectText({ cardId: id, level, growth: 0 });
      it(`${CARDS[id].name} level ${level}: "${text}"`, () => {
        const kind = CARDS[id].effect.kind;
        const self = card(id, 'x', level);
        switch (kind) {
          case 'attack': {
            // "Deals N damage to the opposing slot": an unblocked target takes exactly N, in that slot only.
            const { events } = step(battle([self, null, null, null], [null, null, null, null]), { type: 'run' });
            expect(damageTo(events, 'enemy', 1)).toBe(numberIn(text));
            expect(events.filter((e) => e.type === 'damage').length).toBe(1);
            return;
          }
          case 'block': {
            // "Blocks N damage from the opposing slot only": against a bigger attack, N is cancelled;
            // the same attack in another slot is not.
            // Level 3 Slash with growth: an attack bigger than any block in the table.
            const big: CardInstance = { ...card('slash', 'big', 3), growth: 10 };
            const { events } = step(battle([self, null, null, null], [big, { ...big, uid: 'big2' }, null, null]), { type: 'run' });
            const attack = CARDS.slash.effect.amount[2] + 10;
            expect(attack).toBeGreaterThan(numberIn(text));
            expect(damageTo(events, 'player', 1)).toBe(attack - numberIn(text));
            expect(damageTo(events, 'player', 2)).toBe(attack);
            return;
          }
          case 'grow': {
            // "Gives the next card +N for the rest of the battle": the next card's hit grows by N each
            // time this card fires, and keeps it in later rounds.
            const target = card('slash', 't');
            let state = battle([self, target, null, null], [null, null, null, null]);
            const hits: number[] = [];
            for (let r = 0; r < 3; r++) {
              const out = step(state, { type: 'run' });
              hits.push(damageTo(out.events, 'enemy', 2));
              state = out.state;
            }
            const base = CARDS.slash.effect.amount[0];
            const n = numberIn(text);
            expect(hits).toEqual([base + n, base + 2 * n, base + 3 * n]);
            return;
          }
          case 'copy': {
            // "Acts as a copy of the previous card, in this slot": after a Slash it hits for the
            // Slash's value in its own slot; after a Whetstone it grows the card after itself.
            const hit = CARDS.slash.effect.amount[0];
            const afterSlash = step(battle([card('slash', 'p'), self, null, null], [null, null, null, null]), { type: 'run' });
            expect(damageTo(afterSlash.events, 'enemy', 2)).toBe(hit);
            const afterWhet = step(battle([card('whetstone', 'w'), self, card('slash', 't'), null], [null, null, null, null]), { type: 'run' });
            expect(damageTo(afterWhet.events, 'enemy', 3)).toBe(hit + CARDS.whetstone.effect.amount[0]);
            return;
          }
          default:
            return assertNever(kind);
        }
      });
    }
  }
});
