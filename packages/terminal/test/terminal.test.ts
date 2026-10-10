import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { isAlive, run, sanitizedEnv } from '../src';
import { tmpDir } from '../../../tests/helpers';

describe('terminal executor', () => {
  it('streams output and reports exit codes', async () => {
    const chunks: string[] = [];
    const r = await run({ command: 'node', args: ['-e', 'console.log("hi"); console.error("err"); process.exit(3)'], cwd: process.cwd(), timeoutMs: 10_000, onOutput: (_s, t) => chunks.push(t) });
    expect(r.exitCode).toBe(3);
    expect(chunks.join('')).toContain('hi');
    expect(r.output).toContain('err');
  });

  it('cancellation kills the whole process tree with no orphans', async () => {
    const dir = tmpDir();
    const pidFile = path.join(dir, 'child.pid');
    // Parent spawns a long-lived grandchild and records its pid, then waits forever.
    const script = `const { spawn } = require('child_process'); const c = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], { stdio: 'ignore' }); require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setInterval(()=>{}, 1000);`;
    const ac = new AbortController();
    const p = run({ command: 'node', args: ['-e', script], cwd: dir, timeoutMs: 60_000, signal: ac.signal });
    for (let i = 0; i < 100 && !existsSync(pidFile); i++) await new Promise((r) => setTimeout(r, 50));
    const grandchild = Number(readFileSync(pidFile, 'utf8'));
    expect(isAlive(grandchild)).toBe(true);
    ac.abort();
    const r = await p;
    expect(r.cancelled).toBe(true);
    for (let i = 0; i < 40 && isAlive(grandchild); i++) await new Promise((r) => setTimeout(r, 50));
    expect(isAlive(grandchild)).toBe(false);
  });

  it('enforces timeouts', async () => {
    const r = await run({ command: 'node', args: ['-e', 'setInterval(()=>{}, 1000)'], cwd: process.cwd(), timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).not.toBe(0);
  });

  it('passes only allowlisted environment variables', () => {
    const env = sanitizedEnv({}, { PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'sk-ant-xyz', AWS_SECRET_ACCESS_KEY: 'x' });
    expect(env).toMatchObject({ PATH: '/bin', HOME: '/h', CI: '1' });
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
  });

  it('never invokes a shell', async () => {
    const r = await run({ command: 'echo', args: ['$(whoami)', ';', 'ls'], cwd: process.cwd(), timeoutMs: 5000 });
    expect(r.output.trim()).toBe('$(whoami) ; ls');
  });
});
