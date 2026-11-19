import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { playGreedy } from '../bots/greedy.ts';
import { makeRecord, parseRecord, replay, startBattle, stateHash, type BattleRecord } from '../engine/index.ts';

const enemyId = 'training-dummy';

function greedyRecord(seed: number): BattleRecord {
  const played = playGreedy(startBattle({ enemyId, seed }).state);
  return makeRecord(seed, enemyId, played.actions, played.state);
}

describe('R-16 a recorded battle replays to the same final state', () => {
  it('replays greedy games on 5 seeds to the recorded hash', () => {
    for (const seed of [1, 7, 42, 1234, 4294967295]) {
      const record = greedyRecord(seed);
      const result = replay(record);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.hash).toBe(record.finalHash);
        expect(result.state.outcome).not.toBe('ongoing');
      }
    }
  });

  it('pins the hash of seed 7, so a change in the engine or the hash shows up', () => {
    // Recorded with `npm run play -- --seed 7 --record`; the greedy bot wins in round 3 at 18 HP.
    expect(greedyRecord(7).finalHash).toBe('bb20ce7f39161e47');
  });

  it('the hash depends on the state values, not on key order', () => {
    const { state } = startBattle({ enemyId, seed: 7 });
    const reordered = Object.fromEntries(Object.entries(state).reverse()) as typeof state;
    expect(stateHash(reordered)).toBe(stateHash(state));
    expect(stateHash({ ...state, round: state.round + 1 })).not.toBe(stateHash(state));
  });

  it('reports the index and reason of a refused action', () => {
    const record = greedyRecord(7);
    const tampered: BattleRecord = { ...record, actions: [record.actions[0]!, { type: 'place', uid: 'p99', slot: 1 }] };
    const result = replay(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect([result.index, result.reason]).toEqual([1, 'card-not-in-hand']);
  });

  it('a record that stops early replays to an ongoing battle', () => {
    const record = greedyRecord(7);
    const result = replay({ format: record.format, seed: record.seed, enemyId: record.enemyId, actions: record.actions.slice(0, 3) });
    expect(result.ok && result.state.outcome).toBe('ongoing');
  });

  it('lists what is wrong with a malformed record', () => {
    expect(parseRecord([])).toEqual({ ok: false, problems: ['the record is not a JSON object'] });
    const bad = parseRecord({ format: 'x', seed: 1.5, enemyId: 'dragon', actions: [{ type: 'place', uid: 3 }], finalHash: 'zz' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.problems).toHaveLength(5);
    expect(parseRecord(JSON.parse(JSON.stringify(greedyRecord(7)))).ok).toBe(true);
  });
});

describe('R-16 replay command exit codes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nightrune-replay-'));
  const root = join(import.meta.dirname, '..');
  const run = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'cli/replay.ts', ...args], { cwd: root, encoding: 'utf8' });
  const write = (name: string, text: string) => {
    const path = join(dir, name);
    writeFileSync(path, text);
    return path;
  };
  const good = write('good.json', JSON.stringify(greedyRecord(7)));

  it('0 when the hash matches, 1 on a mismatch or a refused action, 2 on a malformed file', () => {
    const ok = run(good);
    expect([ok.status, ok.stdout]).toEqual([0, expect.stringContaining('State hash: bb20ce7f39161e47')]);
    expect(run(good, '--expect', '0000000000000000').status).toBe(1);
    const illegal = write('illegal.json', JSON.stringify({ ...greedyRecord(7), actions: [{ type: 'place', uid: 'p99', slot: 1 }], finalHash: undefined }));
    const refused = run(illegal);
    expect([refused.status, refused.stderr]).toEqual([1, expect.stringContaining('Action 0')]);
    expect(run(write('broken.json', '{"seed": 7, "actions": [')).status).toBe(2);
    expect(run(write('shape.json', '{"seed": 7}')).status).toBe(2);
    expect(run().status).toBe(2);
  }, 30_000);
});
