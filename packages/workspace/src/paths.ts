// Canonical path checks (manual §18). Every file operation resolves through here; symlinks may not escape a root.
import { realpathSync, existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { AtlasError } from '@atlas/contracts';

const within = (root: string, p: string) => p === root || p.startsWith(root.endsWith(path.sep) ? root : root + path.sep);

/** Resolve `rel` inside `root`, following symlinks, and refuse anything that lands outside. */
export function resolveInside(root: string, rel: string, opts: { forWrite?: boolean } = {}): string {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 4096 || rel.includes('\0')) throw new AtlasError('policy_deny', 'Invalid path');
  if (path.isAbsolute(rel)) throw new AtlasError('policy_deny', 'Absolute paths are not allowed; use a path relative to the workspace');
  const realRoot = realpathSync(root);
  const target = path.resolve(realRoot, rel);
  if (!within(realRoot, target)) throw new AtlasError('policy_deny', `Path escapes the workspace: ${rel}`);
  const rel2 = path.relative(realRoot, target);
  if (rel2.split(path.sep)[0] === '.git') throw new AtlasError('policy_deny', 'The .git directory is managed by ATLAS, not by agents');

  // Walk up to the nearest existing ancestor and make sure its real location is still inside.
  let probe = target;
  while (!existsSync(probe)) {
    const up = path.dirname(probe);
    if (up === probe) break;
    probe = up;
  }
  const realProbe = realpathSync(probe);
  if (!within(realRoot, realProbe)) throw new AtlasError('policy_deny', `Path resolves outside the workspace through a symlink: ${rel}`);
  if (existsSync(target)) {
    const st = lstatSync(target);
    if (st.isSymbolicLink()) {
      const real = realpathSync(target);
      if (!within(realRoot, real)) throw new AtlasError('policy_deny', `Symlink points outside the workspace: ${rel}`);
      if (opts.forWrite) throw new AtlasError('policy_deny', `Refusing to write through a symlink: ${rel}`);
    }
  }
  return target;
}
