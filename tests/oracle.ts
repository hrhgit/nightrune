// A second, independent reading of the run rules (R-07 to R-14), written from the requirement
// text in RULES.md and not from engine/battle.ts. It reads only the card and rule tables.
// Tests compare what it says each slot must do with what the engine did, so any engine result
// the rules do not allow shows up as a difference.
import { CARDS } from '../data/cards.ts';
import { RULES } from '../data/rules.ts';
import type { BattleState, CardInstance, GameEvent, Owner, Slot } from '../engine/index.ts';

type CardTable = Record<string, (typeof CARDS)[keyof typeof CARDS]>;
const TABLE: CardTable = CARDS;

/** R-14.2: table value at the card's level plus its growth; null for a card with no value (Echo). */
function value(card: CardInstance): number | null {
  const effect = TABLE[card.cardId]?.effect;
  if (effect === undefined) throw new Error(`unknown card ${card.cardId}`);
  return 'amount' in effect ? (effect.amount[card.level - 1] ?? 0) + card.growth : null;
}

/** What one slot of one round did, in a form that does not depend on event order. */
export interface SlotOutcome {
  round: number;
  slot: number;
  fired: string[];
  grows: string[];
  copies: string[];
  fizzles: string[];
  blocked: Record<Owner, number>;
  damage: Record<Owner, number>;
  hpAfter: Record<Owner, number>;
}

export interface RoundOutcome {
  slots: SlotOutcome[];
  end: 'won' | 'lost' | null;
  /** Growth on every line card after the round, by uid. */
  growth: Record<string, number>;
  /** HP of both sides after the round: for the engine, as stored in the state, not as its events report. */
  hp: Record<Owner, number>;
}

/** The run of `state.round` as the rules describe it. `state` is a battle in placement. */
export function expectedRound(state: BattleState): RoundOutcome {
  const lines: Record<Owner, Slot[]> = { player: [...state.player.line], enemy: [...state.enemy.line] };
  const hp: Record<Owner, number> = { player: state.player.hp, enemy: state.enemy.hp };
  const slots: SlotOutcome[] = [];
  const round = state.round;
  const tag = (side: Owner, c: CardInstance): string => `${side}:${c.uid}`;

  for (let slot = 1; slot <= RULES.lineLength; slot++) {
    const out: SlotOutcome = {
      round, slot, fired: [], grows: [], copies: [], fizzles: [],
      blocked: { player: 0, enemy: 0 }, damage: { player: 0, enemy: 0 }, hpAfter: { player: 0, enemy: 0 },
    };
    const attack: Record<Owner, number> = { player: 0, enemy: 0 };
    const block: Record<Owner, number> = { player: 0, enemy: 0 };

    // R-12.1: "next" is one slot higher, "previous" one lower, on the same line.
    // R-12.2, R-12.5: off the line or empty → fizzle, never a farther card (R-12.4).
    const aim = (side: Owner, from: number, dir: 'next' | 'previous'): { at: number; card: CardInstance } | string => {
      const at = dir === 'next' ? from + 1 : from - 1;
      if (at < 1 || at > RULES.lineLength) return 'no-slot';
      const card = lines[side][at - 1] ?? null;
      return card === null ? `empty-slot ${at}` : { at, card };
    };

    // The card in `at` for `side` fires with the effect of `acting` (itself, or what it copies,
    // R-13.1); targets are counted from `at` (R-13.4); everything it adds counts in `slot` (R-08.1, R-13.2).
    const fire = (side: Owner, at: number, acting: CardInstance): void => {
      const card = lines[side][at - 1];
      if (card === null || card === undefined) return;
      const effect = TABLE[acting.cardId]?.effect;
      if (effect === undefined) throw new Error(`unknown card ${card.cardId}`);
      const who = `${tag(side, card)}@${at}`;
      switch (effect.kind) {
        case 'attack':
          attack[side] += value(acting) ?? 0;
          return;
        case 'block':
          block[side] += value(acting) ?? 0;
          return;
        case 'grow': {
          const t = aim(side, at, effect.target);
          if (typeof t === 'string') return void out.fizzles.push(`${who} ${t}`);
          const before = value(t.card);
          if (before === null) return void out.fizzles.push(`${who} no-value ${t.at}`); // R-12.3
          const amount = value(acting) ?? 0;
          // R-14.2: growth lands now and stays on the card.
          lines[side][t.at - 1] = { ...t.card, growth: t.card.growth + amount };
          out.grows.push(`${who} -> ${tag(side, t.card)}@${t.at} +${amount} = ${before + amount}`);
          return;
        }
        case 'copy': {
          const t = aim(side, at, effect.target);
          if (typeof t === 'string') return void out.fizzles.push(`${who} ${t}`);
          // R-13.5: a copy of a copy card is a copy of what it copies; R-13.6: a chain that reaches
          // an empty slot or the end of the line copies nothing.
          let copied: CardInstance | null = t.card;
          let from = t.at;
          while (copied !== null && TABLE[copied.cardId]?.effect.kind === 'copy') {
            from -= 1;
            copied = from >= 1 ? (lines[side][from - 1] ?? null) : null;
          }
          if (copied === null) return void out.fizzles.push(`${who} nothing-to-copy ${t.at}`);
          out.copies.push(`${who} -> ${tag(side, t.card)}@${t.at} as ${tag(side, copied)}@${from} ${copied.cardId}`);
          fire(side, at, copied); // R-13.3: its current value, growth included
          return;
        }
      }
    };

    // R-07.2–R-07.4: every card in this slot fires; an empty slot fires nothing.
    for (const side of ['player', 'enemy'] as const) {
      const card = lines[side][slot - 1] ?? null;
      if (card === null) continue;
      out.fired.push(tag(side, card));
      fire(side, slot, card);
    }

    // R-08.2, R-08.3: damage = opposing attack − own block, at least 0, both at once.
    for (const side of ['player', 'enemy'] as const) {
      const incoming = attack[side === 'player' ? 'enemy' : 'player'];
      out.blocked[side] = Math.min(incoming, block[side]);
      out.damage[side] = Math.max(0, incoming - block[side]);
    }
    // R-07.4: a slot empty on both sides is skipped; nothing about it is recorded.
    if (out.fired.length === 0) continue;
    for (const side of ['player', 'enemy'] as const) hp[side] = Math.max(0, hp[side] - out.damage[side]);
    out.hpAfter = { ...hp };
    out.fired.sort();
    slots.push(out);

    // R-10.1–R-10.3.
    if (hp.player <= 0) return { slots, end: 'lost', growth: growthOf(lines), hp: { ...hp } };
    if (hp.enemy <= 0) return { slots, end: 'won', growth: growthOf(lines), hp: { ...hp } };
  }
  // R-11.1.
  return { slots, end: round >= RULES.maxRounds ? 'lost' : null, growth: growthOf(lines), hp: { ...hp } };
}

function growthOf(lines: Record<Owner, Slot[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const side of ['player', 'enemy'] as const) for (const c of lines[side]) if (c !== null) out[`${side}:${c.uid}`] = c.growth;
  return out;
}

/** The same summary, read from the events the engine emitted for one `run` step and the state after it. */
export function actualRound(before: BattleState, events: readonly GameEvent[], after: BattleState): RoundOutcome {
  const round = before.round;
  const bySlot = new Map<number, SlotOutcome>();
  const get = (slot: number): SlotOutcome => {
    let o = bySlot.get(slot);
    if (o === undefined) {
      o = { round, slot, fired: [], grows: [], copies: [], fizzles: [], blocked: { player: 0, enemy: 0 }, damage: { player: 0, enemy: 0 }, hpAfter: { player: 0, enemy: 0 } };
      bySlot.set(slot, o);
    }
    return o;
  };
  let end: RoundOutcome['end'] = null;
  const hits: Extract<GameEvent, { type: 'damage' }>[] = [];
  for (const e of events) {
    if ('round' in e && e.round !== round) continue; // the next round's placement events
    switch (e.type) {
      case 'trigger':
        get(e.slot).fired.push(`${e.side}:${e.uid}`);
        break;
      case 'grow':
        get(e.slot).grows.push(`${e.side}:${e.uid}@${e.sourceSlot} -> ${e.side}:${e.targetUid}@${e.targetSlot} +${e.amount} = ${e.valueAfter}`);
        break;
      case 'copy':
        get(e.slot).copies.push(`${e.side}:${e.uid}@${e.sourceSlot} -> ${e.side}:${e.targetUid}@${e.targetSlot} as ${e.side}:${e.asUid}@${e.asSlot} ${e.asCardId}`);
        break;
      case 'fizzle':
        get(e.slot).fizzles.push(`${e.side}:${e.uid}@${e.sourceSlot} ${e.reason}${e.targetSlot === null ? '' : ` ${e.targetSlot}`}`);
        break;
      case 'block':
        get(e.slot).blocked[e.side] = e.blocked;
        break;
      case 'damage':
        get(e.slot).damage[e.target] = e.amount;
        hits.push(e);
        break;
      case 'battle-end':
        end = e.outcome;
        break;
      default:
        break;
    }
  }
  // HP after a slot, as the engine reported it in its damage events (unchanged when nothing hit).
  const slots: SlotOutcome[] = [];
  const hp: Record<Owner, number> = { player: before.player.hp, enemy: before.enemy.hp };
  for (const slot of [...bySlot.keys()].sort((a, b) => a - b)) {
    const o = get(slot);
    for (const h of hits) if (h.slot === slot) hp[h.target] = h.hpAfter;
    o.hpAfter = { ...hp };
    o.fired.sort();
    slots.push(o);
  }
  const lines: Record<Owner, Slot[]> = { player: [...after.player.line], enemy: [...after.enemy.line] };
  return { slots, end, growth: growthOf(lines), hp: { player: after.player.hp, enemy: after.enemy.hp } };
}
