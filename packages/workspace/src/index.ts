// Repository manager (manual §18–19): inspection, per-task worktrees, checkpoints and diffs.
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { git, gitOk } from './git';

export { resolveInside } from './paths';
export { git, gitOk } from './git';

export interface RepoInfo { root: string; name: string; isGit: boolean; branch: string | null; head: string | null; dirty: number }

export async function inspectRepo(dir: string): Promise<RepoInfo> {
  const top = await git(dir, ['rev-parse', '--show-toplevel']);
  if (top.code !== 0) return { root: dir, name: path.basename(dir), isGit: false, branch: null, head: null, dirty: 0 };
  const root = top.out;
  const [branch, head, status] = await Promise.all([
    git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(root, ['rev-parse', 'HEAD']),
    git(root, ['status', '--porcelain']),
  ]);
  return {
    root, name: path.basename(root), isGit: true,
    branch: branch.code === 0 ? branch.out : null,
    head: head.code === 0 ? head.out : null,
    dirty: status.code === 0 ? status.out.split('\n').filter(Boolean).length : 0,
  };
}

/** Writer leases: at most one writer per checkout (manual §13). */
export class Leases {
  private held = new Map<string, string>();
  acquire(checkout: string, owner: string): boolean {
    const k = path.resolve(checkout);
    const cur = this.held.get(k);
    if (cur && cur !== owner) return false;
    this.held.set(k, owner);
    return true;
  }
  release(checkout: string, owner: string) {
    const k = path.resolve(checkout);
    if (this.held.get(k) === owner) this.held.delete(k);
  }
  holder(checkout: string) { return this.held.get(path.resolve(checkout)) ?? null; }
}

/** Create an isolated worktree on a new branch at `base`. The user's checkout is never written. */
export async function createWorktree(repoRoot: string, dir: string, branch: string, base: string): Promise<void> {
  mkdirSync(path.dirname(dir), { recursive: true });
  if (existsSync(dir)) throw new Error(`worktree path already exists: ${dir}`);
  await gitOk(repoRoot, ['worktree', 'add', '-b', branch, dir, base]);
}

export async function removeWorktree(repoRoot: string, dir: string, branch: string | null): Promise<void> {
  await git(repoRoot, ['worktree', 'remove', '--force', dir]);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  await git(repoRoot, ['worktree', 'prune']);
  if (branch) await git(repoRoot, ['branch', '-D', branch]);
}

/** Commit everything in a task worktree as a checkpoint. Returns the commit, or null when nothing changed. */
export async function checkpoint(worktree: string, message: string): Promise<string | null> {
  await gitOk(worktree, ['add', '-A']);
  const st = await git(worktree, ['diff', '--cached', '--quiet']);
  if (st.code === 0) return null;
  await gitOk(worktree, ['-c', 'commit.gpgsign=false', 'commit', '--no-verify', '-q', '-m', message]);
  return gitOk(worktree, ['rev-parse', 'HEAD']);
}

export interface DiffSummary { patch: string; files: { path: string; add: number; del: number }[] }

export async function diffSince(worktree: string, base: string): Promise<DiffSummary> {
  const patch = await gitOk(worktree, ['diff', '--no-color', '--no-ext-diff', base, 'HEAD']);
  const stat = await gitOk(worktree, ['diff', '--numstat', base, 'HEAD']);
  const files = stat.split('\n').filter(Boolean).map((l) => {
    const [a, d, ...p] = l.split('\t');
    return { path: p.join('\t'), add: a === '-' ? 0 : Number(a), del: d === '-' ? 0 : Number(d) };
  });
  return { patch, files };
}
