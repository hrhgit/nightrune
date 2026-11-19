// The factory's verdict is computed from facts, never from the agent's account of its work.
import { describe, expect, it } from 'vitest';
import { areaOf, criteria, outside } from '../factory/ticket.ts';
import { afterFixRound, judge, type Finding, type RunFacts } from '../factory/verdict.ts';

const head = 'a'.repeat(40);
const clean: RunFacts = {
  ticketOk: true,
  question: null,
  outsideArea: [],
  emptyChange: false,
  checksPassed: true,
  review: { status: 'completed', commitSha: head },
  headSha: head,
  findings: [],
  attempts: 1,
  maxAttempts: 3,
  stalled: false,
  stoppedBy: null,
};
const finding = (action_level: string, attribution_status = 'pending'): Finding => ({ id: action_level, title: `a ${action_level} finding`, action_level, attribution_status });

describe('factory verdict', () => {
  it('READY only with passing checks and a completed review of the PR head with no open blocking finding', () => {
    expect(judge(clean)).toEqual({ verdict: 'READY', reasons: [] });
  });

  it('flags informational findings to the person but still READY', () => {
    const j = judge({ ...clean, findings: [finding('informational')] });
    expect(j.verdict).toBe('READY');
    expect(j.reasons).toEqual(['for you to decide (informational): a informational finding']);
  });

  it('NOT_DONE when the review covers an older commit, is still running, or never came', () => {
    expect(judge({ ...clean, review: { status: 'completed', commitSha: 'b'.repeat(40) } }).verdict).toBe('NOT_DONE');
    expect(judge({ ...clean, review: { status: 'started', commitSha: head } }).verdict).toBe('NOT_DONE');
    expect(judge({ ...clean, review: null }).verdict).toBe('NOT_DONE');
    expect(judge({ ...clean, checksPassed: null }).verdict).toBe('NOT_DONE');
  });

  it('NEEDS_FIX for failing checks or an open action-required or recommended finding while retries remain', () => {
    expect(judge({ ...clean, checksPassed: false }).verdict).toBe('NEEDS_FIX');
    expect(judge({ ...clean, findings: [finding('action_required')] }).verdict).toBe('NEEDS_FIX');
    expect(judge({ ...clean, findings: [finding('remediation_recommended')] }).verdict).toBe('NEEDS_FIX');
  });

  it('a resolved or dismissed finding does not block', () => {
    expect(judge({ ...clean, findings: [finding('action_required', 'implemented'), finding('action_required', 'dismissed')] }).verdict).toBe('READY');
  });

  it('NEEDS_HUMAN at the retry limit, on a stall, a question, a change outside the area, no change, a bad ticket, or a stopped run', () => {
    expect(judge({ ...clean, checksPassed: false, attempts: 3 }).verdict).toBe('NEEDS_HUMAN');
    expect(judge({ ...clean, stalled: true }).verdict).toBe('NEEDS_HUMAN');
    expect(judge({ ...clean, question: 'which limit?' }).verdict).toBe('NEEDS_HUMAN');
    expect(judge({ ...clean, outsideArea: ['web/main.ts'] }).verdict).toBe('NEEDS_HUMAN');
    expect(judge({ ...clean, emptyChange: true }).verdict).toBe('NEEDS_HUMAN');
    expect(judge({ ...clean, ticketOk: false }).verdict).toBe('NEEDS_HUMAN');
    expect(judge({ ...clean, stoppedBy: 'the run failed: push rejected' })).toEqual({ verdict: 'NEEDS_HUMAN', reasons: ['the run failed: push rejected'] });
  });

  it('NEEDS_HUMAN also tells the person when the review of the head is missing or still has open findings', () => {
    const asked = { ...clean, question: 'the agent disagrees with a finding' };
    expect(judge({ ...asked, review: { status: 'started', commitSha: head } }).reasons).toEqual(['agent asked: the agent disagrees with a finding', 'Qodo review is started']);
    expect(judge({ ...asked, findings: [finding('action_required')] }).reasons).toEqual(['agent asked: the agent disagrees with a finding', 'open action_required finding: a action_required finding']);
  });

  it('an unknown finding status counts as open', () => {
    expect(judge({ ...clean, findings: [finding('action_required', 'something_new')] }).verdict).toBe('NEEDS_FIX');
  });
});

describe('factory fix round', () => {
  const round = { asked: false, disputed: false, ownCommit: false, changed: true };
  it('keeps the fixes the agent made when it disputes another finding: commit, review, then a person', () => {
    // Issue #21's first run: the agent fixed one finding, disputed the other, and the fix was left uncommitted.
    expect(afterFixRound({ ...round, disputed: true })).toBe('commit-then-stop');
    expect(afterFixRound({ ...round, disputed: true, changed: false })).toBe('stop');
  });
  it('reviews again after a plain fix, stalls when nothing changed, stops on a question or the agent committing', () => {
    expect(afterFixRound(round)).toBe('review');
    expect(afterFixRound({ ...round, changed: false })).toBe('stalled');
    expect(afterFixRound({ ...round, asked: true, disputed: true })).toBe('stop');
    expect(afterFixRound({ ...round, ownCommit: true })).toBe('stop');
  });
});

describe('factory ticket reading', () => {
  it('reads the checkbox or numbered lines under Acceptance criteria and nothing after the next heading', () => {
    const body = 'Intro\n\n## Acceptance criteria\n\n- [ ] first\n* [x] second\nnot a box\n\n## Notes\n- [ ] not a criterion';
    expect(criteria(body)).toEqual(['first', 'second']);
    expect(criteria('no criteria here\n- [ ] loose box')).toEqual([]);
    expect(criteria('## Acceptance criteria\n- [ ] last section')).toEqual(['last section']);
    expect(criteria('## Acceptance criteria\n\n1. numbered\n2) also numbered\n- plain bullet\n\n## Scope\n3. not a criterion')).toEqual(['numbered', 'also numbered']);
  });

  it('needs exactly one known area label', () => {
    expect(areaOf(['ready-for-agent', 'area:engine'], ['engine', 'web'])).toBe('engine');
    expect(areaOf(['area:engine', 'area:web'], ['engine', 'web'])).toBeNull();
    expect(areaOf(['area:docs'], ['engine', 'web'])).toBeNull();
    expect(areaOf([], ['engine', 'web'])).toBeNull();
  });

  it('lists files outside the area; a folder prefix needs its slash, a file must match exactly', () => {
    expect(outside(['engine/a.ts', 'web/b.ts', 'RULES.md', 'engineering.md', 'RULES.md.bak'], ['engine/', 'RULES.md'])).toEqual(['web/b.ts', 'engineering.md', 'RULES.md.bak']);
  });
});
