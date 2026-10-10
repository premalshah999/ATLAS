// Sandboxed execution inside real missions (manual §23 acceptance, ADR 0007).
import { describe, expect, it } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectSandbox } from '@atlas/terminal';
import type { FakeScript } from '@atlas/runtime-fake';
import { sampleRepo } from '../helpers';
import { makeOrchestrator, startMission, waitFor } from './harness';

const hasSandbox = detectSandbox().kind === 'bwrap';

describe.skipIf(!hasSandbox)('missions run commands in the OS sandbox', () => {
  it('a malicious agent command cannot reach a canary credential', async () => {
    const root = sampleRepo();
    const canary = path.join(os.homedir(), `.atlas-mission-canary-${process.pid}`);
    writeFileSync(canary, 'MISSION-CANARY-VALUE');
    // `cat` is on the safe list, so policy allows it without approval: only the sandbox stands in the way.
    const thief: FakeScript = { name: 'thief', matches: () => true, steps: () => [
      { tool: 'shell_exec', args: { command: 'cat', args: [canary] } },
      { tool: 'shell_exec', args: { command: 'ls', args: [os.homedir()] } },
      { claim: 'done' },
    ] };
    try {
      const h = makeOrchestrator({ scripts: [thief] });
      const id = await startMission(h, root);
      await h.orch.settle(id);
      const started = h.events.filter((e) => e.type === 'process.started');
      expect(started.length).toBe(2); // the two agent commands; verification runs are recorded as checks
      expect(started.every((e) => e.payload.sandboxed === true)).toBe(true);
      const all = JSON.stringify(h.repo.eventsSince(id, 0)) + h.artifacts.list(id).map((a) => h.artifacts.read(a.id).text).join('\n');
      expect(all).not.toContain('MISSION-CANARY-VALUE');
    } finally { rmSync(canary, { force: true }); }
  });

  it('network commands get egress only after approval', async () => {
    const root = sampleRepo();
    const script: FakeScript = { name: 'net', matches: () => true, steps: () => [{ tool: 'shell_exec', args: { command: 'npm', args: ['view', 'left-pad', 'version'], timeoutSec: 30 } }, { claim: 'done' }] };
    const h = makeOrchestrator({ scripts: [script] });
    const id = await startMission(h, root);
    const a = await waitFor(() => h.repo.approvals(id).find((x) => x.status === 'pending'));
    expect(h.events.some((e) => e.type === 'process.started')).toBe(false);
    h.orch.respondApproval(a.id, 'approve');
    await h.orch.settle(id);
    const st = h.events.find((e) => e.type === 'process.started' && String(e.payload.command).startsWith('npm view'))!;
    expect(st.payload).toMatchObject({ sandboxed: true, network: true });
    const exit = h.events.find((e) => e.type === 'process.exited' && String(e.payload.command).startsWith('npm view'))!;
    expect(exit.payload.exitCode).toBe(0);
  });
});

describe('without a sandbox', () => {
  it('fails closed: preflight blocks, commands are refused and checks are inconclusive', async () => {
    process.env.ATLAS_SANDBOX = 'none';
    detectSandbox(true);
    try {
      const root = sampleRepo();
      const h = makeOrchestrator();
      const ws = await h.orch.registerWorkspace(root);
      const pre = await h.orch.preflight(ws.id, 'fake');
      expect(pre.find((p) => p.level === 'block')?.message).toMatch(/No OS sandbox/);
      const id = await startMission(h, root);
      await h.orch.settle(id);
      expect(h.events.some((e) => e.type === 'process.started')).toBe(false);
      expect(h.repo.checks(id)[0]).toMatchObject({ name: 'tests', result: 'inconclusive' });
      expect(h.repo.mission(id)!.state).toBe('failed');
    } finally { delete process.env.ATLAS_SANDBOX; detectSandbox(true); }
  });

  it('runs unsandboxed only when the operator explicitly allowed it', async () => {
    process.env.ATLAS_SANDBOX = 'none';
    detectSandbox(true);
    try {
      const root = sampleRepo();
      const h = makeOrchestrator();
      h.repo.setSetting('execution.allowUnsandboxed', true);
      const id = await startMission(h, root);
      await h.orch.settle(id);
      expect(h.repo.mission(id)!.outcome).toMatch(/^Verified/);
      expect(h.events.filter((e) => e.type === 'process.started').every((e) => e.payload.sandboxed === false)).toBe(true);
    } finally { delete process.env.ATLAS_SANDBOX; detectSandbox(true); }
  });
});
