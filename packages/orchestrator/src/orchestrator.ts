// Mission orchestration (manual §12–14, §19, §28, §38, §40). Deterministic code owns scheduling,
// authorization and completion; agents only propose actions through the ToolGate.
import path from 'node:path';
import {
  AtlasError, newId, nowIso, RETRYABLE, type AgentRuntime, type Approval, type ApprovalMode, type Attempt, type AtlasEvent,
  type CheckRecord, type Mission, type MissionState, type NewEvent, type RuntimeKind, type Task, type TaskState, type Workspace,
} from '@atlas/contracts';
import type { ArtifactStore, Repo } from '@atlas/storage';
import { checkpoint, createWorktree, diffSince, inspectRepo, Leases, removeWorktree } from '@atlas/workspace';
import { detectSandbox, run, sanitizedEnv, type SandboxSpec } from '@atlas/terminal';
import { git } from '@atlas/workspace';
import { assertMission, assertTask, TERMINAL_TASK } from './states';
import { defaultPlan, validatePlan } from './plan';
import { role } from './roles';
import { ToolGate, realExecutors, type Executors, type Isolation } from './toolgate';
import { detectRecipes, gate, type Verdict } from './verification';

export interface OrchestratorOptions {
  repo: Repo;
  artifacts: ArtifactStore;
  runtimes: Partial<Record<RuntimeKind, AgentRuntime>>;
  /** Where task worktrees live. Never inside the user's checkout. */
  worktreeDir: string;
  maxConcurrentTasks?: number;
  maxAttempts?: number;
  approvalTtlMs?: number;
  executors?: Executors;
}

const SYSTEM = (component: string) => ({ kind: 'system' as const, component });
const OPERATOR = { kind: 'operator' as const };

export class Orchestrator {
  private readonly repo: Repo;
  private readonly artifacts: ArtifactStore;
  private readonly leases = new Leases();
  private readonly aborts = new Map<string, AbortController>();
  private readonly taskAborts = new Map<string, AbortController>();
  private readonly waiters = new Map<string, (a: Approval) => void>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly maxConcurrent: number;
  private readonly maxAttempts: number;
  private readonly approvalTtlMs: number;
  private stopping = false;

  constructor(private readonly o: OrchestratorOptions) {
    this.repo = o.repo;
    this.artifacts = o.artifacts;
    this.maxConcurrent = o.maxConcurrentTasks ?? 2;
    this.maxAttempts = o.maxAttempts ?? 2;
    this.approvalTtlMs = o.approvalTtlMs ?? 15 * 60_000;
  }

  /** Swap a runtime (e.g. after credentials change). Running attempts keep the instance they started with. */
  setRuntime(kind: RuntimeKind, rt: AgentRuntime) { this.o.runtimes[kind] = rt; }

  private emit(e: Omit<NewEvent, 'artifactIds' | 'taskId' | 'attemptId'> & Partial<Pick<NewEvent, 'artifactIds' | 'taskId' | 'attemptId'>>): AtlasEvent {
    return this.repo.append({ taskId: null, attemptId: null, artifactIds: [], ...e });
  }

  /* ---------------- isolation ---------------- */

  /** Sandbox for a worktree: its git admin dir is writable, the shared object store read-only. Fails closed. */
  async isolationFor(worktree: string): Promise<Isolation> {
    const sb = detectSandbox();
    if (sb.kind === 'none') {
      return this.repo.setting('execution.allowUnsandboxed', false) ? { mode: 'unsandboxed' } : { mode: 'unavailable', detail: sb.detail };
    }
    const r = await git(worktree, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir']);
    const [gitDir, common] = r.code === 0 ? r.out.split('\n') : [];
    return { mode: 'sandbox', readOnly: common ? [common] : [], readWrite: gitDir ? [gitDir] : [] };
  }

  private sandboxSpec(iso: Isolation, worktree: string, network = false): SandboxSpec | undefined | null {
    if (iso.mode === 'unavailable') return null;
    if (iso.mode === 'unsandboxed') return undefined;
    return { root: worktree, writable: true, network, readOnly: iso.readOnly, readWrite: iso.readWrite, limits: { cpuSeconds: 1800, fileSizeBytes: 1024 ** 3, openFiles: 4096 } };
  }

  /* ---------------- workspaces ---------------- */

  async registerWorkspace(dir: string): Promise<Workspace> {
    const info = await inspectRepo(dir);
    const existing = this.repo.workspaceByRoot(info.root);
    const now = nowIso();
    return this.repo.upsertWorkspace({ id: existing?.id ?? newId('ws'), name: info.name, root: info.root, isGit: info.isGit, branch: info.branch, head: info.head, dirty: info.dirty, createdAt: existing?.createdAt ?? now, updatedAt: now });
  }

  async refreshWorkspace(id: string): Promise<Workspace> {
    const w = this.repo.workspace(id);
    if (!w) throw new AtlasError('invalid_request', 'Unknown workspace');
    return this.registerWorkspace(w.root);
  }

  /** Preflight warnings shown before a mission starts (manual §34). */
  async preflight(workspaceId: string, runtime?: RuntimeKind): Promise<{ level: 'block' | 'warn' | 'info'; message: string }[]> {
    const w = await this.refreshWorkspace(workspaceId);
    const out: { level: 'block' | 'warn' | 'info'; message: string }[] = [];
    if (!w.isGit) out.push({ level: 'block', message: 'Not a git repository. ATLAS needs git to create isolated worktrees.' });
    else if (!w.head) out.push({ level: 'block', message: 'The repository has no commits yet. Commit once so ATLAS has a base to branch from.' });
    if (w.dirty) out.push({ level: 'warn', message: `${w.dirty} uncommitted change${w.dirty === 1 ? '' : 's'} in your checkout will not be visible to agents: worktrees start from HEAD ${w.head?.slice(0, 7)}.` });
    if (w.isGit && !detectRecipes(w.root).some((r) => r.name === 'tests')) out.push({ level: 'warn', message: 'No test command detected. Results will be reported as unverified.' });
    const sb = detectSandbox();
    if (sb.kind === 'none') {
      if (this.repo.setting('execution.allowUnsandboxed', false)) out.push({ level: 'warn', message: `No OS sandbox (${sb.detail}). You allowed unsandboxed execution: repository scripts will run as your user.` });
      else out.push({ level: 'block', message: `No OS sandbox: ${sb.detail} Agent commands and checks will not run until one is available, or until you allow unsandboxed execution in Settings.` });
    }
    out.push({ level: 'info', message: 'No deployment target is configured. Staging deploys arrive in a later milestone.' });
    if (runtime) {
      const rt = this.o.runtimes[runtime];
      if (!rt) out.push({ level: 'block', message: `Runtime "${runtime}" is not available in this build.` });
      else { const h = await rt.health(); if (!h.ok) out.push({ level: 'block', message: h.detail }); }
    }
    return out;
  }

  /* ---------------- mission lifecycle ---------------- */

  createMission(input: { workspaceId: string; title: string; goal: string; constraints: string; approvalMode: ApprovalMode; runtime: RuntimeKind }): Mission {
    const w = this.repo.workspace(input.workspaceId);
    if (!w) throw new AtlasError('invalid_request', 'Unknown workspace');
    const now = nowIso();
    const m: Mission = { id: newId('msn'), ...input, baseCommit: null, state: 'draft', planVersion: 0, policyId: 'default@1', outcome: null, decision: null, createdAt: now, updatedAt: now };
    this.repo.insertMission(m);
    this.emit({ missionId: m.id, type: 'mission.created', actor: OPERATOR, payload: { title: m.title, goal: m.goal, constraints: m.constraints, approvalMode: m.approvalMode, runtime: m.runtime, workspace: w.name } });
    return m;
  }

  private setMission(m: Mission, to: MissionState, extra: Record<string, unknown> = {}) {
    assertMission(m.state, to);
    this.repo.updateMission(m.id, { state: to });
    this.emit({ missionId: m.id, type: 'mission.state', actor: SYSTEM('orchestrator'), payload: { from: m.state, to, ...extra } });
    m.state = to;
  }

  private setTask(t: Task, to: TaskState, extra: Record<string, unknown> = {}) {
    assertTask(t.state, to);
    this.repo.updateTask(t.id, { state: to });
    this.emit({ missionId: t.missionId, taskId: t.id, type: 'task.state', actor: SYSTEM('scheduler'), payload: { key: t.key, from: t.state, to, ...extra } });
    t.state = to;
  }

  private mission(id: string): Mission {
    const m = this.repo.mission(id);
    if (!m) throw new AtlasError('invalid_request', 'Unknown mission');
    return m;
  }

  /** Propose (or re-propose) a plan. The plan is validated before it can be shown for approval. */
  async plan(missionId: string, proposed?: unknown): Promise<Mission> {
    const m = this.mission(missionId);
    const w = this.repo.workspace(m.workspaceId)!;
    if (m.state === 'draft' || m.state === 'awaiting_approval') this.setMission(m, 'planning');
    else if (m.state !== 'planning') throw new AtlasError('invalid_request', `Cannot plan a mission in state ${m.state}`);
    const version = m.planVersion + 1;
    const hasTests = w.isGit && detectRecipes(w.root).some((r) => r.name === 'tests');
    const candidate = proposed ?? defaultPlan(m, version, hasTests);
    const v = validatePlan(candidate);
    if (!v.ok) {
      this.emit({ missionId, type: 'plan.rejected', actor: SYSTEM('plan-validator'), payload: { version, issues: v.issues } });
      this.setMission(m, 'failed', { reason: 'Plan failed validation' });
      this.repo.updateMission(m.id, { outcome: `Plan rejected: ${v.issues.map((i) => i.message).join('; ')}` });
      return this.mission(missionId);
    }
    const plan = { ...v.plan, version };
    this.repo.insertPlan(missionId, plan, 'proposed');
    this.repo.updateMission(m.id, { planVersion: version });
    const art = this.artifacts.put({ missionId, taskId: null, kind: 'plan', name: `Plan v${version}`, content: JSON.stringify(plan, null, 2) });
    this.emit({ missionId, type: 'plan.proposed', actor: SYSTEM('planner'), payload: { version, summary: plan.summary, tasks: plan.tasks.map((t) => ({ key: t.key, title: t.title, role: t.role, tools: t.tools, dependsOn: t.dependsOn })) }, artifactIds: [art.id] });
    this.setMission(m, 'awaiting_approval');
    return this.mission(missionId);
  }

  /** Operator approves the current plan: snapshot the base commit, materialize tasks, start scheduling. */
  async approvePlan(missionId: string): Promise<Mission> {
    const m = this.mission(missionId);
    if (m.state !== 'awaiting_approval') throw new AtlasError('invalid_request', `Mission is ${m.state}, not awaiting approval`);
    const w = await this.refreshWorkspace(m.workspaceId);
    if (!w.isGit || !w.head) throw new AtlasError('workspace_conflict', 'Workspace needs a git repository with at least one commit');
    const rt = this.o.runtimes[m.runtime];
    if (!rt) throw new AtlasError('model_unavailable', `Runtime ${m.runtime} is not available`);
    const health = await rt.health();
    if (!health.ok) throw new AtlasError('model_unavailable', health.detail);
    const p = this.repo.plan(missionId, m.planVersion)!;
    this.repo.setPlanStatus(missionId, p.plan.version, 'approved');
    this.repo.updateMission(m.id, { baseCommit: w.head });
    this.emit({ missionId, type: 'plan.approved', actor: OPERATOR, payload: { version: p.plan.version, baseCommit: w.head } });
    const byKey = new Map<string, string>();
    for (const pt of p.plan.tasks) byKey.set(pt.key, newId('tsk'));
    for (const pt of p.plan.tasks) {
      const t: Task = { id: byKey.get(pt.key)!, missionId, key: pt.key, title: pt.title, role: pt.role, dependencies: pt.dependsOn.map((d) => byKey.get(d)!), state: 'queued', retries: 0, acceptance: pt.acceptance, resultRef: null, worktree: null, branch: null };
      this.repo.insertTask(t);
      this.emit({ missionId, taskId: t.id, type: 'task.state', actor: SYSTEM('scheduler'), payload: { key: t.key, from: null, to: 'queued', title: t.title, role: t.role } });
    }
    this.setMission(m, 'running', { baseCommit: w.head });
    this.kick(missionId);
    return this.mission(missionId);
  }

  /** Start the mission loop if it is not already running in this process. */
  kick(missionId: string) {
    if (this.running.has(missionId)) return;
    const ac = this.aborts.get(missionId) ?? new AbortController();
    this.aborts.set(missionId, ac);
    const p = this.loop(missionId, ac.signal)
      .catch((e) => {
        this.emit({ missionId, type: 'error', actor: SYSTEM('orchestrator'), payload: { kind: e instanceof AtlasError ? e.kind : 'internal', message: (e as Error).message } });
        const m = this.repo.mission(missionId);
        if (m && (m.state === 'running' || m.state === 'verifying')) { this.setMission(m, 'failed', { reason: (e as Error).message }); this.repo.updateMission(missionId, { outcome: `Failed: ${(e as Error).message}` }); }
      })
      .finally(() => { this.running.delete(missionId); });
    this.running.set(missionId, p);
  }

  /** Wait for the mission loop (tests and shutdown). */
  async settle(missionId: string) { await this.running.get(missionId); }

  private async loop(missionId: string, signal: AbortSignal) {
    const inflight = new Map<string, Promise<void>>();
    for (;;) {
      if (signal.aborted) break;
      const m = this.mission(missionId);
      if (m.state !== 'running') break;
      const tasks = this.repo.tasks(missionId);
      const state = new Map(tasks.map((t) => [t.id, t.state]));
      // Dependencies: ready when all deps done; blocked forever if a dep failed or was cancelled.
      for (const t of tasks) {
        if (t.state !== 'queued' && t.state !== 'blocked') continue;
        const deps = t.dependencies.map((d) => state.get(d));
        if (deps.some((s) => s === 'failed' || s === 'cancelled')) { if (t.state === 'queued') this.setTask(t, 'blocked', { reason: 'A dependency failed' }); this.setTask(t, 'failed', { reason: 'Dependency failed' }); continue; }
        if (deps.every((s) => s === 'done')) this.setTask(t, 'ready');
        else if (t.state === 'queued') this.setTask(t, 'blocked', { waitingOn: t.dependencies.filter((d) => state.get(d) !== 'done') });
      }
      const fresh = this.repo.tasks(missionId);
      for (const t of fresh) {
        if (t.state !== 'ready' || inflight.has(t.id) || inflight.size >= this.maxConcurrent) continue;
        const p = this.runTask(m, t, signal).finally(() => inflight.delete(t.id));
        inflight.set(t.id, p);
      }
      if (fresh.every((t) => TERMINAL_TASK.has(t.state))) break;
      if (inflight.size === 0) {
        // Nothing runnable and nothing running: blocked tasks can only wait for deps that are not progressing.
        if (!fresh.some((t) => t.state === 'ready')) break;
        continue;
      }
      await Promise.race(inflight.values());
    }
    await Promise.allSettled(inflight.values());
    if (signal.aborted || this.stopping) return;
    const m = this.mission(missionId);
    if (m.state === 'running' || m.state === 'verifying') await this.verify(m);
  }

  private async runTask(m: Mission, t: Task, missionSignal: AbortSignal): Promise<void> {
    const w = this.repo.workspace(m.workspaceId)!;
    const def = role(t.role);
    const plan = this.repo.plan(m.id, m.planVersion)!.plan;
    const pt = plan.tasks.find((x) => x.key === t.key)!;
    const number = this.repo.attempts(m.id).filter((a) => a.taskId === t.id).length + 1;
    const attempt: Attempt = { id: newId('att'), taskId: t.id, missionId: m.id, number, state: 'starting', runtime: m.runtime, pid: null, startedAt: nowIso(), endedAt: null, error: null, tokens: 0 };
    // Persist start intent before any worker exists (manual §13).
    this.repo.insertAttempt(attempt);
    this.setTask(t, 'running', { attempt: number });

    const dir = path.join(this.o.worktreeDir, m.id, `${t.key}-${number}`);
    const branch = `atlas/${m.id}/${t.key}-${number}`;
    try {
      await createWorktree(w.root, dir, branch, m.baseCommit!);
    } catch (e) {
      const message = `Could not create worktree: ${(e as Error).message}`;
      this.repo.updateAttempt(attempt.id, { state: 'failed', endedAt: nowIso(), error: message });
      this.emit({ missionId: m.id, taskId: t.id, attemptId: attempt.id, type: 'attempt.ended', actor: SYSTEM('scheduler'), payload: { number, state: 'failed', errorKind: 'workspace_conflict', message } });
      this.setTask(t, 'failed', { errorKind: 'workspace_conflict', reason: message });
      return;
    }
    this.repo.updateTask(t.id, { worktree: dir, branch });
    this.emit({ missionId: m.id, taskId: t.id, attemptId: attempt.id, type: 'workspace.worktree', actor: SYSTEM('workspace'), payload: { action: 'created', path: dir, branch, base: m.baseCommit } });
    if (!this.leases.acquire(dir, attempt.id)) throw new AtlasError('workspace_conflict', `Worktree ${dir} already has a writer`);

    const ac = new AbortController();
    const onMission = () => ac.abort();
    missionSignal.addEventListener('abort', onMission, { once: true });
    this.taskAborts.set(t.id, ac);

    const rt = this.o.runtimes[m.runtime]!;
    const isolation = await this.isolationFor(dir);
    const gateCtx = {
      isolation,
      missionId: m.id, taskId: t.id, attemptId: attempt.id, role: t.role, mode: m.approvalMode, cwd: dir, permitted: pt.tools,
      approvalTtlMs: this.approvalTtlMs, awaitApproval: (a: Approval, s: AbortSignal) => this.awaitApproval(a, s),
    };
    const tools = new ToolGate(gateCtx, this.repo, this.artifacts, this.o.executors ?? realExecutors);
    const prompt = [
      `Mission: ${m.title}`, '', `Objective:\n${m.goal}`, m.constraints.trim() ? `\nConstraints:\n${m.constraints}` : '',
      `\nTask ${t.key}: ${t.title}`, `Acceptance criteria:\n${t.acceptance.map((a) => `- ${a}`).join('\n')}`,
    ].join('\n');

    this.repo.updateAttempt(attempt.id, { state: 'running' });
    this.emit({ missionId: m.id, taskId: t.id, attemptId: attempt.id, type: 'attempt.started', actor: SYSTEM('scheduler'), payload: { number, runtime: m.runtime, role: t.role, roleVersion: def.version, worktree: dir, branch, tools: pt.tools } });

    const agent = { kind: 'agent' as const, role: t.role, taskId: t.id };
    let outcome: { kind: 'completed'; summary: string } | { kind: 'error'; errorKind: string; message: string } = { kind: 'error', errorKind: 'internal', message: 'Runtime ended without a result' };
    let tokens = 0;
    let handle: Awaited<ReturnType<AgentRuntime['start']>> | null = null;
    try {
      handle = await rt.start({
        missionId: m.id, taskId: t.id, attemptId: attempt.id, workspaceId: w.id, roleId: t.role, cwd: dir, instructions: def.instructions, prompt,
        permittedTools: pt.tools, contextRefs: [], budget: def.budget, tools, signal: ac.signal,
      });
      for await (const ev of rt.stream(handle)) {
        const base = { missionId: m.id, taskId: t.id, attemptId: attempt.id, actor: agent };
        if (ev.type === 'message') this.emit({ ...base, type: 'agent.message', payload: { text: ev.text } });
        else if (ev.type === 'tool_call') this.emit({ ...base, type: 'agent.tool_call', payload: { callId: ev.callId, tool: ev.tool, args: ev.args } });
        else if (ev.type === 'tool_result') this.emit({ ...base, type: 'agent.tool_result', payload: { callId: ev.callId, tool: ev.tool, ok: ev.ok, summary: ev.summary.slice(0, 4000) } });
        else if (ev.type === 'usage') { tokens += ev.inputTokens + ev.outputTokens; this.emit({ ...base, type: 'agent.usage', payload: { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, total: tokens } }); }
        else if (ev.type === 'completed') outcome = { kind: 'completed', summary: ev.summary };
        else if (ev.type === 'error') outcome = { kind: 'error', errorKind: ev.kind, message: ev.message };
      }
    } catch (e) {
      outcome = { kind: 'error', errorKind: ac.signal.aborted ? 'cancelled' : 'internal', message: (e as Error).message };
    } finally {
      if (handle) await rt.dispose(handle).catch(() => {});
      missionSignal.removeEventListener('abort', onMission);
      this.taskAborts.delete(t.id);
      this.leases.release(dir, attempt.id);
    }
    // On shutdown the attempt is left as running; recovery records it as lost on the next start.
    if (this.stopping) return;

    const cur = this.repo.task(t.id)!;
    if (outcome.kind === 'completed') {
      // The agent's summary is recorded as a claim. Evidence comes from the checkpoint and checks.
      const transcript = this.artifacts.put({ missionId: m.id, taskId: t.id, kind: 'transcript', name: `Attempt ${number} transcript`, content: this.repo.eventsSince(m.id, 0).filter((e) => e.attemptId === attempt.id).map((e) => `${e.ts} ${e.type} ${JSON.stringify(e.payload)}`).join('\n') });
      this.emit({ missionId: m.id, taskId: t.id, attemptId: attempt.id, type: 'agent.message', actor: agent, payload: { text: outcome.summary, claim: true }, artifactIds: [transcript.id] });
      const sha = await checkpoint(dir, `ATLAS ${m.id} ${t.key} attempt ${number}`);
      let artifactIds: string[] = [];
      let files: { path: string; add: number; del: number }[] = [];
      if (sha) {
        const d = await diffSince(dir, m.baseCommit!);
        files = d.files;
        const patch = this.artifacts.put({ missionId: m.id, taskId: t.id, kind: 'patch', name: `${t.key} · ${files.length} file${files.length === 1 ? '' : 's'}`, content: d.patch });
        artifactIds = [patch.id];
        this.repo.updateTask(t.id, { resultRef: patch.id });
      }
      this.emit({ missionId: m.id, taskId: t.id, attemptId: attempt.id, type: 'workspace.worktree', actor: SYSTEM('workspace'), payload: { action: 'checkpoint', commit: sha, files }, artifactIds });
      this.repo.updateAttempt(attempt.id, { state: 'succeeded', endedAt: nowIso(), tokens });
      this.emit({ missionId: m.id, taskId: t.id, attemptId: attempt.id, type: 'attempt.ended', actor: SYSTEM('scheduler'), payload: { number, state: 'succeeded', tokens } });
      this.setTask(cur, 'done', { checkpoint: sha });
      return;
    }

    const cancelled = outcome.errorKind === 'cancelled' || ac.signal.aborted;
    this.repo.updateAttempt(attempt.id, { state: cancelled ? 'cancelled' : 'failed', endedAt: nowIso(), error: outcome.message, tokens });
    this.emit({ missionId: m.id, taskId: t.id, attemptId: attempt.id, type: 'attempt.ended', actor: SYSTEM('scheduler'), payload: { number, state: cancelled ? 'cancelled' : 'failed', errorKind: outcome.errorKind, message: outcome.message, tokens } });
    if (cancelled) { if (!TERMINAL_TASK.has(cur.state)) this.setTask(cur, 'cancelled'); return; }
    const retryable = RETRYABLE.has(outcome.errorKind as never);
    if (retryable && number < this.maxAttempts) {
      this.repo.updateTask(t.id, { retries: cur.retries + 1 });
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** number)));
      this.setTask(cur, 'ready', { retry: number + 1, reason: outcome.message });
      return;
    }
    this.setTask(cur, 'failed', { errorKind: outcome.errorKind, reason: outcome.message });
  }

  /** Independent verification on the checkpointed commit of each completed coding task. */
  private async verify(m: Mission) {
    if (m.state !== 'verifying') this.setMission(m, 'verifying');
    const tasks = this.repo.tasks(m.id);
    const failed = tasks.filter((t) => t.state !== 'done');
    const checks: CheckRecord[] = [];
    for (const t of tasks.filter((x) => x.state === 'done' && x.worktree)) {
      const head = (await run({ command: 'git', args: ['rev-parse', 'HEAD'], cwd: t.worktree!, timeoutMs: 10_000, env: sanitizedEnv() })).output.trim();
      const recipes = detectRecipes(t.worktree!);
      if (!recipes.some((r) => r.name === 'tests')) {
        const c: CheckRecord = { id: newId('chk'), missionId: m.id, name: 'tests', command: null, required: false, result: 'not_configured', exitCode: null, durationMs: null, reason: 'No test command found in package.json', artifactId: null, commit: head };
        this.repo.insertCheck(c); checks.push(c);
        this.emit({ missionId: m.id, taskId: t.id, type: 'check.result', actor: SYSTEM('verification'), payload: { ...c } });
      }
      for (const r of recipes) {
        const signal = this.aborts.get(m.id)?.signal;
        const spec = this.sandboxSpec(await this.isolationFor(t.worktree!), t.worktree!);
        const res = spec === null
          ? { exitCode: null, signal: null, durationMs: 0, output: '', truncated: false, timedOut: false, cancelled: false, pid: null, spawnError: `No OS sandbox: ${detectSandbox().detail}` }
          : await run({ command: r.command, args: r.args, cwd: t.worktree!, timeoutMs: r.timeoutMs, signal, env: sanitizedEnv(), sandbox: spec });
        const log = this.artifacts.put({ missionId: m.id, taskId: t.id, kind: 'test_report', name: `${r.name} @ ${head.slice(0, 7)}`, content: `$ ${[r.command, ...r.args].join(' ')}\n${res.output}\n[exit ${res.exitCode ?? 'none'} · ${res.durationMs} ms]` });
        const result = res.cancelled ? 'inconclusive' : res.timedOut ? 'inconclusive' : res.spawnError ? 'inconclusive' : res.exitCode === 0 ? 'pass' : 'fail';
        const c: CheckRecord = {
          id: newId('chk'), missionId: m.id, name: r.name, command: [r.command, ...r.args].join(' '), required: r.required, result, exitCode: res.exitCode, durationMs: res.durationMs,
          reason: res.spawnError ? `Could not start: ${res.spawnError}` : res.timedOut ? 'Timed out' : res.cancelled ? 'Cancelled' : `Exit code ${res.exitCode}`, artifactId: log.id, commit: head,
        };
        this.repo.insertCheck(c); checks.push(c);
        this.emit({ missionId: m.id, taskId: t.id, type: 'check.result', actor: SYSTEM('verification'), payload: { ...c }, artifactIds: [log.id] });
      }
    }
    const current = this.mission(m.id);
    if (current.state !== 'verifying') return;
    let verdict: Verdict;
    let summary: string;
    if (failed.length) {
      verdict = 'failed';
      summary = `Failed: ${failed.map((t) => `${t.key} ${t.state}`).join(', ')}`;
    } else ({ verdict, summary } = gate(checks));
    this.emit({ missionId: m.id, type: 'gate.result', actor: SYSTEM('release-gate'), payload: { verdict, summary, checks: checks.map((c) => ({ name: c.name, required: c.required, result: c.result, commit: c.commit })) } });
    this.repo.updateMission(m.id, { outcome: summary });
    this.setMission(current, verdict === 'failed' ? 'failed' : 'completed', { verdict });
  }

  /* ---------------- approvals ---------------- */

  private awaitApproval(a: Approval, signal: AbortSignal): Promise<Approval> {
    return new Promise((resolve) => {
      const done = (x: Approval) => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); this.waiters.delete(a.id); resolve(x); };
      const expire = () => {
        if (this.repo.decideApproval(a.id, 'expired', null)) this.emit({ missionId: a.missionId, taskId: a.taskId, type: 'approval.decided', actor: SYSTEM('policy'), payload: { approvalId: a.id, status: 'expired' } });
        done(this.repo.approval(a.id)!);
      };
      const timer = setTimeout(expire, Math.max(0, new Date(a.expiresAt).getTime() - Date.now()));
      const onAbort = () => expire();
      signal.addEventListener('abort', onAbort, { once: true });
      this.waiters.set(a.id, done);
    });
  }

  respondApproval(approvalId: string, decision: 'approve' | 'deny'): Approval {
    const a = this.repo.approval(approvalId);
    if (!a) throw new AtlasError('invalid_request', 'Unknown approval');
    if (new Date(a.expiresAt) <= new Date() && a.status === 'pending') {
      this.repo.decideApproval(a.id, 'expired', null);
      this.emit({ missionId: a.missionId, taskId: a.taskId, type: 'approval.decided', actor: SYSTEM('policy'), payload: { approvalId, status: 'expired' } });
      this.waiters.get(a.id)?.(this.repo.approval(a.id)!);
      throw new AtlasError('policy_deny', 'Approval expired before a decision');
    }
    const status = decision === 'approve' ? 'approved' : 'denied';
    if (!this.repo.decideApproval(a.id, status, 'operator')) throw new AtlasError('invalid_request', `Approval is already ${a.status}`);
    this.emit({ missionId: a.missionId, taskId: a.taskId, type: 'approval.decided', actor: OPERATOR, payload: { approvalId, status, tool: a.tool, action: a.action } });
    const updated = this.repo.approval(a.id)!;
    this.waiters.get(a.id)?.(updated);
    return updated;
  }

  /* ---------------- operator controls ---------------- */

  async cancelMission(missionId: string): Promise<Mission> {
    const m = this.mission(missionId);
    if (['completed', 'failed', 'cancelled'].includes(m.state)) return m;
    this.emit({ missionId, type: 'operator.action', actor: OPERATOR, payload: { action: 'cancel' } });
    this.aborts.get(missionId)?.abort();
    await this.settle(missionId);
    const cur = this.mission(missionId);
    for (const t of this.repo.tasks(missionId)) if (!TERMINAL_TASK.has(t.state)) this.setTask(t, 'cancelled');
    if (!['completed', 'failed', 'cancelled'].includes(cur.state)) {
      this.setMission(cur, 'cancelled');
      this.repo.updateMission(missionId, { outcome: 'Cancelled by operator' });
    }
    return this.mission(missionId);
  }

  async cancelTask(taskId: string): Promise<Task> {
    const t = this.repo.task(taskId);
    if (!t) throw new AtlasError('invalid_request', 'Unknown task');
    this.emit({ missionId: t.missionId, taskId, type: 'operator.action', actor: OPERATOR, payload: { action: 'cancel_task', key: t.key } });
    const ac = this.taskAborts.get(taskId);
    if (ac) ac.abort();
    else if (!TERMINAL_TASK.has(t.state)) this.setTask(t, 'cancelled');
    return this.repo.task(taskId)!;
  }

  /** Accept keeps the task branch for the operator to merge; reject removes worktrees and branches. Never touches the user checkout. */
  async decide(missionId: string, decision: 'accept' | 'reject'): Promise<Mission> {
    const m = this.mission(missionId);
    if (!['completed', 'failed'].includes(m.state)) throw new AtlasError('invalid_request', 'Only finished missions can be accepted or rejected');
    if (m.decision) throw new AtlasError('invalid_request', `Mission already ${m.decision}`);
    const w = this.repo.workspace(m.workspaceId)!;
    const kept: string[] = [];
    for (const t of this.repo.tasks(missionId)) {
      if (!t.worktree) continue;
      if (decision === 'accept' && t.state === 'done') { await removeWorktree(w.root, t.worktree, null); if (t.branch) kept.push(t.branch); }
      else await removeWorktree(w.root, t.worktree, t.branch);
    }
    // Attempts that did not produce the final result are cleaned too.
    this.repo.updateMission(missionId, { decision: decision === 'accept' ? 'accepted' : 'rejected' });
    this.emit({ missionId, type: 'mission.decision', actor: OPERATOR, payload: { decision, branches: kept, note: decision === 'accept' ? `Changes kept on ${kept.join(', ') || '(no branch)'}; merge them when ready.` : 'Worktrees and branches removed. Your checkout was not modified.' } });
    return this.mission(missionId);
  }

  /* ---------------- recovery (manual §40) ---------------- */

  /** Reconcile state after a daemon restart. Lost attempts are recorded; work restarts as new attempts in fresh worktrees. */
  async recover(): Promise<{ missions: string[]; lostAttempts: number; expiredApprovals: number }> {
    let lostAttempts = 0;
    let expiredApprovals = 0;
    for (const a of this.repo.pendingApprovals()) {
      if (this.repo.decideApproval(a.id, 'expired', null)) {
        expiredApprovals++;
        this.emit({ missionId: a.missionId, taskId: a.taskId, type: 'approval.decided', actor: SYSTEM('recovery'), payload: { approvalId: a.id, status: 'expired', reason: 'Daemon restarted while waiting' } });
      }
    }
    for (const a of this.repo.attemptsInState(['starting', 'running'])) {
      lostAttempts++;
      this.repo.updateAttempt(a.id, { state: 'lost', endedAt: nowIso(), error: 'Daemon restarted during the attempt' });
      this.emit({ missionId: a.missionId, taskId: a.taskId, attemptId: a.id, type: 'attempt.ended', actor: SYSTEM('recovery'), payload: { number: a.number, state: 'lost' } });
      const t = this.repo.task(a.taskId);
      if (t && t.state === 'running') {
        if (a.number < this.maxAttempts) this.setTask(t, 'ready', { reason: 'Restarting in a fresh worktree after daemon restart' });
        else this.setTask(t, 'failed', { reason: 'Attempt lost and no retries left' });
      }
    }
    const missions: string[] = [];
    for (const m of this.repo.missionsInState(['planning', 'running', 'verifying'])) {
      missions.push(m.id);
      this.emit({ missionId: m.id, type: 'daemon.recovered', actor: SYSTEM('recovery'), payload: { state: m.state } });
      if (m.state === 'planning') await this.plan(m.id);
      else this.kick(m.id); // running: reschedule; verifying: checks are read-only and re-run on the same commit
    }
    return { missions, lostAttempts, expiredApprovals };
  }

  /** Abort everything (daemon shutdown). */
  async shutdown() {
    this.stopping = true;
    for (const ac of this.aborts.values()) ac.abort();
    await Promise.allSettled(this.running.values());
  }
}
