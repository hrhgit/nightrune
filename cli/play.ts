// Plays one battle with the greedy bot and prints every engine event.
// Usage: npm run play [-- --seed 7] [-- --json]
import { CARDS, type CardId } from '../data/cards.ts';
import { ENEMIES } from '../data/enemies.ts';
import { playGreedy } from '../bots/greedy.ts';
import { startBattle, type GameEvent } from '../engine/index.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const seedArg = args[args.indexOf('--seed') + 1];
const seed = args.includes('--seed') ? Number(seedArg) : 1;

const opening = startBattle({ enemyId: 'training-dummy', seed });
const played = playGreedy(opening.state);
const events = [...opening.events, ...played.events];

function cardName(id: string): string {
  return id in CARDS ? CARDS[id as CardId].name : id;
}

function describe(e: GameEvent): string {
  switch (e.type) {
    case 'shuffle':
      return `  shuffle ${e.count} cards from ${e.source}`;
    case 'placement-start':
      return `\nRound ${e.round} placement, energy ${e.energy}`;
    case 'draw':
      return `  draw ${e.uid} ${cardName(e.cardId)}`;
    case 'place':
      return `  place ${e.uid} ${cardName(e.cardId)} in slot ${e.slot} (cost ${e.cost}, energy left ${e.energyAfter})`;
    case 'discard':
      return `  discard ${e.uid} ${cardName(e.cardId)} from ${e.from}`;
    case 'round-start':
      return `Round ${e.round} run`;
    case 'trigger':
      return `  slot ${e.slot}  ${e.side.padEnd(6)} fires ${cardName(e.cardId)}`;
    case 'damage':
      return `  slot ${e.slot}  ${e.target.padEnd(6)} takes ${e.amount} -> hp ${e.hpAfter}`;
    case 'battle-end':
      return `\nBattle over in round ${e.round}: ${e.outcome} (${e.reason})`;
  }
}

if (json) {
  console.log(JSON.stringify({ seed, actions: played.actions, events, final: played.state }, null, 2));
} else {
  const enemy = ENEMIES['training-dummy'];
  console.log(`Nightrune battle vs ${enemy.name} (hp ${enemy.hp}), seed ${seed}, greedy bot`);
  for (const e of events) console.log(describe(e));
  console.log(`Final hp: player ${played.state.player.hp}, enemy ${played.state.enemy.hp}`);
}
