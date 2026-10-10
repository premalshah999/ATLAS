// The renderer-facing API (manual E4). Each method is an intent with a validated request schema.
// Preload exposes exactly these methods; main validates sender + payload; the daemon authorizes and acts.
import { z } from 'zod';
import { ApprovalMode, Id, RuntimeKind } from './domain';

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
  }).strict(),
  'mission.list': z.object({ workspaceId: Id.optional() }).strict(),
  'mission.get': missionRef,
  'mission.plan': missionRef,
  'mission.approvePlan': missionRef,
  'mission.cancel': missionRef,
  'mission.decide': z.object({ missionId: Id, decision: z.enum(['accept', 'reject']) }).strict(),
  'task.cancel': z.object({ taskId: Id }).strict(),
  'approval.respond': z.object({ approvalId: Id, decision: z.enum(['approve', 'deny']) }).strict(),
  'events.since': z.object({ missionId: Id, afterSeq: z.number().int().min(0) }).strict(),
  'artifact.read': z.object({ artifactId: Id }).strict(),
  'runtime.health': empty,
  'settings.get': empty,
  'settings.set': z.discriminatedUnion('key', [
    z.object({ key: z.literal('execution.allowUnsandboxed'), value: z.boolean() }).strict(),
  ]),
  'credentials.list': empty,
  'credentials.set': z.object({ provider: z.enum(['anthropic', 'openai', 'google']), key: z.string().trim().min(8).max(500) }).strict(),
  'credentials.remove': z.object({ provider: z.enum(['anthropic', 'openai', 'google']) }).strict(),
} as const;

/** Methods only the main process may send to the daemon (never exposed to the renderer). */
export const InternalRequests = {
  'workspace.register': z.object({ path: z.string().min(1).max(4096) }).strict(),
  'credentials.apply': z.object({ keys: z.record(z.string(), z.string()) }).strict(),
} as const;
export type InternalMethod = keyof typeof InternalRequests;

export const PROVIDER_ENV: Record<string, string> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GEMINI_API_KEY' };

/** Messages between Electron main and the daemon process. */
export type DaemonInbound = { kind: 'req'; id: number; method: string; params: unknown };
export type DaemonOutbound =
  | { kind: 'res'; id: number; ok: true; data: unknown }
  | { kind: 'res'; id: number; ok: false; error: { kind: string; message: string } }
  | { kind: 'event'; event: import('./events').AtlasEvent }
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
} as const;

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: { kind: string; message: string } };

export function parseRequest<M extends Method>(method: string, payload: unknown): { method: M; params: z.output<(typeof Requests)[M]> } {
  if (!(METHODS as string[]).includes(method)) throw new Error(`Undeclared method: ${String(method).slice(0, 60)}`);
  const schema = Requests[method as M];
  const params = schema.parse(payload ?? {});
  return { method: method as M, params: params as z.output<(typeof Requests)[M]> };
}
