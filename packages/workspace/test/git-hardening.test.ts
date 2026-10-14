// Daemon-owned git metadata (ADR 0031): ATLAS's own git calls on an agent-writable worktree never discover the
// repository through the worktree's `.git` pointer and never select a filter, textconv or diff driver.
import { describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkpoint, createWorktree } from '../src';
import { sampleRepo, sh, tmpDir } from '../../../tests/helpers';

/** A worktree whose `.git` pointer the agent replaced with one to a git dir it planted, with a filter that leaves a mark. */
async function plantedGitdir() {
  const repo = sampleRepo();
  const wt = path.join(tmpDir(), 'wt');
  await createWorktree(repo, wt, 'atlas/t/planted', 'HEAD');
  const marks = tmpDir('atlas-pwned-');
  const pwned = path.join(marks, 'PWNED');
  const evil = path.join(wt, 'evil');
  mkdirSync(evil);
  cpSync(path.join(repo, '.git', 'objects'), path.join(evil, 'objects'), { recursive: true });
  cpSync(path.join(repo, '.git', 'refs'), path.join(evil, 'refs'), { recursive: true });
  writeFileSync(path.join(evil, 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(path.join(evil, 'config'), `[core]\n\trepositoryformatversion = 0\n\tbare = false\n[filter "x"]\n\tclean = touch ${pwned}\n`);
  writeFileSync(path.join(wt, '.git'), `gitdir: ${evil}`);
  writeFileSync(path.join(wt, '.gitattributes'), '* filter=x\n');
  writeFileSync(path.join(wt, 'README.md'), 'agent edit\n');
  return { repo, wt, pwned };
}

describe('planted git metadata (the PWNED_CLEAN escape)', () => {
  it('checkpoint fails closed on a redirected .git pointer and never runs the planted filter', async () => {
    const { repo, wt, pwned } = await plantedGitdir();
    const before = sh(repo, 'git', ['rev-parse', 'atlas/t/planted']);
    const r = await checkpoint(wt, 'checkpoint').then((sha) => `committed ${sha}`, (e: Error) => e);
    expect(existsSync(pwned), 'the planted clean filter ran as the operator').toBe(false);
    expect(r).toBeInstanceOf(Error);
    expect((r as Error).message).toMatch(/tampered/i);
    // Nothing was committed anywhere: not on the task branch, not in the planted repository.
    expect(sh(repo, 'git', ['rev-parse', 'atlas/t/planted'])).toBe(before);
  });
});
