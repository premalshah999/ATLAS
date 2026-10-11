import { describe, expect, it } from 'vitest';
import { approvalUsable, classifyCommand, evaluate } from '../src';

describe('policy.evaluate', () => {
  it('allows safe reads and test runs for a coder', () => {
    expect(evaluate({ role: 'coder', tool: 'read_file', args: { path: 'a' }, mode: 'ask_risky', sandboxed: true }).decision).toBe('allow');
    expect(evaluate({ role: 'coder', tool: 'shell_exec', args: { command: 'npm', args: ['test'] }, mode: 'ask_risky', sandboxed: true }).decision).toBe('allow');
    expect(evaluate({ role: 'coder', tool: 'write_file', args: { path: 'a', content: '' }, mode: 'ask_risky', sandboxed: true }).decision).toBe('allow');
  });
  it('asks for privileged commands', () => {
    for (const [command, args] of [['npm', ['install', 'left-pad']], ['curl', ['https://example.com']], ['git', ['push']], ['rm', ['-rf', 'src']], ['bash', ['-c', 'echo hi']]] as const) {
      expect(evaluate({ role: 'coder', tool: 'shell_exec', args: { command, args: [...args] }, mode: 'ask_risky', sandboxed: true }).decision, command).toBe('ask');
    }
  });
  it('denies forbidden executables, unknown tools and capabilities a role lacks', () => {
    expect(evaluate({ role: 'coder', tool: 'shell_exec', args: { command: 'sudo', args: ['ls'] }, mode: 'ask_risky', sandboxed: true }).decision).toBe('deny');
    expect(evaluate({ role: 'coder', tool: 'shell_exec', args: { command: 'ls;rm', args: [] }, mode: 'ask_risky', sandboxed: true }).decision).toBe('deny');
    expect(evaluate({ role: 'coder', tool: 'deploy_production', args: {}, mode: 'ask_risky', sandboxed: true }).decision).toBe('deny');
    expect(evaluate({ role: 'reviewer', tool: 'write_file', args: { path: 'a', content: '' }, mode: 'ask_risky', sandboxed: true }).decision).toBe('deny');
    expect(evaluate({ role: 'tester', tool: 'shell_exec', args: { command: 'npm', args: ['install'] }, mode: 'ask_risky', sandboxed: true }).decision).toBe('deny');
  });
  it('plan-only mode denies writes; ask_all_writes prompts for them', () => {
    expect(evaluate({ role: 'coder', tool: 'write_file', args: { path: 'a', content: '' }, mode: 'plan_only', sandboxed: true }).decision).toBe('deny');
    expect(evaluate({ role: 'coder', tool: 'write_file', args: { path: 'a', content: '' }, mode: 'ask_all_writes', sandboxed: true }).decision).toBe('ask');
  });
  it('git subcommands are classified by effect', () => {
    expect(classifyCommand('git', ['status']).capability).toBe('shell.safe');
    expect(classifyCommand('git', ['reset', '--hard']).risk).toBe('high');
  });
});

describe('approvals', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 1).toISOString();
  it('is usable only when approved and unexpired', () => {
    expect(approvalUsable({ status: 'approved', expiresAt: future }).ok).toBe(true);
    expect(approvalUsable({ status: 'approved', expiresAt: past }).ok).toBe(false);
    expect(approvalUsable({ status: 'pending', expiresAt: future }).ok).toBe(false);
    expect(approvalUsable({ status: 'denied', expiresAt: future }).ok).toBe(false);
    expect(approvalUsable({ status: 'expired', expiresAt: future }).ok).toBe(false);
  });
});

describe('desktop and deploy capabilities', () => {
  it('desktop input belongs to desktop_operator only', () => {
    expect(evaluate({ role: 'desktop_operator', tool: 'desktop_action', args: {}, mode: 'ask_risky', sandboxed: true }).decision).toBe('allow');
    for (const role of ['coder', 'reviewer', 'tester', 'browser_qa', 'orchestrator', 'deployment_verifier'] as const) {
      expect(evaluate({ role, tool: 'desktop_action', args: {}, mode: 'ask_risky', sandboxed: true }).decision).toBe('deny');
    }
  });
  it('desktop_operator gets no shell, writes or deploys', () => {
    for (const tool of ['shell_exec', 'write_file', 'staging_deploy']) {
      expect(evaluate({ role: 'desktop_operator', tool, args: { command: 'ls' }, mode: 'ask_risky', sandboxed: true }).decision).toBe('deny');
    }
  });
  it('staging deploys are never an agent tool', () => {
    expect(evaluate({ role: 'deployment_verifier', tool: 'staging_deploy', args: {}, mode: 'ask_risky', sandboxed: true }).decision).toBe('deny');
  });
});

describe('Windows command names', () => {
  it('classifies shims and executables by their base name', () => {
    expect(classifyCommand('npm.cmd', ['test'])).toMatchObject({ capability: 'shell.safe' });
    expect(classifyCommand('node.exe', ['x.js'])).toMatchObject({ capability: 'shell.safe' });
    // A path runs whatever file is there; only bare names (resolved on PATH) are classified by name.
    expect(classifyCommand('C:\\Program Files\\nodejs\\node.exe', ['x.js'])).toMatchObject({ capability: 'shell.privileged' });
    expect(classifyCommand('cmd.exe', ['/c', 'dir'])).toMatchObject({ capability: 'shell.privileged', risk: 'high' });
    expect(classifyCommand('powershell.exe', ['-c', 'ls'])).toMatchObject({ capability: 'shell.privileged' });
  });
  it('denies Windows privilege and credential tools outright', () => {
    for (const c of ['runas.exe', 'reg', 'icacls.exe', 'cmdkey', 'schtasks.exe', 'CheckNetIsolation.exe']) expect(classifyCommand(c, []).capability, c).toBeNull();
  });
});

describe('argument forms that run programs (evolution P1-1)', () => {
  const privileged: [string, string[]][] = [
    ['git', ['-ccore.fsmonitor=touch /tmp/x', 'status']], ['git', ['-c', 'core.pager=sh', 'log']], ['git', ['--exec-path=/tmp', 'status']], ['git', ['-p', 'log']],
    ['git', ['grep', '-Osh', 'x']], ['git', ['grep', '--open-files-in-pager=sh', 'x']], ['git', ['diff', '--ext-diff']], ['git', ['log', '--output=/tmp/x']],
    ['git', ['show', '--textconv', 'HEAD:x']], ['git', ['branch', 'evil']], ['git', ['branch', '-D', 'main']],
    ['find', ['.', '-exec', 'sh', '-c', 'id', ';']], ['find', ['.', '-delete']], ['sort', ['--compress-program=sh', 'f']], ['sort', ['-o', 'x', 'f']],
    ['rg', ['--pre', 'sh', 'x']], ['rg', ['--pre=sh', 'x']], ['node', ['--require', './evil.js', 'x.js']],
    ['pnpm', ['exec', 'sh', '-c', 'id']], ['npm', ['exec', '--', 'bash']], ['npm', ['test', '--script-shell=/bin/sh']], ['npm', ['--userconfig=/tmp/rc', 'test']],
  ];
  const safe: [string, string[]][] = [
    ['git', ['status']], ['git', ['log', '--oneline', '-5']], ['git', ['diff', 'HEAD~1']], ['git', ['grep', '-n', 'slugify']], ['git', ['branch', '--list']], ['git', ['branch', '-a']],
    ['find', ['.', '-name', '*.ts']], ['rg', ['-n', 'TODO']], ['sort', ['file.txt']], ['node', ['test.js']], ['npm', ['test']], ['pnpm', ['run', 'test']],
  ];
  it.each(privileged)('%s %j needs approval', (c, a) => { expect(classifyCommand(c, a).capability).toBe('shell.privileged'); });
  it.each(safe)('%s %j stays safe', (c, a) => { expect(classifyCommand(c, a).capability).toBe('shell.safe'); });
});

describe('without an OS sandbox (evolution P1-2)', () => {
  const ev = (command: string, args: string[], sandboxed: boolean, role: 'coder' | 'tester' = 'coder') => evaluate({ role, tool: 'shell_exec', args: { command, args }, mode: 'ask_risky', sandboxed });
  it.each([
    ['npm', ['test']], ['pnpm', ['run', 'build']], ['yarn', ['t']], ['node', ['scripts/x.js']], ['npx', ['vitest']], ['tsc', ['--noEmit']],
  ] as const)('%s %s runs project code: allowed sandboxed, asks unsandboxed', (cmd, args) => {
    expect(ev(cmd, [...args], true).decision).toBe('allow');
    const d = ev(cmd, [...args], false);
    expect(d.decision).toBe('ask');
    expect(d.reason).toMatch(/No OS sandbox/);
  });
  it.each([['cat', ['a']], ['git', ['status']], ['rg', ['x']], ['ls', []]] as const)('%s %s reads only: still allowed unsandboxed', (cmd, args) => {
    expect(ev(cmd, [...args], false).decision).toBe('allow');
  });
  it('run_tests asks unsandboxed, for a tester too (the role still holds the capability)', () => {
    const d = evaluate({ role: 'tester', tool: 'run_tests', args: {}, mode: 'ask_risky', sandboxed: false });
    expect(d).toMatchObject({ decision: 'ask', capability: 'shell.safe' });
    expect(evaluate({ role: 'tester', tool: 'run_tests', args: {}, mode: 'ask_risky', sandboxed: true }).decision).toBe('allow');
  });
});

describe('path-qualified programs and package-manager config (P1-2 review)', () => {
  it.each(['./ls', 'script/test', 'tools\\ls.cmd', 'node_modules/.bin/vitest', '../x/cat'])('%s is never safe-listed, and asks unsandboxed', (cmd) => {
    expect(classifyCommand(cmd, [])).toMatchObject({ capability: 'shell.privileged', runsProjectCode: true });
    expect(evaluate({ role: 'coder', tool: 'shell_exec', args: { command: cmd, args: [] }, mode: 'ask_risky', sandboxed: true }).decision).toBe('ask');
    expect(evaluate({ role: 'reviewer', tool: 'shell_exec', args: { command: cmd, args: [] }, mode: 'ask_risky', sandboxed: true }).decision).toBe('deny');
  });
  it('system programs by absolute path are still classified by name', () => {
    expect(classifyCommand('/usr/bin/git', ['status'])).toMatchObject({ capability: 'shell.safe' });
  });
  it.each([['yarn', ['why', 'x']], ['pnpm', ['ls']], ['npm', ['outdated']], ['bun', ['pm', 'ls']]] as const)('%s %s loads project config: asks unsandboxed', (cmd, args) => {
    const d = evaluate({ role: 'coder', tool: 'shell_exec', args: { command: cmd, args: [...args] }, mode: 'ask_risky', sandboxed: false });
    expect(d.decision).toBe('ask');
  });
});

describe('long-option abbreviations (final audit finding)', () => {
  it.each([
    ['sort', ['--compress-p=sh', 'f']], ['sort', ['--out=/tmp/x', 'f']], ['sort', ['--o=/tmp/x', 'f']],
    ['git', ['grep', '--open-files=sh', 'x']], ['git', ['grep', '--open-fi', 'x']], ['git', ['log', '--ext-d']],
    ['git', ['branch', '--del']], ['rg', ['--pr=sh', 'x']], ['diff', ['--to-f=x', 'a']],
  ] as const)('%s %s is privileged, and asks even unsandboxed', (cmd, args) => {
    expect(classifyCommand(cmd, [...args]).capability).toBe('shell.privileged');
    expect(evaluate({ role: 'coder', tool: 'shell_exec', args: { command: cmd, args: [...args] }, mode: 'ask_risky', sandboxed: false }).decision).toBe('ask');
  });
  it.each([['sort', ['-n', 'f']], ['sort', ['--reverse', 'f']], ['git', ['log', '--oneline']], ['git', ['grep', '-n', 'x']], ['rg', ['--files']]] as const)('%s %s stays safe', (cmd, args) => {
    expect(classifyCommand(cmd, [...args]).capability).toBe('shell.safe');
  });
});
