// Replays a battle record and checks its final-state hash (R-16).
// Usage: npm run replay -- [--expect <hash>] [--] <record.json>
// Exit codes: 0 replayed (and the hash matched, if one was given); 1 hash mismatch or an action
// the engine refused; 2 bad arguments, or the file could not be read or is not a record.
import { readFileSync } from 'node:fs';
import { enemyDef, parseRecord, replay } from '../engine/index.ts';
import { parseReplayArgs } from './replay-args.ts';

const USAGE = 'Usage: npm run replay -- [--expect <hash>] [--] <record.json>';

function fail(code: 1 | 2, message: string): never {
  console.error(message);
  process.exit(code);
}

const args = parseReplayArgs(process.argv.slice(2));
if (!args.ok) fail(2, `${args.problem}.\n${USAGE}`);
const { file } = args;
const expectArg = args.expect;

let data: unknown;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  fail(2, `Cannot read ${file} as JSON: ${err instanceof Error ? err.message : String(err)}`);
}

const parsed = parseRecord(data);
if (!parsed.ok) fail(2, `${file} is not a battle record:\n${parsed.problems.map((p) => `  - ${p}`).join('\n')}`);
const record = parsed.record;

const result = replay(record);
if (!result.ok) {
  fail(1, `Action ${result.index} (${JSON.stringify(result.action)}) was refused: ${result.reason}. ${result.message}`);
}

const { state, hash } = result;
const enemy = enemyDef(record.enemyId);
console.log(`Replayed ${record.actions.length} actions, seed ${record.seed}, vs ${enemy.name}`);
console.log(`Outcome: ${state.outcome}, round ${state.round}`);
console.log(`Final HP: you ${state.player.hp}, ${enemy.name} ${state.enemy.hp}`);
console.log(`State hash: ${hash}`);

const expected = expectArg ?? record.finalHash;
if (expected !== undefined) {
  if (expected !== hash) fail(1, `Hash mismatch: expected ${expected}, replay gave ${hash}`);
  console.log(`Matches the expected hash (${expectArg === undefined ? 'from the record' : '--expect'}).`);
}
