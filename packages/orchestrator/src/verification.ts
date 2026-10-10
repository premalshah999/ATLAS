// Verification recipes and the release gate (manual §28, §32). A check passes only on a real exit code.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CheckRecord, CheckResult } from '@atlas/contracts';

export interface Recipe { name: string; command: string; args: string[]; required: boolean; timeoutMs: number }

function pkgManager(root: string): 'pnpm' | 'yarn' | 'npm' {
  if (existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/** Discover checks from project scripts. Unknown projects get no recipes (reported as not configured). */
export function detectRecipes(root: string): Recipe[] {
  const file = path.join(root, 'package.json');
  if (!existsSync(file)) return [];
  let scripts: Record<string, string> = {};
  try { scripts = JSON.parse(readFileSync(file, 'utf8')).scripts ?? {}; } catch { return []; }
  const pm = pkgManager(root);
  const out: Recipe[] = [];
  const test = scripts.test;
  if (test && !/no test specified/.test(test)) out.push({ name: 'tests', command: pm, args: pm === 'npm' ? ['test'] : ['run', 'test'], required: true, timeoutMs: 10 * 60_000 });
  for (const s of ['typecheck', 'lint']) if (scripts[s]) out.push({ name: s, command: pm, args: ['run', s], required: false, timeoutMs: 10 * 60_000 });
  return out;
}

export type Verdict = 'verified' | 'unverified' | 'failed';

/** Aggregate checks. Only `pass` satisfies a required check; missing checks never count as success. */
export function gate(checks: Pick<CheckRecord, 'name' | 'required' | 'result' | 'reason'>[]): { verdict: Verdict; summary: string } {
  const required = checks.filter((c) => c.required);
  const failedReq = required.filter((c) => c.result !== 'pass');
  if (failedReq.length) {
    return { verdict: 'failed', summary: `Blocked: ${failedReq.map((c) => `${c.name} ${label(c.result)}`).join(', ')}` };
  }
  const passed = checks.filter((c) => c.result === 'pass');
  const other = checks.filter((c) => !c.required && c.result !== 'pass');
  if (!passed.length) {
    return { verdict: 'unverified', summary: `Unverified: no check ran to a pass${checks.length ? ` (${checks.map((c) => `${c.name} ${label(c.result)}`).join(', ')})` : ' — no test command configured'}` };
  }
  return { verdict: 'verified', summary: `Verified: ${passed.map((c) => c.name).join(', ')} passed${other.length ? `; ${other.map((c) => `${c.name} ${label(c.result)}`).join(', ')}` : ''}` };
}

export function label(r: CheckResult): string {
  return { pass: 'passed', fail: 'failed', skipped: 'skipped', inconclusive: 'inconclusive', not_configured: 'not configured' }[r];
}
