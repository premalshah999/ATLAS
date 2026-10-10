// Release pipeline stages (manual §28, §31–32). The orchestrator runs stages in order on the integrated
// commit; each stage reports CheckRecords. Only `pass` satisfies a required check.
import type { Approval, Artifact, ArtifactKind, CheckRecord, Deployment, Mission } from './domain';
import type { EventType } from './events';

export interface StageSandbox {
  /** Run a command in the mission's integration worktree inside the OS sandbox (or fail closed). */
  run(o: { command: string; args: string[]; timeoutMs: number; network?: boolean; signal?: AbortSignal; cwd?: string; onOutput?: (t: string) => void; detached?: boolean }): Promise<{ exitCode: number | null; output: string; durationMs: number; timedOut: boolean; cancelled: boolean; spawnError: string | null; pid: number | null }>;
  /** Start a long-running process (an app server) in the sandbox; returns a handle to stop it. */
  start(o: { command: string; args: string[]; env?: Record<string, string>; network: boolean; cwd?: string; onOutput?: (t: string) => void }): Promise<{ pid: number | null; stop(): Promise<void>; output(): string; exited(): { code: number | null } | null; spawnError: string | null }>;
  available: boolean;
  detail: string;
}

export interface StageContext {
  mission: Mission;
  worktree: string;
  commit: string;
  signal: AbortSignal;
  sandbox: StageSandbox;
  putArtifact(a: { kind: ArtifactKind; name: string; content?: string; bytes?: Uint8Array }): Artifact;
  emit(type: EventType, payload: Record<string, unknown>, artifactIds?: string[]): void;
  check(c: Omit<CheckRecord, 'id' | 'missionId' | 'commit'> & { commit?: string | null }): CheckRecord;
  /** Ask the operator; resolves with the decided approval (approved/denied/expired). */
  requestApproval(a: Pick<Approval, 'tool' | 'capability' | 'action' | 'environment' | 'resources' | 'reason' | 'risk'>): Promise<Approval>;
  setting<T>(key: string, fallback: T): T;
  /** Checks recorded so far in this release run. */
  checks?(): CheckRecord[];
  repoDeployments?(missionId: string): Deployment[];
  repoDeployment?(id: string): Deployment | null;
  markDeployment?(id: string, verified: boolean): void;
}

export interface ReleaseStage {
  name: string;
  /** Does this stage apply to the mission (e.g. a browser flow or deploy target is configured)? */
  applies(ctx: StageContext): boolean | Promise<boolean>;
  run(ctx: StageContext): Promise<void>;
}
