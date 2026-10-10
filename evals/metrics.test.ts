import { describe, expect, it } from 'vitest';
import { compare, summarize, wilson, type CaseResult, type RunMeta } from './metrics';

const res = (over: Partial<CaseResult>): CaseResult => ({ id: 'x', category: 'c', title: 't', status: 'ran', verdict: 'verified', expected: 'verified', oracle: true, oracleDetail: '', missionId: 'msn_1', outcome: '', durationMs: 1000, resources: { toolCalls: 1, commands: 1, approvals: 0, artifactBytes: 10, tokens: 0 }, trace: [], ...over });
const meta: RunMeta = { runtime: 'fake', model: null, atlasCommit: 'abc', startedAt: '', platform: 'linux', node: '22', sandbox: 'bwrap', browser: null };

describe('eval metrics', () => {
  it('wilson interval is bounded and wide for small samples', () => {
    expect(wilson(0, 0).rate).toBeNull();
    const w = wilson(1, 2);
    expect(w.rate).toBe(0.5);
    expect(w.low!).toBeGreaterThan(0);
    expect(w.high!).toBeLessThan(1);
    expect(w.high! - w.low!).toBeGreaterThan(0.6);
    expect(wilson(10, 10).high).toBe(1);
  });

  it('a verified-but-wrong result counts as a false pass, never as success', () => {
    const s = summarize([res({ id: 'a' }), res({ id: 'b', oracle: false }), res({ id: 'c', verdict: 'failed', expected: 'failed', oracle: false })]);
    expect(s.taskSuccess).toMatchObject({ k: 1, n: 3 });
    expect(s.falsePass).toMatchObject({ k: 1, n: 2 });
    expect(s.falseFail).toMatchObject({ k: 0, n: 1 });
    expect(s.expectationMet).toMatchObject({ k: 3, n: 3 });
  });

  it('skipped cases are not counted as passes', () => {
    const s = summarize([res({ id: 'a', status: 'skipped', verdict: 'none' })]);
    expect(s.ran).toBe(0);
    expect(s.taskSuccess.n).toBe(0);
  });

  it('only compares matched cases with the same runtime and model', () => {
    const base = { meta, results: [res({ id: 'a' }), res({ id: 'b' })] };
    const cur = { meta, results: [res({ id: 'a', verdict: 'failed' }), res({ id: 'z' })] };
    expect(compare(cur, base)).toMatchObject({ comparable: true, regressions: ['a'], improvements: [] });
    expect(compare({ ...cur, meta: { ...meta, runtime: 'pi', model: 'm' } }, base).comparable).toBe(false);
  });
});
