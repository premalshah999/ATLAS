// Typed persistence for the domain model. State-machine rules live in @atlas/orchestrator; this layer only stores.
import { nowIso, redactDeep, type Approval, type Attempt, type AtlasEvent, type CheckRecord, type Mission, type NewEvent, type Plan, type Task, type Workspace } from '@atlas/contracts';
import { tx, type Db } from './db';

type Row = Record<string, any>;
const j = (v: unknown) => JSON.stringify(v);
const p = <T>(v: string): T => JSON.parse(v) as T;

export class Repo {
  private listeners = new Set<(e: AtlasEvent) => void>();
  constructor(readonly db: Db) {}

  /* ---------- events: append-only, monotonic per mission ---------- */
  onEvent(fn: (e: AtlasEvent) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  append(e: NewEvent): AtlasEvent {
    const ev = tx(this.db, () => {
      const r = this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM events WHERE mission_id = ?').get(e.missionId) as { s: number };
      const full: AtlasEvent = { ...e, seq: r.s + 1, ts: e.ts ?? nowIso(), payload: redactDeep(e.payload) };
      this.db.prepare('INSERT INTO events (mission_id, seq, type, ts, actor, task_id, attempt_id, payload, artifact_ids) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(full.missionId, full.seq, full.type, full.ts, j(full.actor), full.taskId, full.attemptId, j(full.payload), j(full.artifactIds));
      return full;
    });
    for (const l of this.listeners) { try { l(ev); } catch { /* a listener never breaks the log */ } }
    return ev;
  }

  eventsSince(missionId: string, afterSeq: number, limit = 2000): AtlasEvent[] {
    return (this.db.prepare('SELECT * FROM events WHERE mission_id = ? AND seq > ? ORDER BY seq LIMIT ?').all(missionId, afterSeq, limit) as Row[]).map((r) => ({
      missionId: r.mission_id, seq: r.seq, type: r.type, ts: r.ts, actor: p(r.actor), taskId: r.task_id, attemptId: r.attempt_id, payload: p(r.payload), artifactIds: p(r.artifact_ids),
    }));
  }

  /* ---------- settings (operator preferences, never secrets) ---------- */
  setting<T>(key: string, fallback: T): T {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return r ? (JSON.parse(r.value) as T) : fallback;
  }
  setSetting(key: string, value: unknown) {
    this.db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').run(key, JSON.stringify(value), nowIso());
  }
  settings(): Record<string, unknown> {
    return Object.fromEntries((this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]).map((r) => [r.key, JSON.parse(r.value)]));
  }

  /* ---------- workspaces ---------- */
  upsertWorkspace(w: Workspace): Workspace {
    this.db.prepare(`INSERT INTO workspaces (id, name, root, is_git, branch, head, dirty, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(root) DO UPDATE SET name=excluded.name, is_git=excluded.is_git, branch=excluded.branch, head=excluded.head, dirty=excluded.dirty, updated_at=excluded.updated_at`)
      .run(w.id, w.name, w.root, w.isGit ? 1 : 0, w.branch, w.head, w.dirty, w.createdAt, w.updatedAt);
    return this.workspaceByRoot(w.root)!;
  }
  workspace(id: string): Workspace | null { const r = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Row | undefined; return r ? toWorkspace(r) : null; }
  workspaceByRoot(root: string): Workspace | null { const r = this.db.prepare('SELECT * FROM workspaces WHERE root = ?').get(root) as Row | undefined; return r ? toWorkspace(r) : null; }
  workspaces(): Workspace[] { return (this.db.prepare('SELECT * FROM workspaces ORDER BY updated_at DESC').all() as Row[]).map(toWorkspace); }

  /* ---------- missions ---------- */
  insertMission(m: Mission) {
    this.db.prepare(`INSERT INTO missions (id, workspace_id, title, goal, constraints, approval_mode, runtime, base_commit, state, plan_version, policy_id, outcome, decision, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(m.id, m.workspaceId, m.title, m.goal, m.constraints, m.approvalMode, m.runtime, m.baseCommit, m.state, m.planVersion, m.policyId, m.outcome, m.decision, m.createdAt, m.updatedAt);
  }
  updateMission(id: string, patch: Partial<Pick<Mission, 'state' | 'planVersion' | 'baseCommit' | 'outcome' | 'decision'>>) {
    const cols: Record<string, string> = { state: 'state', planVersion: 'plan_version', baseCommit: 'base_commit', outcome: 'outcome', decision: 'decision' };
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (!keys.length) return;
    const sql = `UPDATE missions SET ${keys.map((k) => `${cols[k]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`;
    this.db.prepare(sql).run(...keys.map((k) => patch[k] as any), nowIso(), id);
  }
  mission(id: string): Mission | null { const r = this.db.prepare('SELECT * FROM missions WHERE id = ?').get(id) as Row | undefined; return r ? toMission(r) : null; }
  missions(workspaceId?: string): Mission[] {
    const rows = workspaceId ? this.db.prepare('SELECT * FROM missions WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId) : this.db.prepare('SELECT * FROM missions ORDER BY updated_at DESC').all();
    return (rows as Row[]).map(toMission);
  }
  missionsInState(states: string[]): Mission[] {
    return (this.db.prepare(`SELECT * FROM missions WHERE state IN (${states.map(() => '?').join(',')})`).all(...states) as Row[]).map(toMission);
  }

  /* ---------- plans: revisions are kept, never overwritten ---------- */
  insertPlan(missionId: string, plan: Plan, status: 'proposed' | 'approved' | 'rejected') {
    this.db.prepare('INSERT INTO plans (mission_id, version, body, status, created_at) VALUES (?,?,?,?,?)').run(missionId, plan.version, j(plan), status, nowIso());
  }
  setPlanStatus(missionId: string, version: number, status: 'approved' | 'rejected') {
    this.db.prepare('UPDATE plans SET status = ? WHERE mission_id = ? AND version = ?').run(status, missionId, version);
  }
  plan(missionId: string, version?: number): { plan: Plan; status: string } | null {
    const r = (version
      ? this.db.prepare('SELECT * FROM plans WHERE mission_id = ? AND version = ?').get(missionId, version)
      : this.db.prepare('SELECT * FROM plans WHERE mission_id = ? ORDER BY version DESC LIMIT 1').get(missionId)) as Row | undefined;
    return r ? { plan: p<Plan>(r.body), status: r.status } : null;
  }

  /* ---------- tasks & attempts ---------- */
  insertTask(t: Task) {
    this.db.prepare('INSERT INTO tasks (id, mission_id, key, title, role, dependencies, state, retries, acceptance, result_ref, worktree, branch) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(t.id, t.missionId, t.key, t.title, t.role, j(t.dependencies), t.state, t.retries, j(t.acceptance), t.resultRef, t.worktree, t.branch);
  }
  updateTask(id: string, patch: Partial<Pick<Task, 'state' | 'retries' | 'resultRef' | 'worktree' | 'branch'>>) {
    const cols: Record<string, string> = { state: 'state', retries: 'retries', resultRef: 'result_ref', worktree: 'worktree', branch: 'branch' };
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (!keys.length) return;
    this.db.prepare(`UPDATE tasks SET ${keys.map((k) => `${cols[k]} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => patch[k] as any), id);
  }
  task(id: string): Task | null { const r = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row | undefined; return r ? toTask(r) : null; }
  tasks(missionId: string): Task[] { return (this.db.prepare('SELECT * FROM tasks WHERE mission_id = ? ORDER BY rowid').all(missionId) as Row[]).map(toTask); }

  insertAttempt(a: Attempt) {
    this.db.prepare('INSERT INTO attempts (id, task_id, mission_id, number, state, runtime, pid, started_at, ended_at, error, tokens) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(a.id, a.taskId, a.missionId, a.number, a.state, a.runtime, a.pid, a.startedAt, a.endedAt, a.error, a.tokens);
  }
  updateAttempt(id: string, patch: Partial<Pick<Attempt, 'state' | 'pid' | 'endedAt' | 'error' | 'tokens'>>) {
    const cols: Record<string, string> = { state: 'state', pid: 'pid', endedAt: 'ended_at', error: 'error', tokens: 'tokens' };
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (!keys.length) return;
    this.db.prepare(`UPDATE attempts SET ${keys.map((k) => `${cols[k]} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => patch[k] as any), id);
  }
  attempts(missionId: string): Attempt[] { return (this.db.prepare('SELECT * FROM attempts WHERE mission_id = ? ORDER BY started_at').all(missionId) as Row[]).map(toAttempt); }
  attemptsInState(states: string[]): Attempt[] {
    return (this.db.prepare(`SELECT * FROM attempts WHERE state IN (${states.map(() => '?').join(',')})`).all(...states) as Row[]).map(toAttempt);
  }

  /* ---------- approvals ---------- */
  insertApproval(a: Approval) {
    this.db.prepare(`INSERT INTO approvals (id, mission_id, task_id, agent_role, tool, capability, action, environment, resources, reason, risk, scope, status, requested_at, expires_at, decided_at, decided_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(a.id, a.missionId, a.taskId, a.agentRole, a.tool, a.capability, a.action, a.environment, j(a.resources), a.reason, a.risk, a.scope, a.status, a.requestedAt, a.expiresAt, a.decidedAt, a.decidedBy);
  }
  /** Decide a pending approval exactly once. Returns false if it was no longer pending. */
  decideApproval(id: string, status: 'approved' | 'denied' | 'expired', by: string | null): boolean {
    const r = this.db.prepare("UPDATE approvals SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = 'pending'").run(status, nowIso(), by, id);
    return Number(r.changes) === 1;
  }
  approval(id: string): Approval | null { const r = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Row | undefined; return r ? toApproval(r) : null; }
  approvals(missionId: string): Approval[] { return (this.db.prepare('SELECT * FROM approvals WHERE mission_id = ? ORDER BY requested_at').all(missionId) as Row[]).map(toApproval); }
  pendingApprovals(): Approval[] { return (this.db.prepare("SELECT * FROM approvals WHERE status = 'pending'").all() as Row[]).map(toApproval); }

  /* ---------- checks ---------- */
  insertCheck(c: CheckRecord) {
    this.db.prepare('INSERT INTO checks (id, mission_id, name, command, required, result, exit_code, duration_ms, reason, artifact_id, commit_sha) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(c.id, c.missionId, c.name, c.command, c.required ? 1 : 0, c.result, c.exitCode, c.durationMs, c.reason, c.artifactId, c.commit);
  }
  checks(missionId: string): CheckRecord[] {
    return (this.db.prepare('SELECT * FROM checks WHERE mission_id = ? ORDER BY rowid').all(missionId) as Row[]).map((r) => ({
      id: r.id, missionId: r.mission_id, name: r.name, command: r.command, required: !!r.required, result: r.result, exitCode: r.exit_code, durationMs: r.duration_ms, reason: r.reason, artifactId: r.artifact_id, commit: r.commit_sha,
    }));
  }
}

const toWorkspace = (r: Row): Workspace => ({ id: r.id, name: r.name, root: r.root, isGit: !!r.is_git, branch: r.branch, head: r.head, dirty: r.dirty, createdAt: r.created_at, updatedAt: r.updated_at });
const toMission = (r: Row): Mission => ({
  id: r.id, workspaceId: r.workspace_id, title: r.title, goal: r.goal, constraints: r.constraints, approvalMode: r.approval_mode, runtime: r.runtime, baseCommit: r.base_commit,
  state: r.state, planVersion: r.plan_version, policyId: r.policy_id, outcome: r.outcome, decision: r.decision, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toTask = (r: Row): Task => ({ id: r.id, missionId: r.mission_id, key: r.key, title: r.title, role: r.role, dependencies: p(r.dependencies), state: r.state, retries: r.retries, acceptance: p(r.acceptance), resultRef: r.result_ref, worktree: r.worktree, branch: r.branch });
const toAttempt = (r: Row): Attempt => ({ id: r.id, taskId: r.task_id, missionId: r.mission_id, number: r.number, state: r.state, runtime: r.runtime, pid: r.pid, startedAt: r.started_at, endedAt: r.ended_at, error: r.error, tokens: r.tokens });
const toApproval = (r: Row): Approval => ({
  id: r.id, missionId: r.mission_id, taskId: r.task_id, agentRole: r.agent_role, tool: r.tool, capability: r.capability, action: r.action, environment: r.environment, resources: p(r.resources),
  reason: r.reason, risk: r.risk, scope: r.scope, status: r.status, requestedAt: r.requested_at, expiresAt: r.expires_at, decidedAt: r.decided_at, decidedBy: r.decided_by,
});
