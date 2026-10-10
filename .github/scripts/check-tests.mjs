// PR gate: source changes must come with tests.
// - Feature/other PRs that change src/ must ADD test cases (more test() calls than the base).
// - Bug fixes (title "fix: ..." / "fix(scope): ..." or label "bug") may instead change existing tests.
// - Label "no-tests-needed" (maintainers only) waives the rule.
import { execFileSync } from 'node:child_process';

const { BASE, HEAD, TITLE = '', LABELS = '' } = process.env;
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
const labels = LABELS.split(',').map((s) => s.trim()).filter(Boolean);

const changed = git('diff', '--name-only', BASE, HEAD).split('\n').filter(Boolean);
const srcChanged = changed.filter((f) => f.startsWith('src/'));
const testsChanged = changed.filter((f) => /^test\/.+\.test\.mjs$/.test(f));

const countTests = (rev) => git('ls-tree', '-r', '--name-only', rev, 'test/')
  .split('\n').filter((f) => /\.test\.mjs$/.test(f))
  .reduce((n, f) => n + (git('show', `${rev}:${f}`).match(/^\s*test\(/gm) || []).length, 0);

const fail = (msg) => { console.log(`::error::${msg} See CONTRIBUTING.md.`); process.exit(1); };

console.log(`src changed: ${srcChanged.length}, test files changed: ${testsChanged.length}`);
if (!srcChanged.length) { console.log('OK: no source changes.'); process.exit(0); }
if (labels.includes('no-tests-needed')) { console.log("OK: maintainer label 'no-tests-needed'."); process.exit(0); }

const isFix = /^fix(\(.+\))?!?:/i.test(TITLE.trim()) || labels.includes('bug');
const before = countTests(BASE), after = countTests(HEAD);
console.log(`test cases: base ${before}, PR ${after}; bug fix: ${isFix}`);

if (isFix) {
  if (!testsChanged.length) fail('Bug fix changes src/ but no test. Add a test or update an existing one so it covers the bug.');
  console.log('OK: bug fix with changed tests.');
} else {
  if (after <= before) fail(`This PR changes src/ but adds no new test case (base ${before}, PR ${after}). New features need new tests. If this is a bug fix, start the PR title with "fix:".`);
  console.log('OK: new test cases added.');
}
