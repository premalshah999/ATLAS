// The control plane (manual §5, E1): storage, orchestration and runtimes in one supervised process.
// It receives already-validated intents from Electron main and re-validates them before acting.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { AtlasError, InternalRequests, parseRequest, PROVIDER_ENV, registerSecret, type AtlasEvent, type Method } from '@atlas/contracts';
import { ArtifactStore, openDb, Repo, schemaVersion, type Db } from '@atlas/storage';
import { Orchestrator, replay } from '@atlas/orchestrator';
import { FakeRuntime, sampleSlugifyScript } from '@atlas/runtime-fake';
import { PiRuntime, PI_PINNED } from '@atlas/runtime-pi';
import { detectSandbox } from '@atlas/terminal';
import { createLogger, type Logger } from './log';

export interface ServiceOptions { dataDir: string; version: string; apiKeys?: Record<string, string>; model?: string }

export class DaemonService {
  readonly repo: Repo;
  readonly artifacts: ArtifactStore;
  readonly orch: Orchestrator;
  readonly log: Logger;
  private readonly db: Db;
  private pi: PiRuntime;
  private readonly fake = new FakeRuntime([sampleSlugifyScript], 350);
  private keys: Record<string, string>;

  constructor(private readonly o: ServiceOptions) {
    mkdirSync(o.dataDir, { recursive: true });
    this.log = createLogger(path.join(o.dataDir, 'logs'));
    this.db = openDb(path.join(o.dataDir, 'atlas.db'));
    this.repo = new Repo(this.db);
    this.artifacts = new ArtifactStore(this.db, path.join(o.dataDir, 'artifacts'));
    this.keys = { ...(o.apiKeys ?? {}) };
    for (const k of Object.values(this.keys)) registerSecret(k);
    this.pi = this.makePi();
    this.orch = new Orchestrator({ repo: this.repo, artifacts: this.artifacts, runtimes: { fake: this.fake, pi: this.pi }, worktreeDir: path.join(o.dataDir, 'worktrees'), factsDir: path.join(o.dataDir, 'facts') });
  }

  private makePi() {
    return new PiRuntime({ agentDir: path.join(this.o.dataDir, 'pi'), apiKeys: this.keys, model: this.o.model });
  }

  onEvent(fn: (e: AtlasEvent) => void) { return this.repo.onEvent(fn); }
  private terminalSink: (sessionId: string, data?: string, exit?: number | null) => void = () => {};
  onTerminal(fn: (sessionId: string, data?: string, exit?: number | null) => void) { this.terminalSink = fn; }
  private retentionTimer: NodeJS.Timeout | null = null;

  async start() {
    const recovered = await this.orch.recover();
    // Retention (manual §39): purge decided missions older than the configured number of days.
    const purge = async () => {
      const days = this.repo.setting('retention.days', 0);
      const removed = await this.orch.purgeOlderThan(days).catch(() => []);
      if (removed.length) this.log.info('retention purge', { days, removed });
    };
    void purge();
    this.retentionTimer = setInterval(() => void purge(), 6 * 3600_000);
    this.retentionTimer.unref();
    this.log.info('daemon started', { schema: schemaVersion(this.db), ...recovered });
    return recovered;
  }

  async stop() {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
    await this.orch.shutdown();
    this.db.close();
  }

  /** Internal methods come only from Electron main; renderer methods are re-validated here. */
  async handle(method: string, payload: unknown): Promise<unknown> {
    if (method in InternalRequests) return this.internal(method as keyof typeof InternalRequests, payload);
    const { params } = parseRequest(method, payload);
    const p = params as any;
    switch (method as Method) {
      case 'app.info': return { version: this.o.version, schema: schemaVersion(this.db), pi: PI_PINNED, platform: process.platform, node: process.versions.node };
      case 'workspace.list': return this.repo.workspaces();
      case 'workspace.refresh': return this.orch.refreshWorkspace(p.workspaceId);
      case 'workspace.preflight': return this.orch.preflight(p.workspaceId, p.runtime);
      case 'mission.create': return this.orch.createMission(p);
      case 'mission.delete': await this.orch.deleteMission(p.missionId); this.log.info('mission deleted', { missionId: p.missionId }); return { deleted: p.missionId };
      case 'mission.reverify': return this.orch.reverify(p.missionId);
      case 'finding.update': return this.orch.updateFinding(p.findingId, p.status);
      case 'workspace.facts.get': return { text: this.orch.facts(p.workspaceId) ?? '' };
      case 'workspace.facts.set': this.orch.setFacts(p.workspaceId, p.text); return { text: p.text };
      case 'terminal.open': return this.orch.openTerminal(p.missionId, p.target, { cols: p.cols, rows: p.rows }, { onData: (id, t) => this.terminalSink(id, t), onExit: (id, c) => this.terminalSink(id, undefined, c) });
      case 'terminal.input': this.orch.terminalInput(p.sessionId, p.data); return null;
      case 'terminal.close': await this.orch.closeTerminal(p.sessionId); return null;
      case 'mission.list': return this.repo.missions(p.workspaceId).map((m) => ({ ...m, tasks: this.repo.tasks(m.id).map((t) => ({ key: t.key, state: t.state })), pendingApprovals: this.repo.approvals(m.id).filter((a) => a.status === 'pending').length }));
      case 'mission.get': return this.snapshot(p.missionId);
      case 'mission.plan': return this.orch.plan(p.missionId);
      case 'mission.approvePlan': return this.orch.approvePlan(p.missionId);
      case 'mission.cancel': return this.orch.cancelMission(p.missionId);
      case 'mission.decide': return this.orch.decide(p.missionId, p.decision);
      case 'task.cancel': return this.orch.cancelTask(p.taskId);
      case 'approval.respond': return this.orch.respondApproval(p.approvalId, p.decision);
      case 'events.since': return this.repo.eventsSince(p.missionId, p.afterSeq);
      case 'artifact.read': {
        const r = this.artifacts.read(p.artifactId);
        const max = 400_000;
        return { artifact: r.artifact, intact: r.intact, truncated: r.text.length > max, text: r.text.slice(0, max) };
      }
      case 'runtime.health': return Promise.all([this.fake.health(), this.pi.health()]);
      case 'settings.get': return { values: this.settingValues(), sandbox: detectSandbox(true) };
      case 'settings.set': {
        this.repo.setSetting(p.key, p.value);
        this.log.warn('setting changed', { key: p.key, value: p.value });
        return { values: this.settingValues(), sandbox: detectSandbox() };
      }
      default: throw new AtlasError('invalid_request', `${method} is handled by the desktop shell`);
    }
  }

  private settingValues() {
    return { 'execution.allowUnsandboxed': this.repo.setting('execution.allowUnsandboxed', false), 'retention.days': this.repo.setting('retention.days', 0) };
  }

  private async internal(method: keyof typeof InternalRequests, payload: unknown) {
    const params = InternalRequests[method].parse(payload) as any;
    if (method === 'workspace.register') return this.orch.registerWorkspace(params.path);
    if (method === 'mission.exportTo') return this.orch.exportMission(params.missionId, params.path);
    if (method === 'mission.importFrom') return this.orch.importMission(params.path);
    if (method === 'credentials.apply') {
      this.keys = {};
      for (const [provider, key] of Object.entries(params.keys as Record<string, string>)) if (PROVIDER_ENV[provider]) { this.keys[provider] = key; registerSecret(key); }
      this.pi = this.makePi();
      this.orch.setRuntime('pi', this.pi);
      return { providers: Object.keys(this.keys) };
    }
    throw new AtlasError('invalid_request', 'unknown internal method');
  }

  snapshot(missionId: string) {
    const mission = this.repo.mission(missionId);
    if (!mission) throw new AtlasError('invalid_request', 'Unknown mission');
    const events = this.repo.eventsSince(missionId, 0, 1);
    const all = this.repo.eventsSince(missionId, 0, 100_000);
    return {
      mission,
      workspace: this.repo.workspace(mission.workspaceId),
      plan: this.repo.plan(missionId),
      tasks: this.repo.tasks(missionId),
      attempts: this.repo.attempts(missionId),
      approvals: this.repo.approvals(missionId),
      checks: this.repo.checks(missionId),
      findings: this.repo.findings(missionId),
      budget: this.orch.budgetReport(missionId),
      artifacts: this.artifacts.list(missionId),
      lastSeq: all.length ? all[all.length - 1].seq : 0,
      replayed: events.length ? replay(all).mission : null,
    };
  }
}
