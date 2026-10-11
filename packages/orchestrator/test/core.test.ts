import { describe, expect, it } from 'vitest';
import { canMission, canTask, defaultPlan, gate, replay, validatePlan } from '../src';
import type { AtlasEvent } from '@atlas/contracts';

const task = (key: string, dependsOn: string[] = [], extra = {}) => ({ key, title: key, role: 'coder', dependsOn, acceptance: ['x'], tools: ['read_file'], risk: 'low', ...extra });
const plan = (tasks: unknown[]) => ({ version: 1, summary: 's', scope: 'worktree', tasks, verification: [] });

describe('state machines', () => {
  it('rejects invalid transitions', () => {
    expect(canMission('draft', 'running')).toBe(false);
    expect(canMission('completed', 'running')).toBe(false);
    expect(canMission('awaiting_approval', 'running')).toBe(true);
    expect(canTask('done', 'running')).toBe(false);
    expect(canTask('queued', 'ready')).toBe(true);
  });
});

describe('plan validation', () => {
  it('rejects a cyclic plan', () => {
    const r = validatePlan(plan([task('a', ['c']), task('b', ['a']), task('c', ['b'])]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toContain('cycle');
  });
  it('rejects duplicate ids, unknown deps, unknown tools and high risk without rollback', () => {
    const r = validatePlan(plan([task('a'), task('a'), task('b', ['zz'], { tools: ['format_disk'] }), task('c', [], { risk: 'high' })]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(new Set(r.issues.map((i) => i.code))).toEqual(new Set(['duplicate_task', 'unknown_dependency', 'unknown_tool', 'missing_rollback']));
  });
  it('accepts the default plan', () => {
    expect(validatePlan(defaultPlan({ goal: 'Fix slugify', constraints: '', approvalMode: 'ask_risky' }, 1, true)).ok).toBe(true);
  });
});

describe('release gate', () => {
  it('only pass satisfies a required check', () => {
    expect(gate([{ name: 'tests', required: true, result: 'pass', reason: '' }]).verdict).toBe('verified');
    for (const result of ['fail', 'skipped', 'inconclusive', 'not_configured'] as const) {
      expect(gate([{ name: 'tests', required: true, result, reason: '' }]).verdict, result).toBe('failed');
    }
  });
  it('a passing review alone never makes a result verified', () => {
    expect(gate([{ name: 'review', required: true, result: 'pass', reason: '' }, { name: 'tests', required: false, result: 'not_configured', reason: '' }]).verdict).toBe('unverified');
    expect(gate([{ name: 'review', required: true, result: 'fail', reason: '' }, { name: 'tests', required: true, result: 'pass', reason: '' }]).verdict).toBe('failed');
  });
  it('missing checks never collapse into success', () => {
    expect(gate([]).verdict).toBe('unverified');
    expect(gate([{ name: 'tests', required: false, result: 'not_configured', reason: '' }]).verdict).toBe('unverified');
  });
});

describe('replay', () => {
  const ev = (seq: number, type: AtlasEvent['type'], payload: Record<string, unknown>, taskId: string | null = null): AtlasEvent =>
    ({ missionId: 'msn_aaaaaaaa', seq, type, ts: '', actor: { kind: 'operator' }, taskId, attemptId: null, payload, artifactIds: [] });
  it('reconstructs state and detects gaps', () => {
    const events = [ev(1, 'mission.created', {}), ev(2, 'mission.state', { to: 'planning' }), ev(3, 'task.state', { to: 'queued' }, 'tsk_aaaaaaaa'), ev(4, 'task.state', { to: 'done' }, 'tsk_aaaaaaaa')];
    expect(replay(events)).toMatchObject({ mission: 'planning', tasks: { tsk_aaaaaaaa: 'done' }, lastSeq: 4 });
    expect(() => replay([events[0], events[2]])).toThrow(/gap/);
  });
});

describe('noTestsRan', () => {
  it('recognises empty runs of common runners and ignores real ones', async () => {
    const { noTestsRan } = await import('../src/verification');
    expect(noTestsRan('# tests 0\n# pass 0\n')).toMatch(/0 tests/);
    expect(noTestsRan('No tests found, exiting with code 0')).toMatch(/jest/);
    expect(noTestsRan('No test files found, exiting with code 0')).toMatch(/vitest/);
    expect(noTestsRan('\n  0 passing (2ms)\n')).toMatch(/mocha/);
    expect(noTestsRan('============ no tests ran in 0.01s ============')).toMatch(/pytest/);
    expect(noTestsRan('# tests 5\n# pass 5\n')).toBeNull();
    expect(noTestsRan('  12 passing (40ms)')).toBeNull();
  });
});
