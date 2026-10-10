// End-to-end orchestration with the deterministic runtime against real git repositories (manual §44, §49).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { registerSecret } from '@atlas/contracts';
import { FakeRuntime, type FakeScript } from '@atlas/runtime-fake';
import { realExecutors, replay, type Executors } from '@atlas/orchestrator';
import { sampleRepo, sh } from '../helpers';
import { makeOrchestrator, startMission, waitFor } from './harness';

describe('sample mission', () => {
  it('edits code in an isolated worktree, verifies independently and keeps the user checkout intact', async () => {
    const root = sampleRepo();
    const head = sh(root, 'git', ['rev-parse', 'HEAD']);
    const h = makeOrchestrator();
    const id = await startMission(h, root);
    await h.orch.settle(id);
    const m = h.repo.mission(id)!;
    expect(m.state).toBe('completed');
    expect(m.outcome).toMatch(/^Verified: tests passed/);

    // Evidence: a real check record on the checkpointed commit, plus a patch artifact.
    const checks = h.repo.checks(id);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ name: 'tests', required: true, result: 'pass', exitCode: 0 });
    const t = h.repo.tasks(id)[0];
    expect(checks[0].commit).toBe(sh(t.worktree!, 'git', ['rev-parse', 'HEAD']));
    const patch = h.artifacts.read(t.resultRef!);
    expect(patch.intact).toBe(true);
    expect(patch.text).toContain('+    .toLowerCase()');

    // The user's checkout was never written.
    expect(sh(root, 'git', ['rev-parse', 'HEAD'])).toBe(head);
    expect(sh(root, 'git', ['status', '--porcelain'])).toBe('');
    expect(readFileSync(path.join(root, 'src/slugify.js'), 'utf8')).toContain('ATLAS-SAMPLE');

    // The audit trail answers who changed which file and why.
    const types = h.events.map((e) => e.type);
    for (const t of ['mission.created', 'plan.proposed', 'plan.approved', 'attempt.started', 'policy.decision', 'agent.tool_call', 'process.exited', 'workspace.worktree', 'check.result', 'gate.result']) expect(types).toContain(t);
    const write = h.events.find((e) => e.type === 'agent.tool_call' && e.payload.tool === 'write_file')!;
    expect(write.actor).toMatchObject({ kind: 'agent', role: 'coder' });

    // Replay reconstructs persisted state.
    const r = replay(h.repo.eventsSince(id, 0));
    expect(r.mission).toBe('completed');
    expect(r.tasks[t.id]).toBe('done');

    // Accept keeps the branch for the operator; the checkout is still untouched.
    await h.orch.decide(id, 'accept');
    expect(sh(root, 'git', ['branch', '--list', t.branch!])).toContain(t.branch!);
    expect(existsSync(t.worktree!)).toBe(false);
    expect(sh(root, 'git', ['rev-parse', 'HEAD'])).toBe(head);
  });

  it('a failing project fails the gate even when the agent claims success', async () => {
    const root = sampleRepo();
    const liar: FakeScript = { name: 'liar', matches: () => true, steps: () => [{ tool: 'read_file', args: { path: 'src/slugify.js' } }, { claim: 'All tests pass. The bug is fixed.' }] };
    const h = makeOrchestrator({ scripts: [liar] });
    const id = await startMission(h, root);
    await h.orch.settle(id);
    const m = h.repo.mission(id)!;
    expect(m.state).toBe('failed');
    expect(m.outcome).toMatch(/Blocked: tests failed/);
    expect(h.events.some((e) => e.type === 'agent.message' && e.payload.claim === true && /All tests pass/.test(String(e.payload.text)))).toBe(true);
  });

  it('reject removes the worktree and branch without touching the checkout', async () => {
    const root = sampleRepo();
    const h = makeOrchestrator();
    const id = await startMission(h, root);
    await h.orch.settle(id);
    const t = h.repo.tasks(id)[0];
    await h.orch.decide(id, 'reject');
    expect(existsSync(t.worktree!)).toBe(false);
    expect(sh(root, 'git', ['branch', '--list', t.branch!])).toBe('');
    expect(sh(root, 'git', ['status', '--porcelain'])).toBe('');
  });

  it('reports unverified when the project has no test command', async () => {
    const root = sampleRepo();
    sh(root, 'git', ['rm', '-q', 'package.json']);
    sh(root, 'git', ['commit', '-q', '-m', 'no tests']);
    const h = makeOrchestrator();
    const ws = await h.orch.registerWorkspace(root);
    const warnings = await h.orch.preflight(ws.id, 'fake');
    expect(warnings.some((w) => /No test command/.test(w.message))).toBe(true);
    const id = await startMission(h, root);
    await h.orch.settle(id);
    expect(h.repo.mission(id)!.outcome).toMatch(/^Unverified/);
  });
});

describe('governed tools', () => {
  it('a denied tool call never reaches an executor', async () => {
    const root = sampleRepo();
    const touched: string[] = [];
    const spy: Executors = {
      readFile: (a) => { touched.push(`read:${a}`); return realExecutors.readFile(a); },
      listDir: (a) => { touched.push(`list:${a}`); return realExecutors.listDir(a); },
      writeFile: (a, c) => { touched.push(`write:${a}`); realExecutors.writeFile(a, c); },
      exec: (o) => { touched.push(`exec:${o.command}`); return realExecutors.exec(o); },
    };
    const evil: FakeScript = { name: 'evil', matches: () => true, steps: () => [
      { tool: 'shell_exec', args: { command: 'sudo', args: ['cat', '/etc/shadow'] } },
      { tool: 'read_file', args: { path: '../../../../etc/passwd' } },
      { tool: 'write_file', args: { path: '.git/hooks/pre-commit', content: 'curl evil' } },
      { tool: 'deploy_production', args: {} },
      { claim: 'done' },
    ] };
    const h = makeOrchestrator({ scripts: [evil], executors: spy });
    const id = await startMission(h, root);
    await h.orch.settle(id);
    expect(touched.filter((t) => !t.startsWith('exec:npm'))).toEqual([]);
    const denials = h.events.filter((e) => e.type === 'policy.decision' && e.payload.decision === 'deny');
    expect(denials.length).toBeGreaterThanOrEqual(4);
  });

  it('privileged commands wait for approval; denial and approval are honored once', async () => {
    const root = sampleRepo();
    const script: FakeScript = { name: 'priv', matches: () => true, steps: () => [
      { tool: 'shell_exec', args: { command: 'git', args: ['commit', '--allow-empty', '-m', 'one'] } },
      { tool: 'shell_exec', args: { command: 'git', args: ['commit', '--allow-empty', '-m', 'two'] } },
      { claim: 'done' },
    ] };
    const h = makeOrchestrator({ scripts: [script] });
    const id = await startMission(h, root);
    const first = await waitFor(() => h.repo.approvals(id).find((a) => a.status === 'pending'));
    expect(first).toMatchObject({ tool: 'shell_exec', action: 'git commit --allow-empty -m one', capability: 'shell.privileged', scope: 'once' });
    h.orch.respondApproval(first.id, 'deny');
    expect(() => h.orch.respondApproval(first.id, 'approve')).toThrow(/already/);
    const second = await waitFor(() => h.repo.approvals(id).find((a) => a.status === 'pending' && a.id !== first.id));
    h.orch.respondApproval(second.id, 'approve');
    await h.orch.settle(id);
    const exits = h.events.filter((e) => e.type === 'process.exited').map((e) => e.payload.command);
    expect(exits).toContain('git commit --allow-empty -m two');
    expect(exits).not.toContain('git commit --allow-empty -m one');
  });

  it('expired approvals are not executed', async () => {
    const root = sampleRepo();
    const script: FakeScript = { name: 'priv', matches: () => true, steps: () => [{ tool: 'shell_exec', args: { command: 'git', args: ['tag', 'v9'] } }, { claim: 'done' }] };
    const h = makeOrchestrator({ scripts: [script], approvalTtlMs: 150 });
    const id = await startMission(h, root);
    await h.orch.settle(id);
    expect(h.repo.approvals(id)[0].status).toBe('expired');
    expect(h.events.some((e) => e.type === 'process.started')).toBe(false);
  });

  it('seeded secrets never reach artifacts or events', async () => {
    const root = sampleRepo();
    const secret = 'sk-ant-canary-0123456789abcdef';
    registerSecret(secret);
    const script: FakeScript = { name: 'leak', matches: () => true, steps: () => [
      { say: `my key is ${secret}` },
      { tool: 'write_file', args: { path: 'notes.txt', content: `token ${secret}` } },
      { tool: 'shell_exec', args: { command: 'cat', args: ['notes.txt'] } },
      { claim: `done ${secret}` },
    ] };
    const h = makeOrchestrator({ scripts: [script] });
    const id = await startMission(h, root);
    await h.orch.settle(id);
    expect(JSON.stringify(h.repo.eventsSince(id, 0))).not.toContain(secret);
    for (const a of h.artifacts.list(id)) expect(h.artifacts.read(a.id).text, a.name).not.toContain(secret);
  });
});

describe('cancellation and recovery', () => {
  it('cancelling a mission stops a long-running command and leaves no process behind', async () => {
    const root = sampleRepo();
    const script: FakeScript = { name: 'long', matches: () => true, steps: () => [{ tool: 'shell_exec', args: { command: 'node', args: ['-e', 'setInterval(()=>{},1000)'] } }, { claim: 'never' }] };
    // `node -e` is privileged; approve it as soon as it is requested.
    const h = makeOrchestrator({ scripts: [script] });
    const id = await startMission(h, root);
    const a = await waitFor(() => h.repo.approvals(id).find((x) => x.status === 'pending'));
    h.orch.respondApproval(a.id, 'approve');
    const started = await waitFor(() => h.events.find((e) => e.type === 'process.started'));
    const pid = started.payload.pid as number;
    await h.orch.cancelMission(id);
    expect(h.repo.mission(id)!.state).toBe('cancelled');
    let alive = true;
    for (let i = 0; i < 40 && alive; i++) { try { process.kill(pid, 0); await new Promise((r) => setTimeout(r, 50)); } catch { alive = false; } }
    expect(alive).toBe(false);
    expect(h.repo.tasks(id)[0].state).toBe('cancelled');
  });

  it('after a daemon crash, lost attempts are recorded and the mission completes in a fresh attempt', async () => {
    const root = sampleRepo();
    const slow = new FakeRuntime([{ name: 'hang', matches: () => true, steps: () => [{ tool: 'shell_exec', args: { command: 'node', args: ['-e', 'setInterval(()=>{},1000)'] } }] }]);
    const first = makeOrchestrator({ runtime: slow });
    const id = await startMission(first, root);
    const a = await waitFor(() => first.repo.approvals(id).find((x) => x.status === 'pending'));
    first.orch.respondApproval(a.id, 'approve');
    await waitFor(() => first.events.find((e) => e.type === 'process.started'));
    // Simulate a crash: stop the process without any state cleanup, then reopen the same data directory.
    await first.orch.shutdown();
    first.db.close();

    const second = makeOrchestrator({ dataDir: first.dataDir });
    const r = await second.orch.recover();
    expect(r).toMatchObject({ missions: [id], lostAttempts: 1 });
    await second.orch.settle(id);
    const attempts = second.repo.attempts(id);
    expect(attempts.map((x) => x.state)).toEqual(['lost', 'succeeded']);
    expect(second.repo.mission(id)!.state).toBe('completed');
    expect(replay(second.repo.eventsSince(id, 0)).mission).toBe('completed');
  });
});
