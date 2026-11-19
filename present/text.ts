// Human-readable text for engine data, shared by the CLI and the web page.
// Presentation only: it reads the card table and event payloads and computes no rules.
import { assertNever, cardDef, cardValue, enemyDef, type CardInstance, type FizzleReason, type GameEvent, type RejectReason } from '../engine/index.ts';

/** The number printed on a card: table value plus growth, computed by the engine (R-14). */
export { cardValue };

export function cardName(cardId: string): string {
  return cardDef(cardId).name;
}

/** One-line description of what a card does at its level, read from the card table. */
export function cardEffectText(card: Pick<CardInstance, 'cardId' | 'level' | 'growth'>): string {
  const effect = cardDef(card.cardId).effect;
  const kind = effect.kind;
  switch (kind) {
    case 'attack':
      return `Deals ${cardValue(card)} damage to the opposing slot.`;
    case 'block':
      return `Blocks ${cardValue(card)} damage from the opposing slot only.`;
    case 'grow':
      return `Gives the next card +${cardValue(card)} for the rest of the battle.`;
    default:
      return assertNever(kind);
  }
}

const FIZZLE_TEXT: Record<FizzleReason, (slot: number) => string> = {
  'no-slot': () => 'there is no next slot',
  'empty-slot': (slot) => `slot ${slot + 1} is empty`,
  'no-value': (slot) => `the card in slot ${slot + 1} has no value to change`,
};

const SIDE: Record<'player' | 'enemy', string> = { player: 'You', enemy: 'Enemy' };

export function eventText(e: GameEvent, enemyId: string): string {
  const enemyName = enemyDef(enemyId).name;
  const who = (side: 'player' | 'enemy'): string => (side === 'player' ? SIDE.player : enemyName);
  switch (e.type) {
    case 'shuffle':
      return e.source === 'deck' ? `Deck shuffled (${e.count} cards).` : `Discard pile shuffled into the draw pile (${e.count} cards).`;
    case 'placement-start':
      return `Round ${e.round}: energy set to ${e.energy}.`;
    case 'draw':
      return `Drew ${cardName(e.cardId)}.`;
    case 'place':
      return e.replaced === null
        ? `Placed ${cardName(e.cardId)} in slot ${e.slot} for ${e.cost} energy.`
        : `Placed ${cardName(e.cardId)} in slot ${e.slot} for ${e.cost} energy, replacing the card there.`;
    case 'discard':
      return e.from === 'hand' ? `${cardName(e.cardId)} discarded from hand.` : `${cardName(e.cardId)} discarded from the line.`;
    case 'round-start':
      return `Round ${e.round}: the lines strike.`;
    case 'trigger':
      return `Slot ${e.slot}: ${who(e.side)} ${e.side === 'player' ? 'fire' : 'fires'} ${cardName(e.cardId)}.`;
    case 'block':
      return `Slot ${e.slot}: ${who(e.side)} ${e.side === 'player' ? 'block' : 'blocks'} ${e.blocked} of ${e.incoming} damage.`;
    case 'damage':
      return `Slot ${e.slot}: ${who(e.target)} ${e.target === 'player' ? 'take' : 'takes'} ${e.amount} damage, ${e.hpAfter} HP left.`;
    case 'grow':
      return `Slot ${e.slot}: ${cardName(e.cardId)} gives ${cardName(e.targetCardId)} in slot ${e.targetSlot} +${e.amount} for the battle (now ${e.valueAfter}).`;
    case 'fizzle':
      return `Slot ${e.slot}: ${cardName(e.cardId)} fizzles: ${FIZZLE_TEXT[e.reason](e.slot)}.`;
    case 'battle-end':
      return battleEndText(e.reason, e.round, enemyName);
    default:
      return assertNever(e);
  }
}

export function battleEndText(
  reason: Extract<GameEvent, { type: 'battle-end' }>['reason'],
  round: number,
  enemyName: string,
): string {
  switch (reason) {
    case 'enemy-defeated':
      return `${enemyName} falls in round ${round}. You win.`;
    case 'player-defeated':
      return `You fall in round ${round}. You lose.`;
    case 'both-defeated':
      return `You and ${enemyName} fall in the same strike in round ${round}. A double knockout counts as a loss.`;
    case 'round-limit':
      return `${enemyName} still stands after round ${round}, the last round. You lose.`;
    default:
      return assertNever(reason);
  }
}

/** Why a placement was refused, in words a player can act on. */
export function rejectText(reason: RejectReason): string {
  switch (reason) {
    case 'battle-over':
      return 'The battle is over. Start a new battle to keep playing.';
    case 'card-not-in-hand':
      return 'That card is no longer in your hand.';
    case 'slot-out-of-range':
      return 'Choose one of the four slots on your line.';
    case 'not-enough-energy':
      return 'Not enough energy for this card. Fight the round to refill energy.';
    case 'merge-not-built':
      return 'A card cannot go on a card with the same name yet. Merging comes in a later update.';
    default:
      return assertNever(reason);
  }
}
