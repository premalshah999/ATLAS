import { describe, expect, it } from 'vitest';
import { approvalUsable, classifyCommand, evaluate } from '../src';

describe('policy.evaluate', () => {
  it('allows safe reads and test runs for a coder', () => {
    expect(evaluate({ role: 'coder', tool: 'read_file', args: { path: 'a' }, mode: 'ask_risky' }).decision).toBe('allow');
    expect(evaluate({ role: 'coder', tool: 'shell_exec', args: { command: 'npm', args: ['test'] }, mode: 'ask_risky' }).decision).toBe('allow');
    expect(evaluate({ role: 'coder', tool: 'write_file', args: { path: 'a', content: '' }, mode: 'ask_risky' }).decision).toBe('allow');
  });
  it('asks for privileged commands', () => {
    for (const [command, args] of [['npm', ['install', 'left-pad']], ['curl', ['https://example.com']], ['git', ['push']], ['rm', ['-rf', 'src']], ['bash', ['-c', 'echo hi']]] as const) {
      expect(evaluate({ role: 'coder', tool: 'shell_exec', args: { command, args: [...args] }, mode: 'ask_risky' }).decision, command).toBe('ask');
    }
  });
  it('denies forbidden executables, unknown tools and capabilities a role lacks', () => {
    expect(evaluate({ role: 'coder', tool: 'shell_exec', args: { command: 'sudo', args: ['ls'] }, mode: 'ask_risky' }).decision).toBe('deny');
    expect(evaluate({ role: 'coder', tool: 'shell_exec', args: { command: 'ls;rm', args: [] }, mode: 'ask_risky' }).decision).toBe('deny');
    expect(evaluate({ role: 'coder', tool: 'deploy_production', args: {}, mode: 'ask_risky' }).decision).toBe('deny');
    expect(evaluate({ role: 'reviewer', tool: 'write_file', args: { path: 'a', content: '' }, mode: 'ask_risky' }).decision).toBe('deny');
    expect(evaluate({ role: 'tester', tool: 'shell_exec', args: { command: 'npm', args: ['install'] }, mode: 'ask_risky' }).decision).toBe('deny');
  });
  it('plan-only mode denies writes; ask_all_writes prompts for them', () => {
    expect(evaluate({ role: 'coder', tool: 'write_file', args: { path: 'a', content: '' }, mode: 'plan_only' }).decision).toBe('deny');
    expect(evaluate({ role: 'coder', tool: 'write_file', args: { path: 'a', content: '' }, mode: 'ask_all_writes' }).decision).toBe('ask');
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
    expect(evaluate({ role: 'desktop_operator', tool: 'desktop_action', args: {}, mode: 'ask_risky' }).decision).toBe('allow');
    for (const role of ['coder', 'reviewer', 'tester', 'browser_qa', 'orchestrator', 'deployment_verifier'] as const) {
      expect(evaluate({ role, tool: 'desktop_action', args: {}, mode: 'ask_risky' }).decision).toBe('deny');
    }
  });
  it('desktop_operator gets no shell, writes or deploys', () => {
    for (const tool of ['shell_exec', 'write_file', 'staging_deploy']) {
      expect(evaluate({ role: 'desktop_operator', tool, args: { command: 'ls' }, mode: 'ask_risky' }).decision).toBe('deny');
    }
  });
  it('staging deploys are never an agent tool', () => {
    expect(evaluate({ role: 'deployment_verifier', tool: 'staging_deploy', args: {}, mode: 'ask_risky' }).decision).toBe('deny');
  });
});

describe('Windows command names', () => {
  it('classifies shims and executables by their base name', () => {
    expect(classifyCommand('npm.cmd', ['test'])).toMatchObject({ capability: 'shell.safe' });
    expect(classifyCommand('C:\\Program Files\\nodejs\\node.exe', ['x.js'])).toMatchObject({ capability: 'shell.safe' });
    expect(classifyCommand('cmd.exe', ['/c', 'dir'])).toMatchObject({ capability: 'shell.privileged', risk: 'high' });
    expect(classifyCommand('powershell.exe', ['-c', 'ls'])).toMatchObject({ capability: 'shell.privileged' });
  });
  it('denies Windows privilege and credential tools outright', () => {
    for (const c of ['runas.exe', 'reg', 'icacls.exe', 'cmdkey', 'schtasks.exe', 'CheckNetIsolation.exe']) expect(classifyCommand(c, []).capability, c).toBeNull();
  });
});
