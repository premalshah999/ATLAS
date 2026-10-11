// Repository manager (manual §18–19): inspection, per-task worktrees, checkpoints and diffs.
import { mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
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

export interface PreservedRef { ref: string; sha: string; what: 'uncommitted' | 'branch' }

/**
 * Keep a worktree's work reachable before it is removed (evolution P1-3, concept from agent-orchestrator and
 * limboo): uncommitted and untracked changes are snapshotted through a throwaway index into a commit under
 * `<refBase>/uncommitted`, and the branch tip is kept at `<refBase>/branch`. The user's checkout, the
 * worktree's own index and its files are never modified. Ignored files are not captured.
 */
export async function preserveWorktree(repoRoot: string, dir: string, branch: string | null, refBase: string): Promise<PreservedRef[]> {
  const out: PreservedRef[] = [];
  if (existsSync(dir)) {
    const status = await git(dir, ['status', '--porcelain', '--untracked-files=all']);
    const head = await git(dir, ['rev-parse', '--verify', 'HEAD']);
    if (status.code === 0 && status.out.trim() && head.code === 0) {
      const index = path.join(mkdtempSync(path.join(os.tmpdir(), 'atlas-idx-')), 'index');
      const env = { GIT_INDEX_FILE: index };
      try {
        const steps = [await git(dir, ['read-tree', 'HEAD'], 30_000, env), await git(dir, ['add', '-A'], 120_000, env)];
        const tree = await git(dir, ['write-tree'], 30_000, env);
        if (steps.every((r) => r.code === 0) && tree.code === 0) {
          const commit = await git(dir, ['commit-tree', tree.out.trim(), '-p', head.out.trim(), '-m', `ATLAS: preserved uncommitted work from ${path.basename(dir)}`]);
          if (commit.code === 0) {
            const ref = `${refBase}/uncommitted`;
            await gitOk(repoRoot, ['update-ref', ref, commit.out.trim()]);
            out.push({ ref, sha: commit.out.trim(), what: 'uncommitted' });
          }
        }
      } finally { rmSync(path.dirname(index), { recursive: true, force: true }); }
    }
  }
  if (branch) {
    const tip = await git(repoRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
    if (tip.code === 0 && tip.out.trim()) {
      const ref = `${refBase}/branch`;
      await gitOk(repoRoot, ['update-ref', ref, tip.out.trim()]);
      out.push({ ref, sha: tip.out.trim(), what: 'branch' });
    }
  }
  return out;
}

/** Preserve, then remove. Use this wherever work might still be in the worktree. */
export async function retireWorktree(repoRoot: string, dir: string, branch: string | null, refBase: string): Promise<PreservedRef[]> {
  const kept = await preserveWorktree(repoRoot, dir, branch, refBase);
  await removeWorktree(repoRoot, dir, branch);
  return kept;
}

/** Delete every ref under a prefix (used when a mission is deleted). */
export async function deleteRefs(repoRoot: string, prefix: string): Promise<number> {
  const refs = (await git(repoRoot, ['for-each-ref', '--format=%(refname)', prefix])).out.split('\n').filter(Boolean);
  for (const r of refs) await git(repoRoot, ['update-ref', '-d', r]);
  return refs.length;
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
export { loadConfig } from './config';
