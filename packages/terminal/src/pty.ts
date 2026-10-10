// Interactive pseudoterminals for operator sessions (manual §20). The PTY is allocated by the system
// `script` utility inside the sandbox, so no native Node module is needed for any Electron ABI.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { redact } from '@atlas/contracts';
import { killTree, sanitizedEnv } from './index';
import { wrapCommand, type SandboxSpec } from './sandbox';

export interface PtyHandle {
  pid: number | null;
  write(data: string): void;
  close(): Promise<void>;
  transcript(): string;
}

export function ptySupported(): { ok: boolean; detail: string } {
  if (process.platform === 'linux') return existsSync('/usr/bin/script') ? { ok: true, detail: 'util-linux script' } : { ok: false, detail: 'util-linux `script` is not installed' };
  if (process.platform === 'darwin') return { ok: existsSync('/usr/bin/script'), detail: 'BSD script (untested)' };
  return { ok: false, detail: `No PTY support on ${process.platform}` };
}

export function openPty(o: { cwd: string; cols: number; rows: number; sandbox?: SandboxSpec; onData: (text: string) => void; onExit: (code: number | null) => void; maxTranscript?: number }): PtyHandle {
  const cols = Math.max(20, Math.min(400, Math.floor(o.cols)));
  const rows = Math.max(5, Math.min(200, Math.floor(o.rows)));
  const shell = existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
  const inner = process.platform === 'darwin'
    ? { command: '/usr/bin/script', args: ['-q', '/dev/null', shell, '-i'] }
    : { command: '/usr/bin/script', args: ['-qfec', `stty cols ${cols} rows ${rows}; exec ${shell}${shell.endsWith('bash') ? ' --norc' : ''} -i`, '/dev/null'] };
  let env = { ...sanitizedEnv({ TERM: 'xterm-256color', COLUMNS: String(cols), LINES: String(rows), PS1: 'atlas$ ' }) };
  let cmd = inner.command, args = inner.args;
  if (o.sandbox) ({ command: cmd, args, env } = wrapCommand(inner.command, inner.args, o.cwd, o.sandbox, env));
  const child = spawn(cmd, args, { cwd: o.cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
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
