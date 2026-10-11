// Process journal (evolution P0-4). Every process the executor starts is recorded with an OS identity
// (pid + start time) and removed when it exits. After a crash, `reapJournaled` kills what is still running —
// but only when the identity still matches, so a reused pid is never killed.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { nowIso, type ProcessJournal } from '@atlas/contracts';

let journal: ProcessJournal | null = null;
export function setProcessJournal(j: ProcessJournal | null) { journal = j; }

/** Stable identity of a running process: its start time as the OS reports it. null when unknown or gone. */
export function processIdentity(pid: number): string | null {
  try {
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      return fields[19] ? `linux:${fields[19]}` : null; // field 22 (starttime), counted after "pid (comm)"
    }
    if (process.platform === 'darwin') {
      const out = execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 3000 }).trim();
      return out ? `darwin:${out}` : null;
    }
  } catch { return null; }
  // Windows: helper-launched processes live in a kill-on-close Job Object, so the OS reaps them.
  return null;
}

export function journalStart(pid: number | null | undefined, kind: string, command: string): (() => void) {
  if (!journal || !pid) return () => {};
  const identity = processIdentity(pid);
  if (!identity) return () => {};
  const j = journal;
  try { j.add({ pid, identity, kind, command, startedAt: nowIso() }); } catch { return () => {}; }
  return () => { try { j.remove(pid, identity); } catch { /* db closed */ } };
}

/** Kill journaled processes (and their process groups) left behind by a crash. Returns what was killed. */
export function reapJournaled(j: ProcessJournal): { killed: { pid: number; kind: string; command: string }[]; stale: number } {
  const killed: { pid: number; kind: string; command: string }[] = [];
  let stale = 0;
  for (const e of j.list()) {
    if (processIdentity(e.pid) !== e.identity) { stale++; continue; }
    try { process.kill(-e.pid, 'SIGKILL'); } catch { /* not a group leader */ }
    try { process.kill(e.pid, 'SIGKILL'); } catch { /* already gone */ }
    killed.push({ pid: e.pid, kind: e.kind, command: e.command });
  }
  j.clear();
  return { killed, stale };
}
