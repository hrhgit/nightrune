// The scene preview (web/scenes.ts) sets the board by hand. These checks keep its numbers honest:
// every card exists, and every damage or block label matches what R-08 would give for the cards
// in that slot, so a preview never shows a moment the rules cannot produce.
import { describe, expect, it } from 'vitest';
import { cardDef, type Level, type Owner } from '../engine/index.ts';
import { SCENES, type CardRef, type SceneSpec } from '../web/scenes.ts';

function card(ref: CardRef | null | undefined): { id: string; level: Level } | null {
  if (ref === null || ref === undefined) return null;
  return typeof ref === 'string' ? { id: ref, level: 1 } : { id: ref[0], level: ref[1] };
}

/** Attack and block of the card in a slot, from the card table through the engine. */
function power(spec: SceneSpec, side: Owner, slot: number): { attack: number; block: number } {
  const c = card((side === 'player' ? spec.playerLine : spec.enemyLine)[slot - 1]);
  if (c === null) return { attack: 0, block: 0 };
  const effect = cardDef(c.id).effect;
  const value = effect.amount[c.level - 1] ?? 0;
  return { attack: effect.kind === 'attack' ? value : 0, block: effect.kind === 'block' ? value : 0 };
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
          } else {
            const hit = power(spec, other(e.target), e.slot).attack - power(spec, e.target, e.slot).block;
            expect(e.amount).toBe(Math.max(0, hit));
            expect(e.amount).toBeGreaterThan(0);
          }
        }
      });

      it('HP shown matches the damage events: now is hpAfter, before minus now is the amount', () => {
        for (const { event: e } of spec.impacts ?? []) {
          if (e.type !== 'damage') continue;
          const hp = spec.hp?.[e.target];
          expect(hp?.[0]).toBe(e.hpAfter);
          if (hp?.[2] !== undefined) expect(hp[2] - hp[0]).toBe(e.amount);
        }
      });
    });
  }
});
