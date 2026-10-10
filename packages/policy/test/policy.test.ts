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
