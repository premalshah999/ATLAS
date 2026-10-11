// The renderer-facing API (manual E4). Each method is an intent with a validated request schema.
// Preload exposes exactly these methods; main validates sender + payload; the daemon authorizes and acts.
import { z } from 'zod';
import { ApprovalMode, Id, MissionBudget, RuntimeKind } from './domain';
import { DesktopAction, DesktopControl } from './desktop';

const empty = z.object({}).strict();
const missionRef = z.object({ missionId: Id }).strict();

export const Requests = {
  'app.info': empty,
  'workspace.open': empty,
  'workspace.list': empty,
  'workspace.refresh': z.object({ workspaceId: Id }).strict(),
  'workspace.preflight': z.object({ workspaceId: Id, runtime: RuntimeKind.optional() }).strict(),
  'mission.create': z.object({
    workspaceId: Id,
    title: z.string().trim().min(1).max(160),
    goal: z.string().trim().min(1).max(8000),
    constraints: z.string().max(4000).default(''),
    approvalMode: ApprovalMode,
    runtime: RuntimeKind,
    budget: MissionBudget.partial().optional(),
    targetEnvironment: z.string().min(1).max(100).nullable().optional(),
  }).strict(),
  'mission.list': z.object({ workspaceId: Id.optional() }).strict(),
  'mission.get': missionRef,
  'mission.plan': missionRef,
  'mission.approvePlan': missionRef,
  'mission.cancel': missionRef,
  'mission.decide': z.object({ missionId: Id, decision: z.enum(['accept', 'reject']) }).strict(),
  'task.cancel': z.object({ taskId: Id }).strict(),
  'mission.export': missionRef,
  'mission.import': empty,
  'mission.delete': missionRef,
  'mission.reverify': missionRef,
  'mission.restore': missionRef,
  'mission.publish': z.object({ missionId: Id, base: z.string().regex(/^[A-Za-z0-9._/-]{1,200}$/).optional() }).strict(),
  'mission.forge': missionRef,
  'mission.ciRefresh': missionRef,
  'mission.fixCi': missionRef,
  'mission.approveDefinition': z.object({ missionId: Id, hash: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
  'finding.update': z.object({ findingId: Id, status: z.enum(['open', 'accepted', 'dismissed', 'fixed']) }).strict(),
  'workspace.facts.get': z.object({ workspaceId: Id }).strict(),
  'workspace.facts.set': z.object({ workspaceId: Id, text: z.string().max(20_000) }).strict(),
  'workspace.acceptance.get': z.object({ workspaceId: Id }).strict(),
  'workspace.acceptance.set': z.object({ workspaceId: Id, command: z.string().min(1).max(100), args: z.array(z.string().max(1000)).max(100), files: z.record(z.string().max(300), z.string().max(2_000_000)) }).strict(),
  'workspace.acceptance.remove': z.object({ workspaceId: Id }).strict(),
  'skills.list': z.object({ workspaceId: Id.optional() }).strict(),
  'skills.read': z.object({ name: z.string().max(64), source: z.enum(['trusted', 'repository']), workspaceId: Id.optional(), path: z.string().max(300).optional() }).strict(),
  'skills.import': z.object({ workspaceId: Id, name: z.string().max(64), hash: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
  'skills.remove': z.object({ name: z.string().max(64) }).strict(),
  'export.keys': empty,
  'export.trust': z.object({ keyId: z.string().regex(/^[0-9a-f]{32}$/) }).strict(),
  'export.untrust': z.object({ keyId: z.string().regex(/^[0-9a-f]{32}$/) }).strict(),
  'terminal.open': z.object({ missionId: Id, target: z.union([Id, z.literal('integration')]), cols: z.number().int().min(20).max(400), rows: z.number().int().min(5).max(200) }).strict(),
  'terminal.input': z.object({ sessionId: Id, data: z.string().max(65_536) }).strict(),
  'terminal.close': z.object({ sessionId: Id }).strict(),
  'terminal.list': missionRef,
  'terminal.attach': z.object({ sessionId: Id }).strict(),
  'terminal.resize': z.object({ sessionId: Id, cols: z.number().int().min(20).max(400), rows: z.number().int().min(5).max(200) }).strict(),
  'deployment.list': z.object({ target: z.string().max(100).optional() }).strict(),
  'deployment.rollback': z.object({ deploymentId: Id }).strict(),
  'deploy.targets': z.object({ workspaceId: Id }).strict(),
  'deploy.secrets.list': empty,
  'deploy.secrets.set': z.object({ target: z.string().min(1).max(100), name: z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/), value: z.string().min(1).max(10_000) }).strict(),
  'deploy.secrets.remove': z.object({ target: z.string().min(1).max(100), name: z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/) }).strict(),
  'roles.list': empty,
  'desktop.list': empty,
  'desktop.control': z.object({ sessionId: Id, op: DesktopControl }).strict(),
  'desktop.input': z.object({ sessionId: Id, input: DesktopAction }).strict(),
  'desktop.frame': z.object({ sessionId: Id }).strict(),
  'approval.respond': z.object({ approvalId: Id, decision: z.enum(['approve', 'deny']) }).strict(),
  'events.since': z.object({ missionId: Id, afterSeq: z.number().int().min(0) }).strict(),
  'artifact.read': z.object({ artifactId: Id }).strict(),
  'runtime.health': empty,
  'settings.get': empty,
  'settings.set': z.discriminatedUnion('key', [
    z.object({ key: z.literal('execution.allowUnsandboxed'), value: z.boolean() }).strict(),
    z.object({ key: z.literal('retention.days'), value: z.number().int().min(0).max(3650) }).strict(),
    z.object({ key: z.literal('deploy.allowedTargets'), value: z.array(z.string().min(1).max(100)).max(50) }).strict(),
    z.object({ key: z.literal('deploy.autoRollback'), value: z.boolean() }).strict(),
    z.object({ key: z.literal('desktop.enabled'), value: z.boolean() }).strict(),
  ]),
  'credentials.list': empty,
  'credentials.set': z.object({ provider: z.enum(['anthropic', 'openai', 'google', 'github']), key: z.string().trim().min(8).max(500) }).strict(),
  'credentials.remove': z.object({ provider: z.enum(['anthropic', 'openai', 'google', 'github']) }).strict(),
} as const;

/** Methods only the main process may send to the daemon (never exposed to the renderer). */
export const InternalRequests = {
  'workspace.register': z.object({ path: z.string().min(1).max(4096) }).strict(),
  'mission.exportTo': z.object({ missionId: Id, path: z.string().min(1).max(4096) }).strict(),
  'mission.importFrom': z.object({ path: z.string().min(1).max(4096) }).strict(),
  'credentials.apply': z.object({ keys: z.record(z.string(), z.string()), deploySecrets: z.record(z.string(), z.record(z.string(), z.string())).optional() }).strict(),
} as const;
export type InternalMethod = keyof typeof InternalRequests;

export const PROVIDER_ENV: Record<string, string> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GEMINI_API_KEY' };
/** Service tokens stored like provider keys but never given to a model runtime (ADR 0015). */
export const SERVICE_ENV: Record<string, string> = { github: 'ATLAS_GITHUB_TOKEN' };

/** Messages between Electron main and the daemon process. */
export type DaemonInbound = { kind: 'req'; id: number; method: string; params: unknown };
export type DaemonOutbound =
  | { kind: 'res'; id: number; ok: true; data: unknown }
  | { kind: 'res'; id: number; ok: false; error: { kind: string; message: string } }
  | { kind: 'event'; event: import('./events').AtlasEvent }
  | { kind: 'terminal'; sessionId: string; data?: string; seq?: number; exit?: number | null }
  | { kind: 'ready'; pid: number; recovered: { missions: string[]; lostAttempts: number; expiredApprovals: number } };

export type Method = keyof typeof Requests;
export const METHODS = Object.keys(Requests) as Method[];
export type RequestOf<M extends Method> = z.input<(typeof Requests)[M]>;

export const IPC = {
  /** Single invoke channel; the method name is validated against METHODS. */
  invoke: 'atlas:invoke',
  /** Ordered daemon events pushed to the renderer. */
  event: 'atlas:event',
  /** Daemon connection status pushed to the renderer. */
  status: 'atlas:status',
  /** Operator terminal output pushed to the renderer. */
  terminal: 'atlas:terminal',
} as const;

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: { kind: string; message: string } };

export function parseRequest<M extends Method>(method: string, payload: unknown): { method: M; params: z.output<(typeof Requests)[M]> } {
  if (!(METHODS as string[]).includes(method)) throw new Error(`Undeclared method: ${String(method).slice(0, 60)}`);
  const schema = Requests[method as M];
  const params = schema.parse(payload ?? {});
  return { method: method as M, params: params as z.output<(typeof Requests)[M]> };
}
