// AgentRuntime contract (manual §9). Adapters convert this into SDK calls; SDK objects never leak out.
import type { AgentRole, RuntimeKind } from './domain';
import type { ToolResult } from './capabilities';

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

/** The governed tool surface handed to a runtime. Every call goes through policy before execution. */
export interface ToolInvoker {
  specs: ToolSpec[];
  invoke(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult>;
}

export interface AgentInput {
  missionId: string;
  taskId: string;
  attemptId: string;
  workspaceId: string;
  roleId: AgentRole;
  /** Absolute path of the isolated worktree the agent may operate in. */
  cwd: string;
  instructions: string;
  prompt: string;
  permittedTools: string[];
  contextRefs: string[];
  budget: { maxToolCalls: number; maxTokens: number; wallClockMs: number };
  tools: ToolInvoker;
  signal: AbortSignal;
}

export type AgentEvent =
  | { type: 'message'; text: string }
  | { type: 'tool_call'; callId: string; tool: string; args: Record<string, unknown> }
  | { type: 'tool_result'; callId: string; tool: string; ok: boolean; summary: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'completed'; summary: string }
  | { type: 'error'; kind: 'model_auth' | 'model_rate_limit' | 'model_unavailable' | 'budget_exceeded' | 'cancelled' | 'internal'; message: string };

export interface AgentHandle {
  id: string;
  runtime: RuntimeKind;
}

export interface RuntimeHealth {
  ok: boolean;
  runtime: RuntimeKind;
  version: string;
  models: string[];
  detail: string;
}

export interface AgentRuntime {
  readonly kind: RuntimeKind;
  health(): Promise<RuntimeHealth>;
  start(input: AgentInput): Promise<AgentHandle>;
  stream(handle: AgentHandle): AsyncIterable<AgentEvent>;
  interrupt(handle: AgentHandle): Promise<void>;
  resume(handle: AgentHandle, checkpoint: string): Promise<void>;
  dispose(handle: AgentHandle): Promise<void>;
}
