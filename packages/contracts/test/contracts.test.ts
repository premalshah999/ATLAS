import { describe, expect, it } from 'vitest';
import { newId, parseRequest, redact, redactDeep, registerSecret } from '../src';

describe('redaction', () => {
  it('removes common secret shapes and registered values', () => {
    registerSecret('hunter2-canary-value');
    const s = redact('key sk-ant-api03-ABCDEFGHIJKLMNOP and ghp_abcdefghijklmnopqrstuvwxyz0123 and ANTHROPIC_API_KEY=abc123xyz and hunter2-canary-value and Bearer abcdefghijklmnopqrstuv');
    expect(s).not.toMatch(/sk-ant-api03-ABCDEF|ghp_abcdef|abc123xyz|hunter2-canary-value|abcdefghijklmnopqrstuv/);
    expect(s).toContain('ANTHROPIC_API_KEY=[REDACTED]');
  });
  it('redacts secret-named keys in objects', () => {
    expect(redactDeep({ apiKey: 'plain', nested: { token: 'x'.repeat(10), ok: 'fine' } })).toEqual({ apiKey: '[REDACTED]', nested: { token: '[REDACTED]', ok: 'fine' } });
  });
});

describe('IPC request validation', () => {
  it('rejects undeclared methods', () => {
    expect(() => parseRequest('shell.exec', {})).toThrow(/Undeclared method/);
    expect(() => parseRequest('__proto__', {})).toThrow(/Undeclared method/);
  });
  it('rejects malformed payloads and extra keys', () => {
    expect(() => parseRequest('mission.get', { missionId: '../../etc/passwd' })).toThrow();
    expect(() => parseRequest('mission.get', { missionId: newId('msn'), extra: 1 })).toThrow();
    expect(() => parseRequest('approval.respond', { approvalId: newId('apr'), decision: 'maybe' })).toThrow();
  });
  it('accepts well-formed payloads and applies defaults', () => {
    const r = parseRequest('mission.create', { workspaceId: newId('ws'), title: 'T', goal: 'G', approvalMode: 'ask_risky', runtime: 'fake' });
    expect(r.params).toMatchObject({ constraints: '' });
  });
});
