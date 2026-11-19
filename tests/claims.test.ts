// "Report results, not adjectives" as a check: public docs and posts never call the game
// balanced, fun or bug-free. They report simulated games, seeds and invariant results instead.
// Words inside `code spans` are allowed, so a rule can name the words it bans.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const BANNED = /\b(balanced|balancing|fun|bug[- ]free|bugless|no bugs)\b/gi;

/** Banned claim words outside code spans and fenced code blocks, with their line numbers. */
export function claimsIn(markdown: string): { line: number; word: string }[] {
  const out: { line: number; word: string }[] = [];
  // An open fence closes only on a line of the same character, at least as long (CommonMark).
  let fence: { char: string; length: number } | null = null;
  markdown.split('\n').forEach((text, i) => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (fence !== null) {
      if (marker !== undefined && marker[0] === fence.char && marker.length >= fence.length && text.trim() === marker) fence = null;
      return;
    }
    if (marker !== undefined) {
      fence = { char: marker[0] ?? '`', length: marker.length };
      return;
    }
    // A code span opens with a run of N backticks and closes at the next run of exactly N
    // (CommonMark); an opener with no such closer is literal text and is scanned.
    for (const m of text.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, '').matchAll(BANNED)) out.push({ line: i + 1, word: m[0] });
  });
  return out;
}

const root = join(import.meta.dirname, '..');

/** Tracked markdown, plus local post drafts in submissions/ when they exist (they are not in git). */
function publicDocs(): string[] {
  const tracked = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f !== '');
  const drafts = existsSync(join(root, 'submissions'))
    ? readdirSync(join(root, 'submissions')).filter((f) => f.endsWith('.md')).map((f) => `submissions/${f}`)
    : [];
  return [...new Set([...tracked, ...drafts])];
}

describe('public docs and posts make no balanced/fun/bug-free claims', () => {
  it('finds none', () => {
    const docs = publicDocs();
    expect(docs).toContain('README.md');
    const found = docs.flatMap((f) => claimsIn(readFileSync(join(root, f), 'utf8')).map((c) => `${f}:${c.line} "${c.word}"`));
    expect(found).toEqual([]);
  });
});

describe('the claims check itself', () => {
  it('flags claim words in prose but not in code', () => {
    const md = 'The deck feels balanced.\nIt is `fun` to name.\n```\nfun\n```\nBug-free since day 1. Funding is fine.';
    expect(claimsIn(md)).toEqual([
      { line: 1, word: 'balanced' },
      { line: 6, word: 'Bug-free' },
    ]);
  });

  it('handles double-backtick spans and a tilde line inside a backtick fence', () => {
    expect(claimsIn('Write ``fun`` in code.')).toEqual([]);
    expect(claimsIn('``fun```')).toEqual([{ line: 1, word: 'fun' }]);
    expect(claimsIn('`` a ` fun `` and `x`')).toEqual([]);
    const md = '````\n~~~\nfun\n````\nThis is fun.';
    expect(claimsIn(md)).toEqual([{ line: 5, word: 'fun' }]);
  });
});
