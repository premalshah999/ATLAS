// Typed client over the preload bridge. The renderer holds no authority: every call is an intent the
// main process validates and the daemon authorizes.
import type { Approval, Artifact, Attempt, AtlasEvent, CheckRecord, Method, Mission, Plan, RequestOf, RuntimeHealth, Task, Workspace } from '@atlas/contracts';

export type DaemonStatus = { state: 'starting' | 'ready' | 'restarting' | 'stopped'; pid: number | null; restarts: number; detail?: string };

interface Bridge {
  platform: string;
  invoke(method: Method, params?: unknown): Promise<unknown>;
  onEvent(fn: (e: AtlasEvent) => void): () => void;
  onStatus(fn: (s: DaemonStatus) => void): () => void;
  e2e?: { crashDaemon(): Promise<void> };
}

declare global { interface Window { atlas?: Bridge } }

export const bridge: Bridge | undefined = typeof window !== 'undefined' ? window.atlas : undefined;
export const isDesktop = !!bridge;

export interface MissionSnapshot {
  mission: Mission;
  workspace: Workspace | null;
  plan: { plan: Plan; status: string } | null;
  tasks: Task[];
  attempts: Attempt[];
  approvals: Approval[];
  checks: CheckRecord[];
  artifacts: Artifact[];
  lastSeq: number;
}

export type Preflight = { level: 'block' | 'warn' | 'info'; message: string }[];
export type MissionListItem = Mission & { tasks: { key: string; state: string }[] };
export type Credentials = { available: boolean; providers: { provider: string; stored: boolean; fromEnvironment: boolean; env: string }[] };
export type AppInfo = { version: string; schema: number; pi: { package: string; version: string; gitHead: string; license: string; repository: string }; platform: string; node: string; electron: string; chrome: string; daemon: DaemonStatus; credentialStore: boolean };

type Results = {
  'app.info': AppInfo;
  'workspace.open': Workspace | null;
  'workspace.list': Workspace[];
  'workspace.refresh': Workspace;
  'workspace.preflight': Preflight;
  'mission.create': Mission;
  'mission.list': MissionListItem[];
  'mission.get': MissionSnapshot;
  'mission.plan': Mission;
  'mission.approvePlan': Mission;
  'mission.cancel': Mission;
  'mission.decide': Mission;
  'task.cancel': Task;
  'approval.respond': Approval;
  'events.since': AtlasEvent[];
  'artifact.read': { artifact: Artifact; intact: boolean; truncated: boolean; text: string };
  'runtime.health': RuntimeHealth[];
  'credentials.list': Credentials;
  'credentials.set': Credentials;
  'credentials.remove': Credentials;
};

export function call<M extends Method>(method: M, params: RequestOf<M> = {} as RequestOf<M>): Promise<Results[M]> {
  if (!bridge) return Promise.reject(new Error('ATLAS is running outside the desktop app'));
  return bridge.invoke(method, params) as Promise<Results[M]>;
}
