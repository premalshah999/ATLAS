// Verification recipes and the release gate (manual §28, §32). A check passes only on a real exit code.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { CheckRecord, CheckResult } from '@atlas/contracts';
import { loadConfig } from '@atlas/workspace';

export interface Recipe { name: string; command: string; args: string[]; required: boolean; timeoutMs: number }

function pkgManager(root: string): 'pnpm' | 'yarn' | 'npm' {
  if (existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/** Discover checks from project scripts. Unknown projects get no recipes (reported as not configured). */
export function detectRecipes(root: string): Recipe[] {
  // Explicit recipes from atlas.config.json come first; they run in the sandbox like everything else.
  const { config } = loadConfig(root);
  const fromConfig: Recipe[] = (config?.checks ?? []).map((c) => ({ name: c.name, command: c.command[0], args: c.command.slice(1), required: c.required, timeoutMs: c.timeoutSec * 1000 }));
  const names = new Set(fromConfig.map((r) => r.name));
  return [...fromConfig, ...detectScriptRecipes(root).filter((r) => !names.has(r.name))];
}

function detectScriptRecipes(root: string): Recipe[] {
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

/**
 * Checks that gate release but are not evidence the software works: a clean review, an approval.
 * They can block; they can never on their own make a result "verified".
 */
export const GATE_ONLY = new Set(['review', 'verification-definition']);

/** Aggregate checks. Only `pass` satisfies a required check; missing checks never count as success. */
export function gate(checks: Pick<CheckRecord, 'name' | 'required' | 'result' | 'reason'>[]): { verdict: Verdict; summary: string } {
  const required = checks.filter((c) => c.required);
  const failedReq = required.filter((c) => c.result !== 'pass');
  if (failedReq.length) {
    return { verdict: 'failed', summary: `Blocked: ${failedReq.map((c) => `${c.name} ${label(c.result)}`).join(', ')}` };
  }
  const evidence = checks.filter((c) => c.result === 'pass' && !GATE_ONLY.has(c.name));
  // An unchanged verification definition is the normal case; say nothing about it in the summary.
  const gates = checks.filter((c) => c.result === 'pass' && GATE_ONLY.has(c.name) && c.name !== 'verification-definition');
  const other = checks.filter((c) => !c.required && c.result !== 'pass');
  const tail = [...gates.map((c) => `${c.name} passed`), ...other.map((c) => `${c.name} ${label(c.result)}`)];
  if (!evidence.length) {
    const what = checks.filter((c) => !GATE_ONLY.has(c.name));
    return { verdict: 'unverified', summary: `Unverified: no check ran to a pass${what.length ? ` (${what.map((c) => `${c.name} ${label(c.result)}`).join(', ')})` : ' — no test command configured'}${gates.length ? `; ${gates.map((c) => `${c.name} passed`).join(', ')}` : ''}` };
  }
  return { verdict: 'verified', summary: `Verified: ${evidence.map((c) => c.name).join(', ')} passed${tail.length ? `; ${tail.join(', ')}` : ''}` };
}

export function label(r: CheckResult): string {
  return { pass: 'passed', fail: 'failed', skipped: 'skipped', inconclusive: 'inconclusive', not_configured: 'not configured' }[r];
}

/**
 * A test run that executed zero tests is not evidence, even when it exits 0 (node --test, jest, vitest, mocha and
 * pytest all can). Returns a reason when the output shows that nothing ran.
 */
export function noTestsRan(output: string): string | null {
  // eslint-disable-next-line no-control-regex -- strip ANSI colour codes from runner output
  const o = output.replace(/\x1b\[[0-9;]*m/g, '');
  if (/^# tests 0\s*$/m.test(o)) return 'The runner reported 0 tests (node --test)';
  if (/No tests found/i.test(o)) return 'The runner found no tests (jest)';
  if (/No test files found/i.test(o)) return 'The runner found no test files (vitest)';
  if (/^\s*0 passing\b/m.test(o) && !/\d+ failing/.test(o)) return 'The runner reported 0 passing tests (mocha)';
  if (/(^|=+ )no tests ran\b/im.test(o)) return 'The runner reported no tests ran (pytest)';
  if (/Tests?:\s+0 total/i.test(o)) return 'The runner reported 0 tests in total';
  return null;
}
