// Manual §23 acceptance: a malicious command cannot read a canary credential or a protected path,
// cannot write outside its worktree, and has no network unless explicitly granted.
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectSandbox, run, sanitizedEnv } from '../src';
import { tmpDir, sampleRepo } from '../../../tests/helpers';

const info = detectSandbox();
const d = info.kind === 'bwrap' ? describe : describe.skip;

d('OS sandbox (bwrap)', () => {
  const sh = (root: string, script: string, network = false, extraEnv: Record<string, string> = {}) =>
    run({ command: 'sh', args: ['-c', script], cwd: root, timeoutMs: 15_000, env: sanitizedEnv(extraEnv), sandbox: { root, writable: true, network } });

  it('hides canary credentials in the home directory and other paths', async () => {
    const root = tmpDir();
    const outside = tmpDir();
    writeFileSync(path.join(outside, 'canary.txt'), 'CANARY-SECRET');
    const homeCanary = path.join(os.homedir(), `.atlas-canary-${process.pid}`);
    writeFileSync(homeCanary, 'HOME-CANARY');
    try {
      const r = await sh(root, `cat ${outside}/canary.txt; cat ${homeCanary}; ls ${os.homedir()}; echo HOME=$HOME`);
      expect(r.output).not.toContain('CANARY-SECRET');
      expect(r.output).not.toContain('HOME-CANARY');
      expect(r.output).toContain('HOME=/home/atlas-sandbox');
    } finally { try { (await import('node:fs')).rmSync(homeCanary); } catch {} }
  });

  it('does not inherit credentials from the environment', async () => {
    process.env.ANTHROPIC_API_KEY_TEST_CANARY = 'sk-ant-canary-env';
    const r = await sh(tmpDir(), 'env');
    expect(r.output).not.toContain('sk-ant-canary-env');
    delete process.env.ANTHROPIC_API_KEY_TEST_CANARY;
  });

  it('writes only inside the worktree', async () => {
    const root = tmpDir();
    const outside = tmpDir();
    const r = await sh(root, `echo ok > inside.txt; echo bad > ${outside}/escape.txt; echo bad > /usr/escape.txt; echo done`);
    expect(existsSync(path.join(root, 'inside.txt'))).toBe(true);
    expect(existsSync(path.join(outside, 'escape.txt'))).toBe(false);
    expect(r.output).toContain('done');
  });

  it('has no network unless granted', async () => {
    const script = `node -e "require('net').connect(53,'1.1.1.1').on('connect',()=>{console.log('NET-UP');process.exit(0)}).on('error',e=>{console.log('NET-DOWN '+e.code);process.exit(0)})"`;
    const off = await sh(tmpDir(), script);
    expect(off.output).toMatch(/NET-DOWN/);
  });

  it('cannot see host processes', async () => {
    const r = await sh(tmpDir(), 'ls /proc | grep -E "^[0-9]+$" | wc -l');
    expect(Number(r.output.trim())).toBeLessThan(10);
  });

  it('runs a real project test suite inside the sandbox', async () => {
    const repo = sampleRepo();
    const r = await run({ command: 'npm', args: ['test'], cwd: repo, timeoutMs: 60_000, sandbox: { root: repo, writable: true, network: false } });
    expect(r.output).toMatch(/# fail 5/);
    expect(r.exitCode).toBe(1);
  });

  it('cancellation kills every process inside the sandbox', async () => {
    const tag = `atlas-sb-${process.pid}-${Date.now()}`;
    const ac = new AbortController();
    const dir = tmpDir();
    const p = run({ command: 'sh', args: ['-c', `node -e 'setInterval(()=>{},1000)' ${tag} & node -e 'setInterval(()=>{},1000)' ${tag} & wait`], cwd: dir, timeoutMs: 60_000, signal: ac.signal, sandbox: { root: dir, writable: true, network: false } });
    const { execFileSync } = await import('node:child_process');
    const { readFileSync } = await import('node:fs');
    // Count only the tagged node processes (the bwrap and sh wrappers also carry the tag in argv).
    const count = () => {
      let pids: string[] = [];
      try { pids = execFileSync('pgrep', ['-f', tag], { encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch { return 0; }
      return pids.filter((pid) => { try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')[0].endsWith('node'); } catch { return false; } }).length;
    };
    for (let i = 0; i < 50 && count() < 2; i++) await new Promise((r) => setTimeout(r, 50));
    expect(count()).toBe(2);
    ac.abort();
    await p;
    for (let i = 0; i < 40 && count() > 0; i++) await new Promise((r) => setTimeout(r, 50));
    expect(count()).toBe(0);
  });

  it('fails closed when the sandbox is disabled', async () => {
    process.env.ATLAS_SANDBOX = 'none';
    detectSandbox(true);
    try {
      const r = await sh(tmpDir(), 'echo should-not-run');
      expect(r.spawnError).toMatch(/No OS sandbox/);
      expect(r.output).toBe('');
    } finally { delete process.env.ATLAS_SANDBOX; detectSandbox(true); }
  });
});

it('reports sandbox availability', () => {
  expect(['bwrap', 'sandbox-exec', 'none']).toContain(info.kind);
  mkdirSync(tmpDir(), { recursive: true });
});
