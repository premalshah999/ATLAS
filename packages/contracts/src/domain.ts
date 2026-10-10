// ATLAS domain model (manual §11–12). These are product contracts: no SDK types appear here.
import { z } from 'zod';

export const Id = z.string().regex(/^[a-z]+_[A-Za-z0-9]{6,32}$/, 'malformed id');
export type Id = z.infer<typeof Id>;

export const MissionState = z.enum(['draft', 'planning', 'awaiting_approval', 'running', 'verifying', 'completed', 'failed', 'cancelled']);
export type MissionState = z.infer<typeof MissionState>;

export const TaskState = z.enum(['queued', 'blocked', 'ready', 'running', 'reviewing', 'done', 'failed', 'cancelled']);
export type TaskState = z.infer<typeof TaskState>;

export const AttemptState = z.enum(['starting', 'running', 'succeeded', 'failed', 'cancelled', 'lost']);
export type AttemptState = z.infer<typeof AttemptState>;

export const ApprovalMode = z.enum(['ask_risky', 'ask_all_writes', 'plan_only']);
export type ApprovalMode = z.infer<typeof ApprovalMode>;

export const RuntimeKind = z.enum(['fake', 'pi']);
export type RuntimeKind = z.infer<typeof RuntimeKind>;

export const AgentRole = z.enum(['orchestrator', 'coder', 'reviewer', 'tester', 'browser_qa', 'desktop_operator', 'deployment_verifier']);
export type AgentRole = z.infer<typeof AgentRole>;

export interface Workspace {
  id: string;
  name: string;
  root: string;
  isGit: boolean;
  branch: string | null;
  head: string | null;
  dirty: number;
  createdAt: string;
  updatedAt: string;
}

export interface Mission {
  id: string;
  workspaceId: string;
  title: string;
  goal: string;
  constraints: string;
  approvalMode: ApprovalMode;
  runtime: RuntimeKind;
  baseCommit: string | null;
  state: MissionState;
  planVersion: number;
  policyId: string;
  /** Final outcome in words, computed by the release gate — never a model summary. */
  outcome: string | null;
  decision: 'accepted' | 'rejected' | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  missionId: string;
  key: string;
  title: string;
  role: AgentRole;
  dependencies: string[];
  state: TaskState;
  retries: number;
  acceptance: string[];
  resultRef: string | null;
  worktree: string | null;
  branch: string | null;
}

export interface Attempt {
  id: string;
  taskId: string;
  missionId: string;
  number: number;
  state: AttemptState;
  runtime: RuntimeKind;
  pid: number | null;
  startedAt: string;
  endedAt: string | null;
  error: string | null;
  tokens: number;
}

export const ArtifactKind = z.enum(['log', 'patch', 'transcript', 'test_report', 'plan', 'evidence', 'screenshot']);
export type ArtifactKind = z.infer<typeof ArtifactKind>;

export interface Artifact {
  id: string;
  missionId: string;
  taskId: string | null;
  kind: ArtifactKind;
  name: string;
  size: number;
  sha256: string;
  createdAt: string;
}

export const ApprovalStatus = z.enum(['pending', 'approved', 'denied', 'expired']);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export interface Approval {
  id: string;
  missionId: string;
  taskId: string | null;
  agentRole: AgentRole;
  tool: string;
  capability: string;
  /** Exact command, path or target, already redacted. */
  action: string;
  environment: string;
  resources: string[];
  reason: string;
  risk: 'low' | 'elevated' | 'high';
  scope: 'once';
  status: ApprovalStatus;
  requestedAt: string;
  expiresAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export const CheckResult = z.enum(['pass', 'fail', 'skipped', 'inconclusive', 'not_configured']);
export type CheckResult = z.infer<typeof CheckResult>;

export interface CheckRecord {
  id: string;
  missionId: string;
  name: string;
  command: string | null;
  required: boolean;
  result: CheckResult;
  exitCode: number | null;
  durationMs: number | null;
  reason: string;
  artifactId: string | null;
  commit: string | null;
}

/** Plan as proposed by a planner; validated before it can be approved (§14). */
export const PlanTask = z.object({
  key: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
  title: z.string().min(1).max(200),
  role: AgentRole,
  dependsOn: z.array(z.string()).default([]),
  acceptance: z.array(z.string().min(1)).min(1),
  tools: z.array(z.string()).min(1),
  risk: z.enum(['low', 'elevated', 'high']),
  rollback: z.string().optional(),
});
export type PlanTask = z.infer<typeof PlanTask>;

export const Plan = z.object({
  version: z.number().int().positive(),
  summary: z.string(),
  scope: z.string().min(1),
  tasks: z.array(PlanTask).min(1),
  verification: z.array(z.object({ name: z.string(), required: z.boolean() })),
});
export type Plan = z.infer<typeof Plan>;
