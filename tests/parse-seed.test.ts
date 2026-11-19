import { describe, expect, it } from 'vitest';
import { parseSeed } from '../present/seed.ts';

describe('parseSeed (page seed box and CLI --seed)', () => {
  it('accepts whole numbers in the engine range', () => {
    expect(parseSeed('0')).toBe(0);
    expect(parseSeed(' 42 ')).toBe(42);
    expect(parseSeed('4294967295')).toBe(4294967295);
  });

  it.each([undefined, '', 'abc', '--json', '-3', '1.5', '1e3', '4294967296'])('rejects %j', (text) => {
    expect(parseSeed(text)).toBeNull();
  });
});
