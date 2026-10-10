// Policy engine (manual §21–23). Deterministic code decides; prompts and role Markdown cannot elevate rights.
import type { AgentRole, ApprovalMode, Approval, Capability, Risk } from '@atlas/contracts';

export type Decision = 'allow' | 'deny' | 'ask';

export interface PolicyDecision {
  decision: Decision;
  capability: Capability | null;
  risk: Risk;
  reason: string;
  /** The command needs network egress; the sandbox grants it only after an approval. */
  network?: boolean;
}

/** Capabilities granted per role. Anything absent is denied. */
export const ROLE_GRANTS: Record<AgentRole, readonly Capability[]> = {
  orchestrator: ['fs.read', 'agent.delegate'],
  coder: ['fs.read', 'fs.write', 'shell.safe', 'shell.privileged', 'agent.delegate'],
  reviewer: ['fs.read', 'shell.safe'],
  tester: ['fs.read', 'shell.safe'],
  browser_qa: ['fs.read', 'browser.navigate'],
  desktop_operator: ['fs.read', 'desktop.input'],
  deployment_verifier: ['fs.read', 'browser.navigate'],
};

/**
 * Capabilities no agent may hold, whatever the role says. Staging deploys run only as an operator-approved
 * release stage; desktop input is granted to desktop_operator but the session itself needs the operator's
 * opt-in setting plus a single-use approval (enforced by the desktop service).
 */
const NEVER: ReadonlySet<Capability> = new Set(['deploy.production', 'secrets.use', 'deploy.staging']);

export interface ShellClass { capability: 'shell.safe' | 'shell.privileged' | null; risk: Risk; reason: string; /** Needs network egress inside the sandbox (granted only with approval). */ network?: boolean }

const SAFE_EXEC = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'find', 'echo', 'pwd', 'diff', 'sort', 'uniq', 'tsc', 'node', 'true', 'false', 'test']);
const DENY_EXEC = new Set(['sudo', 'su', 'doas', 'mkfs', 'dd', 'shutdown', 'reboot', 'launchctl', 'systemctl', 'security', 'osascript']);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'pwsh', 'powershell', 'cmd', 'cmd.exe']);
const NETWORK = new Set(['curl', 'wget', 'ssh', 'scp', 'rsync', 'nc', 'ncat', 'ftp', 'telnet']);
const SAFE_GIT = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'branch', 'blame', 'grep']);
const PKG = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const SAFE_PKG = new Set(['test', 't', 'run', 'exec', 'ls', 'list', 'why', 'outdated']);

/** Classify a command given as an argument array. Never parses a shell string. */
export function classifyCommand(command: string, args: readonly string[]): ShellClass {
  const exe = command.split(/[\\/]/).pop()!.toLowerCase();
  if (!exe || /[;&|`$<>]/.test(command)) return { capability: null, risk: 'high', reason: 'Executable name contains shell metacharacters' };
  if (DENY_EXEC.has(exe)) return { capability: null, risk: 'high', reason: `${exe} is never permitted for agents` };
  if (SHELLS.has(exe)) return { capability: 'shell.privileged', risk: 'high', reason: 'Spawning a shell runs arbitrary code' };
  if (NETWORK.has(exe)) return { capability: 'shell.privileged', risk: 'elevated', reason: 'Command reaches the network', network: true };
  if (exe === 'rm' || exe === 'mv' || exe === 'chmod' || exe === 'chown' || exe === 'ln') {
    const recursive = args.some((a) => /^-[a-zA-Z]*[rRf]/.test(a));
    return { capability: 'shell.privileged', risk: recursive ? 'high' : 'elevated', reason: 'Command deletes, moves or changes permissions of files' };
  }
  if (exe === 'git') {
    const sub = args.find((a) => !a.startsWith('-')) ?? '';
    if (SAFE_GIT.has(sub)) return { capability: 'shell.safe', risk: 'low', reason: `git ${sub} is read-only` };
    return { capability: 'shell.privileged', risk: sub === 'push' || sub === 'reset' || sub === 'clean' ? 'high' : 'elevated', reason: `git ${sub || '(none)'} changes repository state`, network: ['push', 'fetch', 'pull', 'clone', 'ls-remote', 'submodule'].includes(sub) };
  }
  if (PKG.has(exe) || exe === 'npx') {
    const sub = args.find((a) => !a.startsWith('-')) ?? '';
    if (exe !== 'npx' && SAFE_PKG.has(sub)) return { capability: 'shell.safe', risk: 'low', reason: `${exe} ${sub} runs a project script` };
    if (exe === 'npx' && ['vitest', 'jest', 'tsc', 'eslint', 'prettier', 'mocha'].includes(sub)) return { capability: 'shell.safe', risk: 'low', reason: `npx ${sub} runs a local dev tool` };
    return { capability: 'shell.privileged', risk: 'elevated', reason: `${exe} ${sub || ''} may install packages or run install scripts`.replace(/\s+/g, ' '), network: true };
  }
  if (exe === 'node' && args.some((a) => a === '-e' || a === '--eval' || a === '-p' || a === '--print')) {
    return { capability: 'shell.privileged', risk: 'elevated', reason: 'Inline code evaluation' };
  }
  if (SAFE_EXEC.has(exe)) return { capability: 'shell.safe', risk: 'low', reason: `${exe} is on the safe list` };
  return { capability: 'shell.privileged', risk: 'elevated', reason: `${exe} is not on the safe list` };
}

export const TOOL_CAPABILITY: Record<string, Capability | 'shell'> = {
  read_file: 'fs.read',
  list_files: 'fs.read',
  git_status: 'fs.read',
  write_file: 'fs.write',
  shell_exec: 'shell',
  run_tests: 'shell.safe',
  view_diff: 'fs.read',
  report_finding: 'fs.read',
  delegate: 'agent.delegate',
  browser_action: 'browser.navigate',
  desktop_action: 'desktop.input',
  staging_deploy: 'deploy.staging',
  inspect_logs: 'fs.read',
};

export interface EvaluateInput {
  role: AgentRole;
  tool: string;
  args: Record<string, unknown>;
  mode: ApprovalMode;
}

/** Evaluate a proposed tool call before execution, independent of any prompt. Unknown ⇒ deny. */
export function evaluate({ role, tool, args, mode }: EvaluateInput): PolicyDecision {
  const mapped = TOOL_CAPABILITY[tool];
  if (!mapped) return { decision: 'deny', capability: null, risk: 'high', reason: `Unknown tool "${tool}"` };

  let capability: Capability;
  let risk: Risk = 'low';
  let why = '';
  let network = false;
  if (mapped === 'shell') {
    const command = typeof args.command === 'string' ? args.command : '';
    const argv = Array.isArray(args.args) ? args.args.map(String) : [];
    if (!command) return { decision: 'deny', capability: null, risk: 'high', reason: 'shell_exec requires a command' };
    const c = classifyCommand(command, argv);
    if (!c.capability) return { decision: 'deny', capability: null, risk: c.risk, reason: c.reason };
    capability = c.capability; risk = c.risk; why = c.reason; network = !!c.network;
  } else {
    capability = mapped;
    if (capability === 'fs.write') risk = 'low';
  }

  if (NEVER.has(capability)) return { decision: 'deny', capability, risk: 'high', reason: `${capability} is disabled in this release` };
  if (!ROLE_GRANTS[role].includes(capability)) return { decision: 'deny', capability, risk, reason: `Role ${role} does not hold ${capability}` };

  if (mode === 'plan_only' && (capability === 'fs.write' || capability === 'shell.privileged')) {
    return { decision: 'deny', capability, risk, reason: 'Mission runs in plan-only mode: no writes or privileged commands' };
  }
  if (capability === 'shell.privileged') return { decision: 'ask', capability, risk, reason: why || 'Privileged command', network };
  if (capability === 'fs.write' && mode === 'ask_all_writes') return { decision: 'ask', capability, risk, reason: 'Approval mode requires approval for every write' };
  return { decision: 'allow', capability, risk, reason: why || `${capability} granted to ${role}` };
}

/** An approval is usable only once, only while pending-then-approved, and only before it expires. */
export function approvalUsable(a: Pick<Approval, 'status' | 'expiresAt'>, now = new Date()): { ok: boolean; reason: string } {
  if (a.status === 'denied') return { ok: false, reason: 'Operator denied the request' };
  if (a.status === 'expired' || new Date(a.expiresAt) <= now) return { ok: false, reason: 'Approval expired before a decision' };
  if (a.status !== 'approved') return { ok: false, reason: 'Approval is still pending' };
  return { ok: true, reason: 'Approved once by operator' };
}
