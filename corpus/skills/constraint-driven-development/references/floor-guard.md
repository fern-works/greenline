# Floor guard: reference implementation

Every numbered dimension of the bar maps to a de facto tool. The **floor** does not: it is a diff-scoped check for the five moves in Step 5, and without a shipped reference every agent invents its own, so two runs (or a Python repo and a Go one) produce two different guards. That is the exact non-determinism this skill exists to remove.

This is the reference. Adapt the patterns to your stack; keep the contract identical.

## Contract

- **Input:** the diff between the merge base and the working tree (added *and* removed lines, plus untracked files). A guard that reads only `git diff` misses new files and staged-but-uncommitted work.
- **Detects the five Step 5 moves:** a weakened threshold in the bar, a test made easier (`.skip`, a deleted test file, an assertion removed from a test that stayed), a silenced checker (a new suppression comment), unfinished work (a stub or empty `catch`), a new Exceptions row.
- **Exit codes:** `0` clean, `1` at least one floor violation (block the change), `2` the guard could not run (no merge base, not a git repo). Never let a `2` read as a `0`.
- **Reports the rule and the location, never the matched secret value.** Redaction is not optional.
- **Exempts its own bar and file:** the bar's `## Constraints` section and the guard's own file name the suppressions, stubs and skips they forbid, so neither is scanned for them, and the change that introduces the two passes; the same pattern added anywhere else is flagged.

- **Tightening is silent, loosening is loud:** only surfaces moves that lower the bar.

## Reference (Node, ~stack-agnostic patterns)

```js
#!/usr/bin/env node
// floor-guard.mjs: diff-scoped enforcement of the bar's floor, in the decision home.
// Usage: node floor-guard.mjs [--base <ref>] [--bar <path>]
//   (defaults: origin/main, and the decisions book .greenline/DECISIONS.md)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? process.argv[i + 1] : 'origin/main';
})();
const bar = (() => {
  const i = process.argv.indexOf('--bar');
  return i > -1 ? process.argv[i + 1] : '.greenline/DECISIONS.md';
})();

// `git diff --no-index` exits 1 whenever the two sides differ, which is the normal case for a
// new file, so that output is kept. Any other failure is null, and null never reads as clean.
const git = (args, { diffExit = false } = {}) => {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return diffExit && e.status === 1 && typeof e.stdout === 'string' ? e.stdout : null; }
};
const bail = (msg) => { console.error('floor-guard: ' + msg); process.exit(2); };

// Run from the top of the work tree. `git ls-files` lists only the current directory's subtree,
// relative to it, so a guard started in a subfolder would miss untracked files elsewhere and name
// the rest differently from `git diff`, which always covers the whole tree.
const top = git(['rev-parse', '--show-toplevel'])?.trim();
if (!top) bail('not inside a git work tree');
process.chdir(top);
// The guard's own file as the diff names it, which it never scans for the patterns it holds.
const self = relative(top, fileURLToPath(import.meta.url)).replace(/\\/g, '/');

// Merge base; bail to exit 2 rather than pretending a shallow/rootless clone is clean. In CI, check
// out the whole history first, since a shallow clone's commits have no parents, and fail the job
// on exit 2 as on exit 1.
const mergeBase = git(['merge-base', base, 'HEAD'])?.trim();
if (!mergeBase) bail('no merge base against ' + base);

// Unified diff plus untracked files (git diff alone cannot see new files).
const tracked = git(['diff', '--unified=0', mergeBase, '--']);
if (tracked === null) bail('could not diff against ' + mergeBase);
const untrackedFiles = git(['ls-files', '--others', '--exclude-standard']);
if (untrackedFiles === null) bail('could not list untracked files');
const untracked = untrackedFiles.split('\n').filter(Boolean).map((f) => {
  const d = git(['diff', '--no-index', '--unified=0', '/dev/null', f], { diffExit: true });
  if (d === null) bail('could not diff untracked file ' + f);
  return d;
}).join('\n');
const diff = tracked + '\n' + untracked;

// Walk the diff. `---` and `+++` are file headers only between a file's `diff` line and its first
// `@@` hunk; inside a hunk every line is content, so an added `++i` (shown as `+++i`) or a removed
// `-- comment` is a change, not a header. Both headers name the file, so a deletion
// (`+++ /dev/null`) keeps its name.
const added = [], removed = [], deleted = [];
const pathOf = (s) => s.replace(/^[ab]\//, '');
let file = '', oldFile = '', inHeader = false, oldLine = 0, newLine = 0;
for (const line of diff.split('\n')) {
  if (line.startsWith('diff ')) inHeader = true;
  else if (line.startsWith('@@')) {
    inHeader = false;
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    oldLine = m ? Number(m[1]) : 0;
    newLine = m ? Number(m[2]) : 0;
  }
  else if (inHeader) {
    if (line.startsWith('--- ')) oldFile = pathOf(line.slice(4));
    else if (line.startsWith('+++ ')) {
      const newFile = pathOf(line.slice(4));
      file = newFile === '/dev/null' ? oldFile : newFile;
      if (newFile === '/dev/null') deleted.push(file);
    }
  }
  else if (line.startsWith('+')) added.push({ file, text: line.slice(1), line: newLine++ });
  else if (line.startsWith('-')) removed.push({ file, text: line.slice(1), line: oldLine++ });
}

const findings = [];
const flag = (rule, f, text) => findings.push({ rule, file: f, text: text.trim().slice(0, 120) });
const isTest = (f) => /\.(test|spec)\.|_test\.|test_/.test(f);
// The bar is the `## Constraints` section of that file: a line counts only inside the section, in the old
// text for a removed line and in the new text for an added one, so an edit elsewhere in the decision
// home is no move on the bar.
const sectionOf = (text) => {
  if (text === null) return null;
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^## Constraints\s*$/.test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  return [start + 2, end < 0 ? lines.length : end];
};
const readBar = () => { try { return readFileSync(bar, 'utf8'); } catch { return null; } };
const oldBar = sectionOf(git(['show', mergeBase + ':' + bar]));
const newBar = sectionOf(readBar());
const within = (range, n) => range !== null && n >= range[0] && n <= range[1];
const isConstraints = (l, side) => l.file === bar && within(side === 'old' ? oldBar : newBar, l.line);
// A section the old text had and the new one lacks is the bar removed or renamed, never a quiet
// skip.
if (oldBar !== null && newBar === null) flag('section-removed', bar, '## Constraints');

// 1. Silenced checker — extend this list for your ecosystem.
const SUPPRESSIONS = /@ts-ignore|@ts-nocheck|eslint-disable|biome-ignore|# *noqa|# *type: *ignore|istanbul ignore|nosemgrep|gitleaks:allow|Stryker disable/;
// 4. Unfinished work.
const STUBS = /throw new (Error|NotImplemented).*[Nn]ot implemented|catch\s*\(\w*\)\s*\{\s*\}|catch\s*\{\s*\}|\bTODO\b|\bpass\s*# *stub/;
// 2. A test made easier (added skips).
const SKIPS = /\.(skip|todo)\b|\bxit\(|\bxdescribe\(|@pytest\.mark\.skip|t\.Skip\(/;

for (const entry of added) {
  const { file, text } = entry;
  // The bar's section and the guard's own file name the patterns they forbid, so neither is
  // scanned for them: the change that introduces the two passes, and the same pattern added
  // anywhere else is flagged.
  const scanned = file !== self && !isConstraints(entry, 'new');
  if (scanned && SUPPRESSIONS.test(text)) flag('silenced-checker', file, text);
  if (scanned && STUBS.test(text)) flag('unfinished-work', file, text);
  if (scanned && SKIPS.test(text)) flag('test-made-easier', file, text);
  if (isConstraints(entry, 'new') && /^\| *(W|E)\d+ *\|/.test(text)) flag('new-exception', file, text);
}

// 2b. A test file deleted, or an assertion removed from a test file that still exists.
for (const f of deleted) if (isTest(f)) flag('test-deleted', f, 'file deleted');
for (const { file, text } of removed) {
  if (isTest(file) && !deleted.includes(file) && /\b(expect|assert|should)\b/.test(text)) {
    flag('assertion-removed', file, text);
  }
}

// 1b/2c. A rule of the bar weakened or removed. A rule is a floor bullet or a table row,
// identified by the bullet's text before its first colon or by the row's first cell. Each number
// carries a direction read from the words around it: a minimum (>=, at least, must not fall) is
// loosened by going down, a maximum (<=, at most, under, must not grow) by going up. A number whose
// direction cannot be read is reported whenever it changes, because the guard cannot tell
// tightening from loosening and staying quiet is the wrong default. Numbers are paired within
// their direction (the first minimum with the first minimum, and so on), so a number added
// elsewhere in the text does not shift the pairing; a threshold with no counterpart after the
// edit was removed, and an added one tightens.
const ruleKey = (t) => {
  const s = t.trim();
  if (s.startsWith('|')) return s.split('|').map((c) => c.trim()).filter(Boolean)[0] ?? '';
  if (/^[-*] /.test(s)) return s.slice(2).split(':')[0].trim();
  return null; // prose, headings, dates: not a rule
};
const isException = (t) => /^\| *(W|E)\d+ *\|/.test(t.trim());
const MIN_BEFORE = /(>=|>|≥|at least|minimum|\bmin\b|no less than|not fall|not drop)\s*$/;
const MAX_BEFORE = /(<=|<|≤|at most|maximum|\bmax\b|no more than|under|below|not grow|not exceed)\s*$/;
const MIN_AFTER = /^\s*\S*\s*(or more|or higher|must not fall|must not drop)/;
const MAX_AFTER = /^\s*\S*\s*(or less|or lower|must not grow|must not exceed)/;
const thresholds = (t) => {
  const out = [], re = /\d+(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 40).toLowerCase();
    const dir = MIN_BEFORE.test(before) || MIN_AFTER.test(after) ? 'min'
      : MAX_BEFORE.test(before) || MAX_AFTER.test(after) ? 'max' : null;
    out.push({ n: Number(m[0]), dir });
  }
  return out;
};
const removedRules = removed.filter((l) => isConstraints(l, 'old') && ruleKey(l.text) !== null);
const addedRules = added.filter((l) => isConstraints(l, 'new') && ruleKey(l.text) !== null);
for (const r of removedRules) {
  const a = addedRules.find((x) => ruleKey(x.text) === ruleKey(r.text));
  if (!a) {
    if (!isException(r.text)) flag('rule-removed', r.file, r.text); // dropping an exception tightens: silent
    continue;
  }
  const before = thresholds(r.text), after = thresholds(a.text);
  let verdict = null;
  for (const dir of ['min', 'max', null]) {
    const was = before.filter((x) => x.dir === dir), now = after.filter((x) => x.dir === dir);
    was.forEach((b, i) => {
      const n = now[i];
      if (verdict) return;
      if (!n) verdict = 'threshold-removed';
      else if (n.n === b.n) return;
      else if (dir === 'min' ? n.n < b.n : dir === 'max' ? n.n > b.n : true) {
        verdict = dir ? 'threshold-loosened' : 'threshold-changed';
      }
    });
  }
  if (verdict) flag(verdict, r.file, r.text + '  ->  ' + a.text);
}

if (findings.length === 0) { console.log('floor-guard: clean'); process.exit(0); }
console.error('floor-guard: ' + findings.length + ' floor violation(s):');
for (const f of findings) console.error(`  [${f.rule}] ${f.file}: ${f.text}`);
if (findings.some((f) => f.rule === 'rule-removed')) {
  console.error('\nA rule-removed finding can also mean the rule\'s label changed: rename a rule in one commit and change its thresholds in another.');
}
if (findings.some((f) => f.rule === 'threshold-removed')) {
  console.error('\nA threshold-removed finding can also mean a number gained or lost its direction words (">= 80%" becoming "80%", or the reverse): compare the two lines before assuming a threshold was deleted.');
}
console.error('\nEach is a move that lowers the bar. Fix the code, or route it through a tracked exception.');
process.exit(1);
```

## Adapting it

- **Patterns are the only stack-specific part.** Add your language's suppression and stub forms to the three regexes; the diff plumbing, the bar's checks, and the exit codes stay as-is.
- **A `.constraintsignore`** (one glob per line) lets you exempt a path the guard would otherwise flag; check each added line's file against it before flagging, so a genuine exception is a tracked file rather than a loosened rule.
- **This is a starting point, not a finished tool.** It is deliberately regex-shallow: it catches the cheap-road-to-green moves agents actually make, not a determined human hiding a change. That is the right trade for a check that runs on every diff. Once you outgrow it, move to a real runner (Escalation Path level 3).
