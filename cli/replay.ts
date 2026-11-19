// Replays a battle record and checks its final-state hash (R-16).
// Usage: npm run replay -- <record.json> [--expect <hash>]
// Exit codes: 0 replayed (and the hash matched, if one was given); 1 hash mismatch or an action
// the engine refused; 2 the file could not be read or is not a record.
import { readFileSync } from 'node:fs';
import { enemyDef, parseRecord, replay } from '../engine/index.ts';

const USAGE = 'Usage: npm run replay -- <record.json> [--expect <hash>]';

function fail(code: 1 | 2, message: string): never {
  console.error(message);
  process.exit(code);
}

const args = process.argv.slice(2);
const expectAt = args.indexOf('--expect');
const expectArg = expectAt === -1 ? undefined : args[expectAt + 1];
if (expectAt !== -1 && (expectArg === undefined || expectArg.startsWith('--'))) fail(2, `--expect needs a hash.\n${USAGE}`);
const file = args.find((a, i) => !a.startsWith('--') && (expectAt === -1 || i !== expectAt + 1));
if (file === undefined) fail(2, USAGE);

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
