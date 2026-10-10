// The governed tool surface (manual §21–22). Every agent tool call: validate args → policy → (approval) → executor.
// A denied call returns before any executor is touched.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AtlasError, newId, redact, type AgentRole, type Approval, type ApprovalMode, type ToolInvoker, type ToolResult, type ToolSpec } from '@atlas/contracts';
import { evaluate, approvalUsable } from '@atlas/policy';
import { run, sanitizedEnv, type RunResult } from '@atlas/terminal';
import { git, resolveInside } from '@atlas/workspace';
import type { Repo, ArtifactStore } from '@atlas/storage';
import { detectRecipes } from './verification';

export const TOOL_SPECS: ToolSpec[] = [
  { name: 'read_file', description: 'Read a UTF-8 text file in the worktree (max 200 KB).', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Path relative to the worktree root' } }, required: ['path'], additionalProperties: false } },
  { name: 'list_files', description: 'List entries of a directory in the worktree.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Directory relative to the worktree root; "." for the root' } }, required: ['path'], additionalProperties: false } },
  { name: 'write_file', description: 'Create or overwrite a text file in the worktree.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false } },
  { name: 'shell_exec', description: 'Run one program with an argument array (no shell). Privileged commands need human approval.', parameters: { type: 'object', properties: { command: { type: 'string', description: 'Executable, e.g. "npm"' }, args: { type: 'array', items: { type: 'string' } }, timeoutSec: { type: 'number' } }, required: ['command', 'args'], additionalProperties: false } },
  { name: 'git_status', description: 'Show git status and the diff summary of the worktree.', parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'run_tests', description: "Run the project's configured test command and return its output and exit code.", parameters: { type: 'object', properties: {}, additionalProperties: false } },
];

const ARGS: Record<string, z.ZodTypeAny> = {
  read_file: z.object({ path: z.string().min(1) }).strict(),
  list_files: z.object({ path: z.string().min(1).default('.') }).strict(),
  write_file: z.object({ path: z.string().min(1), content: z.string().max(2_000_000) }).strict(),
  shell_exec: z.object({ command: z.string().min(1).max(200), args: z.array(z.string().max(4000)).max(200), timeoutSec: z.number().int().min(1).max(1800).optional() }).strict(),
  git_status: z.object({}).strict(),
  run_tests: z.object({}).strict(),
};

/** Executors are injectable so tests can prove a denied call never reaches one. */
export interface Executors {
  readFile(abs: string): string;
  listDir(abs: string): string[];
  writeFile(abs: string, content: string): void;
  exec(o: { command: string; args: string[]; cwd: string; timeoutMs: number; signal: AbortSignal; onStart(pid: number): void; onOutput(s: 'stdout' | 'stderr', t: string): void }): Promise<RunResult>;
}

export const realExecutors: Executors = {
  readFile: (abs) => {
    const st = statSync(abs);
    if (!st.isFile()) throw new AtlasError('invalid_request', 'Not a file');
    if (st.size > 200 * 1024) return readFileSync(abs, 'utf8').slice(0, 200 * 1024) + '\n… [truncated at 200 KB]';
    return readFileSync(abs, 'utf8');
  },
  listDir: (abs) => readdirSync(abs, { withFileTypes: true }).filter((d) => d.name !== '.git').map((d) => (d.isDirectory() ? `${d.name}/` : d.name)).sort(),
  writeFile: (abs, content) => { mkdirSync(path.dirname(abs), { recursive: true }); writeFileSync(abs, content, 'utf8'); },
  exec: (o) => run({ ...o, env: sanitizedEnv() }),
};

export interface GateContext {
  missionId: string;
  taskId: string;
  attemptId: string;
  role: AgentRole;
  mode: ApprovalMode;
  cwd: string;
  permitted: string[];
  approvalTtlMs: number;
  /** Resolves when the operator decides; the orchestrator owns the waiter registry. */
  awaitApproval(a: Approval, signal: AbortSignal): Promise<Approval>;
}

export class ToolGate implements ToolInvoker {
  readonly specs: ToolSpec[];
  constructor(private readonly ctx: GateContext, private readonly repo: Repo, private readonly artifacts: ArtifactStore, private readonly ex: Executors = realExecutors) {
    this.specs = TOOL_SPECS.filter((s) => ctx.permitted.includes(s.name));
  }

  private emit(type: 'policy.decision' | 'approval.requested' | 'approval.decided' | 'process.started' | 'process.output' | 'process.exited' | 'artifact.created', payload: Record<string, unknown>, artifactIds: string[] = []) {
    const { missionId, taskId, attemptId, role } = this.ctx;
    return this.repo.append({ missionId, taskId, attemptId, type, actor: { kind: 'system', component: 'toolgate' }, payload: { ...payload, role }, artifactIds });
  }

  private fail(error: ToolResult['error'], output: string): ToolResult { return { ok: false, output, exitCode: null, artifactIds: [], error }; }

  async invoke(name: string, rawArgs: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> {
    if (!this.ctx.permitted.includes(name) || !ARGS[name]) {
      this.emit('policy.decision', { tool: name, decision: 'deny', reason: `Tool "${name}" is not permitted for this task` });
      return this.fail('unknown_tool', `Tool "${name}" is not available for this task.`);
    }
    const parsed = ARGS[name].safeParse(rawArgs ?? {});
    if (!parsed.success) return this.fail('invalid_args', `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    const args = parsed.data as Record<string, any>;

    const decision = evaluate({ role: this.ctx.role, tool: name, args, mode: this.ctx.mode });
    const action = describe(name, args);
    this.emit('policy.decision', { tool: name, action, decision: decision.decision, capability: decision.capability, risk: decision.risk, reason: decision.reason });
    if (decision.decision === 'deny') return this.fail('policy_denied', `Denied by policy: ${decision.reason}`);

    if (decision.decision === 'ask') {
      const now = Date.now();
      const approval: Approval = {
        id: newId('apr'), missionId: this.ctx.missionId, taskId: this.ctx.taskId, agentRole: this.ctx.role, tool: name,
        capability: decision.capability ?? 'unknown', action, environment: `Isolated worktree · ${this.ctx.cwd}`,
        resources: resourcesOf(name, args), reason: decision.reason, risk: decision.risk, scope: 'once', status: 'pending',
        requestedAt: new Date(now).toISOString(), expiresAt: new Date(now + this.ctx.approvalTtlMs).toISOString(), decidedAt: null, decidedBy: null,
      };
      this.repo.insertApproval(approval);
      this.emit('approval.requested', { approvalId: approval.id, tool: name, action, risk: approval.risk, reason: approval.reason, expiresAt: approval.expiresAt });
      const decided = await this.ctx.awaitApproval(approval, signal);
      const usable = approvalUsable(decided);
      if (!usable.ok) return this.fail(decided.status === 'expired' ? 'approval_expired' : 'approval_denied', `Not executed: ${usable.reason}.`);
    }

    try {
      return await this.execute(name, args, signal);
    } catch (e) {
      if (e instanceof AtlasError && e.kind === 'policy_deny') {
        this.emit('policy.decision', { tool: name, action, decision: 'deny', reason: e.message });
        return this.fail('path_escape', e.message);
      }
      return this.fail('process_failed', redact((e as Error).message));
    }
  }

  private async execute(name: string, a: Record<string, any>, signal: AbortSignal): Promise<ToolResult> {
    const cwd = this.ctx.cwd;
    switch (name) {
      case 'read_file': return ok(this.ex.readFile(resolveInside(cwd, a.path)));
      case 'list_files': return ok(this.ex.listDir(resolveInside(cwd, a.path === '.' ? '.' : a.path)).join('\n') || '(empty)');
      case 'write_file': {
        const abs = resolveInside(cwd, a.path, { forWrite: true });
        this.ex.writeFile(abs, a.content);
        return ok(`Wrote ${a.path} (${Buffer.byteLength(a.content)} bytes)`);
      }
      case 'git_status': {
        const st = await git(cwd, ['status', '--short']);
        const diff = await git(cwd, ['diff', '--stat']);
        return ok(`${st.out || '(clean)'}\n${diff.out}`.trim());
      }
      case 'shell_exec': return this.process(a.command, a.args, (a.timeoutSec ?? 300) * 1000, signal, 'shell');
      case 'run_tests': {
        const r = detectRecipes(cwd).find((x) => x.name === 'tests');
        if (!r) return { ok: false, output: 'No test command is configured for this project (package.json "test" script not found).', exitCode: null, artifactIds: [], error: null };
        return this.process(r.command, r.args, r.timeoutMs, signal, 'tests');
      }
    }
    return this.fail('unknown_tool', name);
  }

  private async process(command: string, args: string[], timeoutMs: number, signal: AbortSignal, label: string): Promise<ToolResult> {
    const cmd = [command, ...args].join(' ');
    let pid = 0;
    let buf = '';
    let flushAt = 0;
    const flush = () => { if (buf) { this.emit('process.output', { pid, text: buf }); buf = ''; } };
    const r = await this.ex.exec({
      command, args, cwd: this.ctx.cwd, timeoutMs, signal,
      onStart: (p) => { pid = p; this.emit('process.started', { pid, command: redact(cmd), cwd: this.ctx.cwd, label }); },
      onOutput: (_s, t) => { buf += t; if (buf.length > 4000 || Date.now() - flushAt > 250) { flushAt = Date.now(); flush(); } },
    });
    flush();
    const log = this.artifacts.put({ missionId: this.ctx.missionId, taskId: this.ctx.taskId, kind: 'log', name: `${label}: ${cmd}`.slice(0, 120), content: `$ ${cmd}\n${r.output}\n[exit ${r.exitCode ?? 'none'}${r.timedOut ? ', timed out' : ''}${r.cancelled ? ', cancelled' : ''} · ${r.durationMs} ms]` });
    this.emit('process.exited', { pid, command: redact(cmd), exitCode: r.exitCode, signal: r.signal, durationMs: r.durationMs, timedOut: r.timedOut, cancelled: r.cancelled, spawnError: r.spawnError }, [log.id]);
    const tail = r.output.length > 12_000 ? `… [${r.output.length - 12_000} earlier characters omitted]\n${r.output.slice(-12_000)}` : r.output;
    const status = r.spawnError ? `Failed to start: ${r.spawnError}` : r.timedOut ? 'Timed out' : r.cancelled ? 'Cancelled' : `Exit code ${r.exitCode}`;
    return { ok: r.exitCode === 0, output: `${tail}\n${status}`, exitCode: r.exitCode, artifactIds: [log.id], error: r.timedOut ? 'timeout' : r.cancelled ? 'cancelled' : r.exitCode === 0 ? null : 'process_failed' };
  }
}

function ok(output: string): ToolResult { return { ok: true, output, exitCode: null, artifactIds: [], error: null }; }

export function describe(tool: string, a: Record<string, any>): string {
  switch (tool) {
    case 'shell_exec': return redact([a.command, ...(a.args ?? [])].join(' '));
    case 'read_file': case 'list_files': case 'write_file': return a.path;
    case 'run_tests': return 'project test command';
    default: return tool;
  }
}
function resourcesOf(tool: string, a: Record<string, any>): string[] {
  if (tool === 'write_file') return [a.path];
  if (tool === 'shell_exec') return ['worktree files', ...(['curl', 'wget', 'npm', 'pnpm', 'yarn', 'git'].includes(a.command) ? ['network'] : [])];
  return [];
}
