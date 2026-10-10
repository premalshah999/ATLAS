// Interactive pseudoterminals for operator sessions (manual §20). The PTY is allocated by the system
// `script` utility inside the sandbox, so no native Node module is needed for any Electron ABI.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { redact } from '@atlas/contracts';
import { killTree, sanitizedEnv } from './index';
import { wrapCommand, type SandboxSpec } from './sandbox';
import { ensureHelper, windowsCommand } from './win/appcontainer';

export interface PtyHandle {
  pid: number | null;
  write(data: string): void;
  close(): Promise<void>;
  transcript(): string;
}

export function ptySupported(): { ok: boolean; detail: string } {
  if (process.platform === 'linux') return existsSync('/usr/bin/script') ? { ok: true, detail: 'util-linux script' } : { ok: false, detail: 'util-linux `script` is not installed' };
  if (process.platform === 'darwin') return existsSync('/usr/bin/script') ? { ok: true, detail: 'BSD script' } : { ok: false, detail: '/usr/bin/script is missing' };
  if (process.platform === 'win32') {
    try { ensureHelper(); return { ok: true, detail: 'Windows ConPTY (atlas-sandbox helper)' }; }
    catch (e) { return { ok: false, detail: (e as Error).message }; }
  }
  return { ok: false, detail: `No PTY support on ${process.platform}` };
}

export function openPty(o: { cwd: string; cols: number; rows: number; sandbox?: SandboxSpec; onData: (text: string) => void; onExit: (code: number | null) => void; maxTranscript?: number }): PtyHandle {
  const cols = Math.max(20, Math.min(400, Math.floor(o.cols)));
  const rows = Math.max(5, Math.min(200, Math.floor(o.rows)));
  let env = { ...sanitizedEnv({ TERM: 'xterm-256color', COLUMNS: String(cols), LINES: String(rows), PS1: 'atlas$ ' }) };
  let cmd: string, args: string[];
  if (process.platform === 'win32') {
    // ConPTY hosted by the sandbox helper: inside the task's AppContainer when sandboxed, otherwise uncontained
    // (only reachable when the operator allowed unsandboxed execution).
    const shell = 'powershell.exe';
    const shellArgs = ['-NoLogo', '-NoProfile'];
    if (o.sandbox) {
      const w = wrapCommand(shell, shellArgs, o.cwd, o.sandbox, env);
      env = w.env;
      cmd = w.command;
      args = [...w.args.slice(0, 2), '--pty', `${cols}x${rows}`, ...w.args.slice(2)];
    } else {
      cmd = ensureHelper();
      args = ['run', '-', '--pty', `${cols}x${rows}`, '--cmdline', windowsCommand(shell, shellArgs, env).line];
    }
  } else {
    const shell = existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
    const start = `stty cols ${cols} rows ${rows}; exec ${shell}${shell.endsWith('bash') ? ' --norc' : ''} -i`;
    const inner = process.platform === 'darwin'
      ? { command: '/usr/bin/script', args: ['-q', '/dev/null', '/bin/sh', '-c', start] }
      : { command: '/usr/bin/script', args: ['-qfec', start, '/dev/null'] };
    cmd = inner.command; args = inner.args;
    if (o.sandbox) ({ command: cmd, args, env } = wrapCommand(inner.command, inner.args, o.cwd, o.sandbox, env));
  }
  const child = spawn(cmd, args, { cwd: o.cwd, env, detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const max = o.maxTranscript ?? 512 * 1024;
  let transcript = '';
  const take = (b: Buffer) => { const t = redact(b.toString('utf8')); transcript = (transcript + t).slice(-max); o.onData(t); };
  child.stdout!.on('data', take);
  child.stderr!.on('data', take);
  let exited = false;
  const done = new Promise<void>((r) => child.on('close', (code) => { exited = true; o.onExit(code); r(); }));
  child.on('error', (e) => { o.onData(`\r\n[terminal failed to start: ${e.message}]\r\n`); });
  return {
    pid: child.pid ?? null,
    write: (data) => { if (!exited) child.stdin!.write(data); },
    transcript: () => transcript,
    close: async () => {
      if (exited || !child.pid) return;
      killTree(child.pid, 'SIGHUP');
      const t = setTimeout(() => { if (child.pid) killTree(child.pid, 'SIGKILL'); }, 1500);
      await done;
      clearTimeout(t);
    },
  };
}
