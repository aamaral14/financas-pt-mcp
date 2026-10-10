// Tests for the PR tests gate (.github/scripts/tests-gate.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, prType, countTestCases, stripCommentsAndSpace } from '../.github/scripts/tests-gate.mjs';

const base = { changed: ['src/portal.mjs'], srcCodeChanged: true, srcAddsLines: true, testsBefore: 10, testsAfter: 10, title: 'feat: x', labels: [] };
const run = (o) => evaluate({ ...base, ...o });

test('gate: PR type parsing', () => {
  assert.equal(prType('feat: add x'), 'feat');
  assert.equal(prType('fix(portal): y'), 'fix');
  assert.equal(prType('Refactor!: z'), 'refactor');
  assert.equal(prType('Add something'), null);
});

test('gate: counts only active test cases at line start', () => {
  const src = "test('a', () => {});\n  it('b', () => {});\n  await t.test('c', () => {});\ntest.skip('d', () => {});\ntest.todo('e');\nconst s = \"test('in a string')\";\nsubmit(1);";
  assert.equal(countTestCases(src), 3);
});

test('gate: comment-only and whitespace-only edits are not code changes', () => {
  const a = 'const x = 1; // one\nfoo(x);';
  assert.equal(stripCommentsAndSpace(a), stripCommentsAndSpace('// new comment\nconst x = 1; // one\n\n  foo(x);\n/* block */'));
  assert.notEqual(stripCommentsAndSpace(a), stripCommentsAndSpace('const x = 2; // one\nfoo(x);'));
});

test('gate: passes when tests make no sense', () => {
  assert.equal(run({ changed: ['README.md', 'package.json'] }).ok, true, 'docs/deps only');
  assert.equal(run({ changed: ['test/unit.test.mjs'] }).ok, true, 'tests only');
  assert.equal(run({ srcCodeChanged: false }).ok, true, 'comments only');
  assert.equal(run({ srcAddsLines: false }).ok, true, 'pure removal');
  for (const t of ['refactor', 'perf', 'style', 'docs', 'revert']) assert.equal(run({ title: `${t}: x` }).ok, true, t);
  assert.equal(run({ labels: ['no-tests-needed'] }).ok, true, 'maintainer waiver');
});

test('gate: features and untyped PRs need new test cases', () => {
  assert.equal(run({}).ok, false);
  assert.equal(run({ title: 'Add a tool' }).ok, false, 'no type = feature');
  assert.equal(run({ title: 'chore: x' }).ok, false, 'chore touching src is not exempt');
  assert.equal(run({ changed: ['src/portal.mjs', 'test/unit.test.mjs'] }).ok, false, 'editing old tests is not enough');
  assert.equal(run({ testsAfter: 11 }).ok, true);
  assert.match(run({}).reason, /adds no new test case/);
  assert.match(run({}).reason, /não adiciona casos de teste/);
});

test('gate: bug fixes need a test change, a new test is optional', () => {
  assert.equal(run({ title: 'fix: x' }).ok, false);
  assert.equal(run({ title: 'fix: x', changed: ['src/portal.mjs', 'test/unit.test.mjs'] }).ok, true);
  assert.equal(run({ title: 'fix: x', changed: ['src/portal.mjs', 'test/live-readonly.mjs'] }).ok, true, 'live test counts for portal-flow fixes');
  assert.equal(run({ title: 'Wrong date', labels: ['bug'], changed: ['src/dates.mjs', 'test/unit.test.mjs'] }).ok, true, 'bug label');
});
