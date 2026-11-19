// Plays one scaffold battle and prints every engine event.
// Usage: npm run play [-- --json]
import { CARDS, type CardId } from '../data/cards.ts';
import { ENEMIES } from '../data/enemies.ts';
import { SCAFFOLD_PLAYER_LINE } from '../data/scaffold.ts';
import { createBattle, runToEnd, type GameEvent } from '../engine/index.ts';

const json = process.argv.includes('--json');

const initial = createBattle({ enemyId: 'training-rig', playerLine: SCAFFOLD_PLAYER_LINE });
const { state, events } = runToEnd(initial);

function cardName(id: string): string {
  return id in CARDS ? CARDS[id as CardId].name : id;
}

function lineText(ids: readonly (string | null)[]): string {
  return ids.map((id, i) => `${i + 1}:${id === null ? '-' : cardName(id)}`).join('  ');
}

function describe(e: GameEvent): string {
  switch (e.type) {
    case 'round-start':
      return `\nRound ${e.round}`;
    case 'trigger':
      return `  slot ${e.slot}  ${e.side.padEnd(6)} fires ${cardName(e.cardId)}`;
    case 'damage':
      return `  slot ${e.slot}  ${e.target.padEnd(6)} takes ${e.amount} -> hp ${e.hpAfter}`;
    case 'battle-end':
      return `\nBattle over in round ${e.round}: ${e.outcome} (${e.reason})`;
  }
}

if (json) {
  console.log(JSON.stringify({ events, final: state }, null, 2));
} else {
  const enemy = ENEMIES[initial.enemyId as keyof typeof ENEMIES];
  console.log(`Beltdeck scaffold battle vs ${enemy.name} (hp ${enemy.hp})`);
  console.log(`Player line: ${lineText(SCAFFOLD_PLAYER_LINE)}`);
  console.log(`Enemy line:  ${lineText(enemy.line)}`);
  for (const e of events) console.log(describe(e));
  console.log(`Final hp: player ${state.player.hp}, enemy ${state.enemy.hp}`);
}
