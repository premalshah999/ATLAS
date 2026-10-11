// What defines "verified" for a project, and whether a mission changed it (evolution D1, backlog P0-3).
// The agent writes the integrated commit, so it must not be able to redefine its own test. The definition is
// read at the base commit (what the operator approved at plan time) and at the integrated commit; any difference,
// and any deleted test file, fails the gate until the operator explicitly approves that change.
import { createHash } from 'node:crypto';
import { git } from '@atlas/workspace';

/** Scripts that verification runs, and the npm lifecycle hooks around them. */
const VERIFY_SCRIPTS = ['test', 'typecheck', 'lint'];
const RUNNER_KEYS = ['jest', 'mocha', 'ava', 'c8', 'nyc', 'vitest', 'tap'];
/** Top-level files that change what a check does (runner config, type and lint config). */
const CONFIG_FILE = /^(vitest|vite|jest|playwright|karma|cypress|ava|webpack)\.config\.[cm]?[jt]s$|^\.mocharc(\.\w+)?$|^\.nycrc(\.\w+)?$|^\.c8rc(\.\w+)?$|^tsconfig(\.[\w-]+)?\.json$|^\.eslintrc(\.\w+)?$|^eslint\.config\.[cm]?[jt]s$|^\.npmrc$/;
/** Paths that hold tests. Deleting one weakens verification. */
export const TEST_PATH = /(^|\/)(test|tests|__tests__|spec|specs|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(go|py)$/;

export interface Definition { hash: string; items: Record<string, string> }

async function show(repo: string, commit: string, file: string): Promise<string | null> {
  const r = await git(repo, ['show', `${commit}:${file}`]);
  return r.code === 0 ? r.out : null;
}

/** Collect the verification-relevant definition at a commit, as canonical strings per item. */
export async function definitionAt(repo: string, commit: string): Promise<Definition> {
  const items: Record<string, string> = {};
  const pkgText = await show(repo, commit, 'package.json');
  if (pkgText) {
    let pkg: Record<string, any> = {};
    try { pkg = JSON.parse(pkgText); } catch { items['package.json'] = `unparseable:${pkgText}`; }
    const scripts: Record<string, string> = pkg.scripts ?? {};
    // Scripts reached from the verification scripts (pre/post hooks and `npm run x` references), transitively.
    const want = new Set<string>();
    const visit = (name: string) => {
      if (want.has(name) || scripts[name] === undefined) return;
      want.add(name);
      for (const m of String(scripts[name]).matchAll(/\b(?:npm|pnpm|yarn)(?:\s+run)?\s+([\w:.-]+)/g)) visit(m[1]);
    };
    for (const s of VERIFY_SCRIPTS) for (const n of [`pre${s}`, s, `post${s}`]) visit(n);
    for (const n of VERIFY_SCRIPTS) if (scripts[n] === undefined) items[`scripts.${n}`] = '(absent)';
    for (const n of [...want].sort()) items[`scripts.${n}`] = String(scripts[n]);
    for (const k of RUNNER_KEYS) if (pkg[k] !== undefined) items[`package.json#${k}`] = JSON.stringify(pkg[k]);
  }
  const cfgText = await show(repo, commit, 'atlas.config.json');
  if (cfgText) {
    try {
      const cfg = JSON.parse(cfgText);
      for (const k of ['checks', 'app', 'api', 'browser', 'deploy']) if (cfg[k] !== undefined) items[`atlas.config.json#${k}`] = JSON.stringify(cfg[k]);
    } catch { items['atlas.config.json'] = `unparseable:${cfgText}`; }
  }
  const top = await git(repo, ['ls-tree', '--name-only', commit]);
  for (const f of top.out.split('\n').filter((x) => CONFIG_FILE.test(x)).sort()) items[f] = (await show(repo, commit, f)) ?? '';
  const hash = createHash('sha256').update(JSON.stringify(Object.entries(items).sort())).digest('hex');
  return { hash, items };
}

export interface DefinitionChange { changed: string[]; deletedTests: string[]; baseHash: string; hash: string }

/** Compare the definition between the approved base and the integrated commit. */
export async function definitionChange(repo: string, base: string, commit: string): Promise<DefinitionChange> {
  const [a, b] = await Promise.all([definitionAt(repo, base), definitionAt(repo, commit)]);
  const keys = [...new Set([...Object.keys(a.items), ...Object.keys(b.items)])].sort();
  const changed = keys.filter((k) => a.items[k] !== b.items[k]);
  const diff = await git(repo, ['diff', '--name-status', '-M', base, commit]);
  const deletedTests: string[] = [];
  for (const line of diff.out.split('\n')) {
    const [st, from, to] = line.split('\t');
    if (!st || !from) continue;
    if (st === 'D' && TEST_PATH.test(from)) deletedTests.push(from);
    if (st.startsWith('R') && TEST_PATH.test(from) && to && !TEST_PATH.test(to)) deletedTests.push(`${from} (moved out of tests to ${to})`);
  }
  // The approval binds to both: the definition at the integrated commit and the set of deleted tests.
  const hash = createHash('sha256').update(JSON.stringify([b.hash, deletedTests])).digest('hex');
  return { changed, deletedTests, baseHash: a.hash, hash };
}
