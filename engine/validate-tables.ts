import { CARDS } from '../data/cards.ts';
import { ENEMIES } from '../data/enemies.ts';
import type { CardDef, EnemyDef } from './types.ts';

export interface GameTables {
  readonly cards: Readonly<Record<string, CardDef>>;
  readonly enemies: Readonly<Record<string, EnemyDef>>;
}

function fail(table: string, id: string, field: string, value: unknown, reason: string): never {
  const shownValue = typeof value === 'number' && !Number.isFinite(value) ? String(value) : JSON.stringify(value);
  throw new Error(`${table} ${id} field ${field} has bad value ${shownValue}: ${reason}`);
}

/** Check the game tables before the engine can create a battle. */
export function validateTables({ cards, enemies }: GameTables): void {
  for (const [id, card] of Object.entries(cards)) {
    if (!Number.isInteger(card.cost) || card.cost < 0) fail('cards', id, 'cost', card.cost, 'must be a whole number greater than or equal to 0');
    if (card.effect.kind === 'copy') continue;

    const field = 'effect.amount';
    const values: readonly number[] = card.effect.amount;
    if (values.length !== 3) fail('cards', id, field, values, 'must list one value for each of 3 levels');
    for (let i = 0; i < values.length; i++) {
      const value = values[i]!;
      if (!Number.isInteger(value) || value <= 0) fail('cards', id, `${field}[${i}]`, value, 'must be a positive whole number');
      if (i > 0 && value <= values[i - 1]!) fail('cards', id, field, values, 'values must strictly increase with level');
    }
  }

  for (const [id, enemy] of Object.entries(enemies)) {
    for (const [slot, cardId] of enemy.line.entries()) {
      if (cardId === null) continue;
      const card = cards[cardId];
      if (!card || card.owner !== 'enemy') fail('enemies', id, `line[${slot}]`, cardId, 'must name an existing enemy card');
    }
  }
}

validateTables({ cards: CARDS, enemies: ENEMIES });
