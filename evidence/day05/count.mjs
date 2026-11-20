/* global console, URL */
// Counts Qodo's findings on this repo's PRs by candidate rule. Reads findings.json only (a trimmed
// copy of `qodo pr-review-session findings --pr-url <pr> --json` for every PR with a finding).
// The class of each finding was chosen by hand from its title and description; the lists below are
// that choice, so a reader can argue with a row. A title that is not in findings.json is an error.
import { readFileSync } from 'node:fs';

const findings = JSON.parse(readFileSync(new URL('./findings.json', import.meta.url), 'utf8'));

// Candidate 1: a parser, validator or gate is given a malformed, near-miss or incomplete input and
// accepts it as valid (or crashes on it), or rejects a valid one.
const refuseInput = [
  [2, 'CLI crashes with a raw stack trace on a bad seed'],
  [8, 'Scenes can omit pre-hit HP unnoticed'],
  [10, 'Skipped tests can certify untested rules'],
  [10, 'Mismatched spans hide banned claims'],
  [10, 'Valid code spans fail the claims check'],
  [10, 'Markdown claims can evade the gate'],
  [10, 'Untested rules can pass the rule check'],
  [10, 'Later rules can escape the test gate'],
  [14, 'Invalid replay options can pass as success'],
  [17, 'Invalid requirement statuses go unchecked'],
  [17, 'Malformed test IDs can pass as valid'],
  [17, 'Misspelled requirement ids in group titles pass'],
  [29, 'Invalid numbers lose their value in errors'],
  [30, 'Early stops corrupt factory totals'],
  [30, 'Runs without a pull request count as one'],
  [32, 'Parser errors can pass as lint rules'],
  [32, 'Malformed lessons stop the whole run'],
  [32, 'A dispute can excuse another finding'],
];
// Candidate 2: the factory runner leaves tickets, branches, labels or locks in a state a rerun cannot use.
const runnerRestart = [
  [23, 'Forbidden files enter agent PRs'],
  [23, 'Reruns replace an existing PR\'s code'],
  [23, 'Failed runs leave tickets stuck'],
  [23, 'Agent reports slip into pull requests'],
  [23, 'Reruns fail after an old branch is deleted'],
  [23, 'A reused process ID blocks factory polls'],
  [23, 'Failed label updates misroute tickets'],
  [23, 'Concurrent runs can claim one ticket'],
  [28, 'A missing review is hidden from the person'],
];
// Candidate 3: a page behaves wrongly in a variant path (resize, phone width, reduced motion, finished battle).
const webPaths = [
  [2, 'Selecting a card loses keyboard focus'],
  [2, 'Starting a new battle mid-round can make the next round skip beats'],
  [2, 'Players cannot hear which slots are legal'],
  [4, 'Reduced-motion players never see a block on the board'],
  [6, 'HP text can use fallback fonts in screenshots'],
  [8, 'Resized previews report old text sizes'],
  [8, 'Finished battles leave cards clickable'],
  [8, 'Hand card text shrinks on laptops'],
  [8, 'Resizing previews strands the hand'],
  [8, 'The final hit of a round barely shows before it is wiped'],
  [27, 'Phone players cannot read card effects'],
  [33, 'Phone strikes cover health plaques'],
];

const classes = { 'refuse-input': refuseInput, 'runner-restart': runnerRestart, 'web-paths': webPaths };
const seen = new Set();
const out = [];
for (const [name, list] of Object.entries(classes)) {
  const rows = list.map(([pr, title]) => {
    const row = findings.find((f) => f.pr === pr && f.title === title);
    if (!row) throw new Error(`no finding: PR ${pr} "${title}"`);
    if (seen.has(row.id)) throw new Error(`in two classes: PR ${pr} "${title}"`);
    seen.add(row.id);
    return row;
  });
  const prs = [...new Set(rows.map((r) => r.pr))];
  const dirs = [...new Set(rows.map((r) => (r.file ?? '').split('/')[0]))];
  const fixed = rows.filter((r) => r.status === 'implemented').length;
  out.push(`${name}: ${rows.length} findings in ${prs.length} PRs (${prs.join(', ')}); top folders ${dirs.join(', ')}; ${fixed} fixed, ${rows.length - fixed} dismissed or other`);
}
console.log(`all findings: ${findings.length} in ${new Set(findings.map((f) => f.pr)).size} PRs`);
console.log(out.join('\n'));
console.log(`not in any candidate: ${findings.length - seen.size}`);
