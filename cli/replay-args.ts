// Arguments of `npm run replay`, parsed strictly: anything left over is an error, never ignored.

export type ReplayArgs = { ok: true; file: string; expect?: string } | { ok: false; problem: string };

const HASH = /^[0-9a-f]{16}$/;

/** Exactly one record file and at most one `--expect <16 hex digits>`; `--` ends the options. */
export function parseReplayArgs(args: readonly string[]): ReplayArgs {
  const files: string[] = [];
  let expect: string | undefined;
  let optionsEnded = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!optionsEnded && arg === '--') {
      optionsEnded = true;
    } else if (!optionsEnded && arg === '--expect') {
      if (expect !== undefined) return { ok: false, problem: '--expect was given more than once' };
      const value = args[++i];
      if (value === undefined || !HASH.test(value)) return { ok: false, problem: '--expect needs a hash of 16 hex digits' };
      expect = value;
    } else if (!optionsEnded && arg.startsWith('-')) {
      return { ok: false, problem: `unknown option ${arg}` };
    } else {
      files.push(arg);
    }
  }
  if (files.length !== 1) return { ok: false, problem: files.length === 0 ? 'no record file given' : `expected one record file, got ${files.length}` };
  return expect === undefined ? { ok: true, file: files[0]! } : { ok: true, file: files[0]!, expect };
}
