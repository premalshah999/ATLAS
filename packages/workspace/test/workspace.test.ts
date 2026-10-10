import { describe, expect, it } from 'vitest';
import { mkdirSync, symlinkSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { checkpoint, createWorktree, diffSince, inspectRepo, Leases, removeWorktree, resolveInside } from '../src';
import { sampleRepo, sh, tmpDir } from '../../../tests/helpers';

describe('resolveInside', () => {
  const root = tmpDir();
  const outside = tmpDir();
  writeFileSync(path.join(outside, 'secret.txt'), 'canary');
  mkdirSync(path.join(root, 'src'));
  symlinkSync(outside, path.join(root, 'escape'));
  symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'src', 'link.txt'));

  it('accepts normal relative paths', () => {
    expect(resolveInside(root, 'src/new.ts', { forWrite: true })).toMatch(/src\/new\.ts$/);
  });
  it('rejects traversal, absolute paths and .git', () => {
    expect(() => resolveInside(root, '../x')).toThrow(/escapes/);
    expect(() => resolveInside(root, '/etc/passwd')).toThrow(/Absolute/);
    expect(() => resolveInside(root, '.git/config')).toThrow(/\.git/);
  });
  it('rejects symlink escapes for read and write', () => {
    expect(() => resolveInside(root, 'escape/secret.txt')).toThrow(/symlink/);
    expect(() => resolveInside(root, 'escape/new.txt', { forWrite: true })).toThrow(/symlink/);
    expect(() => resolveInside(root, 'src/link.txt')).toThrow(/outside/);
  });
});

describe('worktrees', () => {
  it('isolates changes from the user checkout and checkpoints them', async () => {
    const repo = sampleRepo();
    writeFileSync(path.join(repo, 'README.md'), 'user edit in progress\n'); // dirty user checkout
    const info = await inspectRepo(repo);
    expect(info).toMatchObject({ isGit: true, dirty: 1 });
    const wt = path.join(tmpDir(), 'wt');
    await createWorktree(repo, wt, 'atlas/test', info.head!);
    expect(readFileSync(path.join(wt, 'README.md'), 'utf8')).not.toContain('user edit');
    writeFileSync(path.join(wt, 'src', 'slugify.js'), 'export const slugify = (s) => s;\n');
    const sha = await checkpoint(wt, 'test');
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    const d = await diffSince(wt, info.head!);
    expect(d.files).toEqual([{ path: 'src/slugify.js', add: 1, del: 5 }]);
    expect(readFileSync(path.join(repo, 'README.md'), 'utf8')).toBe('user edit in progress\n');
    expect(sh(repo, 'git', ['rev-parse', 'HEAD'])).toBe(info.head);
    await removeWorktree(repo, wt, 'atlas/test');
    expect(existsSync(wt)).toBe(false);
    expect(sh(repo, 'git', ['branch', '--list', 'atlas/test'])).toBe('');
  });
  it('checkpoint returns null when nothing changed', async () => {
    const repo = sampleRepo();
    const info = await inspectRepo(repo);
    const wt = path.join(tmpDir(), 'wt');
    await createWorktree(repo, wt, 'atlas/noop', info.head!);
    expect(await checkpoint(wt, 'noop')).toBeNull();
  });
  it('leases allow one writer per checkout', () => {
    const l = new Leases();
    expect(l.acquire('/x', 'a')).toBe(true);
    expect(l.acquire('/x', 'b')).toBe(false);
    l.release('/x', 'a');
    expect(l.acquire('/x', 'b')).toBe(true);
  });
  it('reports non-git directories', async () => {
    expect((await inspectRepo(tmpDir())).isGit).toBe(false);
  });
});
