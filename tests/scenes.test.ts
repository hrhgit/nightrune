// The scene preview (web/scenes.ts) sets the board by hand. These checks keep its numbers honest:
// every card exists, and every damage or block label matches what R-08 would give for the cards
// in that slot, so a preview never shows a moment the rules cannot produce.
import { describe, expect, it } from 'vitest';
import { cardDef, cardValue, type Level, type Owner } from '../engine/index.ts';
import { SCENES, type CardRef, type SceneSpec } from '../web/scenes.ts';

function card(ref: CardRef | null | undefined): { id: string; level: Level; growth: number } | null {
  if (ref === null || ref === undefined) return null;
  return typeof ref === 'string' ? { id: ref, level: 1, growth: 0 } : { id: ref[0], level: ref[1], growth: ref[2] ?? 0 };
}

function cardAt(spec: SceneSpec, side: Owner, slot: number): { id: string; level: Level; growth: number } | null {
  return card((side === 'player' ? spec.playerLine : spec.enemyLine)[slot - 1]);
}

/** Attack and block of the card in a slot, from the card table through the engine. */
function power(spec: SceneSpec, side: Owner, slot: number): { attack: number; block: number } {
  const c = cardAt(spec, side, slot);
  if (c === null) return { attack: 0, block: 0 };
  const kind = cardDef(c.id).effect.kind;
  const value = cardValue({ cardId: c.id, level: c.level, growth: c.growth }) ?? 0;
  return { attack: kind === 'attack' ? value : 0, block: kind === 'block' ? value : 0 };
}

const other = (side: Owner): Owner => (side === 'player' ? 'enemy' : 'player');

describe('scene preview definitions', () => {
  it('have unique ids', () => {
    const ids = SCENES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const spec of SCENES) {
    describe(spec.id, () => {
      it('uses only real cards, and the player line only player cards', () => {
        for (const ref of [...spec.enemyLine, ...spec.playerLine, ...(spec.hand ?? [])]) {
          const c = card(ref);
          if (c !== null) expect(() => cardDef(c.id)).not.toThrow();
        }
        for (const ref of [...spec.playerLine, ...(spec.hand ?? [])]) {
          const c = card(ref);
          if (c !== null) expect(cardDef(c.id).owner).toBe('player');
        }
      });

      it('points only at slots and hand cards that exist', () => {
        for (const f of spec.firing ?? []) expect(card((f.side === 'player' ? spec.playerLine : spec.enemyLine)[f.slot - 1])).not.toBeNull();
        for (const t of [...(spec.targets ?? []), ...(spec.hover === undefined ? [] : [spec.hover])]) expect(t >= 1 && t <= 4).toBe(true);
        if (spec.selected !== undefined) expect(spec.hand?.[spec.selected]).toBeDefined();
      });

      it('R-08: damage and block labels match the cards in their slot', () => {
        for (const { event: e } of spec.impacts ?? []) {
          if (e.type === 'block') {
            const incoming = power(spec, other(e.side), e.slot).attack;
            expect(e.incoming).toBe(incoming);
            expect(e.blocked).toBe(Math.min(incoming, power(spec, e.side, e.slot).block));
            expect(e.blocked).toBeGreaterThan(0);
          } else if (e.type === 'damage') {
            const hit = power(spec, other(e.target), e.slot).attack - power(spec, e.target, e.slot).block;
            expect(e.amount).toBe(Math.max(0, hit));
            expect(e.amount).toBeGreaterThan(0);
          }
        }
      });

      it('R-12 R-13 R-14: grow, copy and fizzle marks match the cards on the line', () => {
        for (const { event: e } of spec.impacts ?? []) {
          if (e.type !== 'grow' && e.type !== 'copy' && e.type !== 'fizzle') continue;
          const source = cardAt(spec, e.side, e.sourceSlot);
          expect(source?.id).toBe(e.cardId);
          if (source === null || source === undefined) throw new Error(`${e.type} needs a source`);
          // R-13: a grow or fizzle from a copy card is the effect of the card it copies, aimed from its own slot.
          const copied = e.type !== 'copy' && cardDef(source.id).effect.kind === 'copy' ? cardAt(spec, e.side, e.sourceSlot - 1) : source;
          if (copied === null || copied === undefined) throw new Error(`${e.cardId} copies nothing`);
          const effect = cardDef(copied.id).effect;
          if (effect.kind !== 'grow' && effect.kind !== 'copy') throw new Error(`${copied.id} has no target`);
          const aim = effect.target === 'next' ? e.sourceSlot + 1 : e.sourceSlot - 1;
          const target = aim >= 1 && aim <= 4 ? cardAt(spec, e.side, aim) : undefined;
          if (e.type === 'fizzle') {
            expect(e.target).toBe(effect.target);
            expect(e.targetSlot).toBe(target === undefined ? null : aim);
            if (target === undefined || target === null) expect(e.reason).toBe(target === undefined ? 'no-slot' : 'empty-slot');
            else expect(['no-value', 'nothing-to-copy']).toContain(e.reason);
            continue;
          }
          if (target === null || target === undefined) throw new Error(`${e.type} needs a target`);
          expect([e.targetSlot, e.targetCardId]).toEqual([aim, target.id]);
          if (e.type === 'copy') {
            // R-13.5: the card copied is the first card at or before the target that is not a copy card.
            const as = cardAt(spec, e.side, e.asSlot);
            expect(as?.id).toBe(e.asCardId);
            expect(e.asSlot).toBeLessThanOrEqual(e.targetSlot);
            if (as !== null && as !== undefined) expect(cardDef(as.id).effect.kind).not.toBe('copy');
            continue;
          }
          expect(e.amount).toBe(cardValue({ cardId: copied.id, level: copied.level, growth: copied.growth }));
          // The scene shows the moment after growth landed: the target already carries it.
          expect(e.valueAfter).toBe(cardValue({ cardId: target.id, level: target.level, growth: target.growth }));
        }
      });

      it('HP shown matches the damage events: now is hpAfter, before is given and before minus now is the amount', () => {
        for (const { event: e } of spec.impacts ?? []) {
          if (e.type !== 'damage') continue;
          const hp = spec.hp?.[e.target];
          expect(hp?.[0]).toBe(e.hpAfter);
          // Required: without it the preview draws no lost-HP band for the hit.
          expect(hp?.[2]).toBeDefined();
          expect((hp?.[2] ?? 0) - (hp?.[0] ?? 0)).toBe(e.amount);
        }
      });
    });
  }
});
