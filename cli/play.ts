// Plays one battle with the greedy bot and prints every engine event.
// Usage: npm run play [-- --seed 7] [-- --json]
import { playGreedy } from '../bots/greedy.ts';
import { enemyDef, startBattle } from '../engine/index.ts';
import { parseSeed, SEED_HELP } from '../present/seed.ts';
import { eventText } from '../present/text.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const seedAt = args.indexOf('--seed');
const parsed = seedAt === -1 ? 1 : parseSeed(args[seedAt + 1]);
if (parsed === null) {
  console.error(`--seed needs a value. ${SEED_HELP}\nUsage: npm run play [-- --seed 7] [-- --json]`);
  process.exit(2);
}
const seed: number = parsed;
const enemyId = 'training-dummy';

const opening = startBattle({ enemyId, seed });
const played = playGreedy(opening.state);
const events = [...opening.events, ...played.events];

if (json) {
  console.log(JSON.stringify({ seed, actions: played.actions, events, final: played.state }, null, 2));
} else {
  const enemy = enemyDef(enemyId);
  console.log(`Nightrune battle vs ${enemy.name} (HP ${enemy.hp}), seed ${seed}, greedy bot`);
  for (const e of events) console.log(`${e.type === 'placement-start' ? '\n' : ''}${eventText(e, enemyId)}`);
  console.log(`\nFinal HP: you ${played.state.player.hp}, ${enemy.name} ${played.state.enemy.hp}`);
}
