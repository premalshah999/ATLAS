// Terminal executor (manual §20). Commands are argument arrays, never shell strings. Each run owns a
// process group so cancellation and timeouts terminate the whole tree.
import { spawn, execFileSync } from 'node:child_process';
import { redact } from '@atlas/contracts';
import { wrapCommand, type SandboxSpec } from './sandbox';

export { detectSandbox, wrapCommand, toolchainPaths, SANDBOX_HOME, type SandboxSpec, type SandboxInfo, type SandboxKind } from './sandbox';

/** Environment variables passed through to child processes. Everything else is dropped. */
export const ENV_ALLOWLIST = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TERM', 'TMPDIR', 'TEMP', 'TMP', 'SHELL', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE'];

export function sanitizedEnv(extra: Record<string, string> = {}, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of ENV_ALLOWLIST) { const v = source[k]; if (v !== undefined) env[k] = v; }
  return { ...env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0', ...extra };
}

export interface RunOptions {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
  env?: Record<string, string>;
  /** Max bytes of combined output kept in memory (the rest is counted, not stored). */
  maxOutput?: number;
  onStart?: (pid: number) => void;
  onOutput?: (stream: 'stdout' | 'stderr', text: string) => void;
  /** Run inside the OS sandbox. When set and no sandbox exists, the run fails closed (spawnError). */
  sandbox?: SandboxSpec;
}

export interface RunResult {
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  output: string;
  truncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
  pid: number | null;
  spawnError: string | null;
}

/** Kill a process and every descendant. POSIX: the negative pid targets the process group. */
export function killTree(pid: number, sig: NodeJS.Signals = 'SIGTERM'): void {
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    return;
  }
  try { process.kill(-pid, sig); } catch { try { process.kill(pid, sig); } catch { /* already gone */ } }
}

export function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function run(o: RunOptions): Promise<RunResult> {
  const started = Date.now();
  const max = o.maxOutput ?? 512 * 1024;
  return new Promise((resolve) => {
    let output = '';
    let truncated = false;
    let timedOut = false;
    let cancelled = false;
    let settled = false;

    if (o.signal?.aborted) {
      resolve({ exitCode: null, signal: null, durationMs: 0, output: '', truncated: false, timedOut: false, cancelled: true, pid: null, spawnError: null });
      return;
    }

    let cmd = o.command, argv = o.args, env = o.env ?? sanitizedEnv();
    if (o.sandbox) {
      try { ({ command: cmd, args: argv, env } = wrapCommand(o.command, o.args, o.cwd, o.sandbox, env)); }
      catch (e) {
        resolve({ exitCode: null, signal: null, durationMs: 0, output: '', truncated: false, timedOut: false, cancelled: false, pid: null, spawnError: (e as Error).message });
        return;
      }
    }
    const child = spawn(cmd, argv, {
      cwd: o.cwd,
      env,
      detached: process.platform !== 'win32',
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const pid = child.pid ?? null;
    if (pid) o.onStart?.(pid);

    const take = (stream: 'stdout' | 'stderr') => (buf: Buffer) => {
      const text = redact(buf.toString('utf8'));
      o.onOutput?.(stream, text);
      if (output.length < max) output += text.slice(0, max - output.length);
      if (output.length >= max) truncated = true;
    };
    child.stdout!.on('data', take('stdout'));
    child.stderr!.on('data', take('stderr'));

    const stop = () => {
      if (!pid) return;
      killTree(pid, 'SIGTERM');
      setTimeout(() => { if (isAlive(pid)) killTree(pid, 'SIGKILL'); }, 1500).unref();
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, o.timeoutMs);
    const onAbort = () => { cancelled = true; stop(); };
    o.signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (exitCode: number | null, sig: string | null, spawnError: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      o.signal?.removeEventListener('abort', onAbort);
      // Reap any descendants that outlived the leader (e.g. backgrounded children).
      if (pid && process.platform !== 'win32') { try { process.kill(-pid, 'SIGKILL'); } catch { /* group already empty */ } }
      resolve({ exitCode, signal: sig, durationMs: Date.now() - started, output, truncated, timedOut, cancelled, pid, spawnError });
    };
    child.on('error', (e) => finish(null, null, e.message));
    child.on('close', (code, sig) => finish(code, sig, null));
  });
}
