// PR gate: source changes must come with tests, but only when tests make sense.
// The decision logic (evaluate) is pure and covered by test/gate.test.mjs.
//
// Rules, by PR title type (Conventional Commits, e.g. "feat: ...", "fix(portal): ..."):
// - no change to src/                       -> pass
// - label "no-tests-needed" (maintainers)   -> pass
// - src/ change is only comments/whitespace -> pass
// - src/ change only removes lines          -> pass (existing tests must still pass in CI)
// - refactor, perf, style, docs, revert     -> pass (no behaviour change; existing tests must pass)
// - fix                                     -> at least one file in test/ changed
// - feat, anything else, or no type         -> new test cases (count of test()/it() goes up)
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const NO_NEW_TESTS_TYPES = ['refactor', 'perf', 'style', 'docs', 'revert'];

/** Conventional Commit type of a PR title, lower-case, or null. */
export function prType(title = '') {
  const m = title.trim().match(/^([a-z]+)(\([^)]*\))?!?:/i);
  return m ? m[1].toLowerCase() : null;
}

/** Number of active test cases in a test file (test(), it(), t.test(); not .skip/.todo). */
export function countTestCases(source = '') {
  return (source.match(/^\s*(?:await\s+)?(?:test|it|t\.test)\s*\(/gm) || []).length;
}

/** Remove comments and all whitespace, to tell code changes from comment-only changes. */
export function stripCommentsAndSpace(source = '') {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, '');
}

const msg = (en, pt) => `${en} / ${pt} See CONTRIBUTING.md.`;

/**
 * @param {object} i
 * @param {string[]} i.changed        files changed by the PR (vs merge-base)
 * @param {boolean} i.srcCodeChanged  src/ changed beyond comments/whitespace
 * @param {boolean} i.srcAddsLines    src/ diff adds at least one non-blank line
 * @param {number} i.testsBefore      active test cases at merge-base
 * @param {number} i.testsAfter       active test cases in the PR
 * @param {string} i.title
 * @param {string[]} i.labels
 * @returns {{ok: boolean, reason: string}}
 */
export function evaluate({ changed, srcCodeChanged, srcAddsLines, testsBefore, testsAfter, title, labels }) {
  const src = changed.filter((f) => f.startsWith('src/'));
  const testFiles = changed.filter((f) => f.startsWith('test/'));
  const type = prType(title);

  if (!src.length) return { ok: true, reason: 'No source changes. / Sem alterações ao código.' };
  if (labels.includes('no-tests-needed')) return { ok: true, reason: "Maintainer label 'no-tests-needed'. / Etiqueta 'no-tests-needed' do maintainer." };
  if (!srcCodeChanged) return { ok: true, reason: 'Only comments or whitespace changed in src/. / Só comentários ou espaços mudaram em src/.' };
  if (!srcAddsLines) return { ok: true, reason: 'src/ only removes code; existing tests must still pass. / src/ só remove código; os testes existentes têm de continuar a passar.' };
  if (NO_NEW_TESTS_TYPES.includes(type)) return { ok: true, reason: `'${type}' does not change behaviour; existing tests must still pass. / '${type}' não muda o comportamento; os testes existentes têm de continuar a passar.` };

  if (type === 'fix' || labels.includes('bug')) {
    if (testFiles.length || testsAfter > testsBefore) return { ok: true, reason: 'Bug fix with changed tests. / Correção com testes alterados.' };
    return { ok: false, reason: msg(
      'Bug fix changes src/ but no file in test/. Add a test, or update an existing one, that reproduces the bug.',
      'A correção altera src/ mas nenhum ficheiro em test/. Adiciona um teste, ou atualiza um existente, que reproduza o bug.') };
  }

  if (testsAfter > testsBefore) return { ok: true, reason: `New test cases added (${testsBefore} -> ${testsAfter}). / Novos casos de teste (${testsBefore} -> ${testsAfter}).` };
  return { ok: false, reason: msg(
    `This PR changes src/ but adds no new test case (${testsBefore} -> ${testsAfter}). New features need new tests. If it is a bug fix, start the title with "fix:"; a refactor with "refactor:".`,
    `Este PR altera src/ mas não adiciona casos de teste (${testsBefore} -> ${testsAfter}). Funcionalidades novas precisam de testes novos. Se for uma correção, começa o título por "fix:"; um refactor por "refactor:".`) };
}

// ---- git glue (CI only) ------------------------------------------------
function fromGit({ BASE, HEAD, TITLE = '', LABELS = '' }) {
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const show = (rev, f) => { try { return git('show', `${rev}:${f}`); } catch { return ''; } };
  const mergeBase = git('merge-base', BASE, HEAD).trim();
  const changed = git('diff', '--name-only', mergeBase, HEAD).split('\n').filter(Boolean);
  const srcFiles = changed.filter((f) => f.startsWith('src/'));
  const srcCodeChanged = srcFiles.some((f) => stripCommentsAndSpace(show(mergeBase, f)) !== stripCommentsAndSpace(show(HEAD, f)));
  const srcAddsLines = srcFiles.length > 0 && git('diff', '-U0', mergeBase, HEAD, '--', 'src/')
    .split('\n').some((l) => l.startsWith('+') && !l.startsWith('+++') && l.slice(1).trim() !== '');
  const count = (rev) => git('ls-tree', '-r', '--name-only', rev, 'test/').split('\n')
    .filter((f) => /\.test\.mjs$/.test(f)).reduce((n, f) => n + countTestCases(show(rev, f)), 0);
  return {
    changed, srcCodeChanged, srcAddsLines,
    testsBefore: count(mergeBase), testsAfter: count(HEAD),
    title: TITLE, labels: LABELS.split(',').map((s) => s.trim()).filter(Boolean),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const input = fromGit(process.env);
  console.log(JSON.stringify({ ...input, changed: input.changed.length }, null, 1));
  const { ok, reason } = evaluate(input);
  console.log(ok ? `OK: ${reason}` : `::error::${reason}`);
  process.exit(ok ? 0 : 1);
}
