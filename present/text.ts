// Human-readable text for engine data, shared by the CLI and the web page.
// Presentation only: it reads the card table and event payloads and computes no rules.
import { assertNever, cardDef, cardValue, enemyDef, type CardInstance, type FizzleReason, type GameEvent, type RejectReason } from '../engine/index.ts';

/** The number printed on a card: table value plus growth, computed by the engine (R-14). */
export { cardValue };

export function cardName(cardId: string): string {
  return cardDef(cardId).name;
}

/**
 * A piece of a card's effect text: plain words, or the card's value (the number in the sentence).
 * The page draws the value in its own style, so it gets the number as a part rather than
 * searching the sentence for digits.
 */
export interface EffectPart {
  readonly kind: 'text' | 'value';
  readonly text: string;
}

const plain = (text: string): EffectPart => ({ kind: 'text', text });
const valuePart = (text: string): EffectPart => ({ kind: 'value', text });

type Card = Pick<CardInstance, 'cardId' | 'level' | 'growth'>;

/** The full sentence, for the aria-label and the log. The face uses the short form below. */
function sentenceParts(card: Card, value: string): readonly EffectPart[] {
  const kind = cardDef(card.cardId).effect.kind;
  switch (kind) {
    case 'attack':
      return [plain('Deals '), valuePart(value), plain(' damage to the opposing slot.')];
    case 'block':
      return [plain('Blocks '), valuePart(value), plain(' damage from the opposing slot only.')];
    case 'grow':
      return [plain('Gives the next card '), valuePart(`+${value}`), plain(' for the rest of the battle.')];
    case 'copy':
      return [plain('Acts as a copy of the previous card, in this slot.')];
    default:
      return assertNever(kind);
  }
}

/**
 * What a card does at its level, as the short phrase printed on its face ("Deal 9"), in parts.
 * `shownValue` replaces the card's current value; the page passes a value taken from an event
 * payload (a grow event's `valueAfter`) while a round is animating. The full sentence is
 * `cardEffectText`; both take the value from the same place.
 */
export function cardEffectParts(card: Card, shownValue?: number): readonly EffectPart[] {
  const kind = cardDef(card.cardId).effect.kind;
  const value = String(shownValue ?? cardValue(card));
  switch (kind) {
    case 'attack':
      return [plain('Deal '), valuePart(value)];
    case 'block':
      return [plain('Block '), valuePart(value)];
    case 'grow':
      return [plain('Next card '), valuePart(`+${value}`)];
    case 'copy':
      return [plain('Copy previous card')];
    default:
      return assertNever(kind);
  }
}

/** One-line description of what a card does at its level, for the aria-label and the log. */
export function cardEffectText(card: Card): string {
  return sentenceParts(card, String(cardValue(card)))
    .map((p) => p.text)
    .join('');
}

const FIZZLE_TEXT: Record<FizzleReason, (e: Extract<GameEvent, { type: 'fizzle' }>) => string> = {
  'no-slot': (e) => `there is no ${e.target} slot`,
  'empty-slot': (e) => `slot ${e.targetSlot} is empty`,
  'no-value': (e) => `the card in slot ${e.targetSlot} has no value to change`,
  'nothing-to-copy': (e) => `the card in slot ${e.targetSlot} copies nothing`,
};

/** "Slot 3: " for a card firing in its own slot; "Slot 3 (from slot 2): " for one fired again by another card. */
// Every effect acts from the slot that is firing (a copy acts in its own slot, R-13.4).
function at(e: { slot: number }): string {
  return `Slot ${e.slot}: `;
}

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
      return `${at(e)}${cardName(e.cardId)} gives ${cardName(e.targetCardId)} in slot ${e.targetSlot} +${e.amount} for the battle (now ${e.valueAfter}).`;
    case 'copy':
      return e.asCardId === e.targetCardId
        ? `${at(e)}${cardName(e.cardId)} copies ${cardName(e.targetCardId)} in slot ${e.targetSlot}.`
        : `${at(e)}${cardName(e.cardId)} copies ${cardName(e.targetCardId)} in slot ${e.targetSlot}, which copies ${cardName(e.asCardId)}.`;
    case 'fizzle':
      return `${at(e)}${cardName(e.cardId)} fizzles: ${FIZZLE_TEXT[e.reason](e)}.`;
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
