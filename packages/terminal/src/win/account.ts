// Windows sandbox accounts (ADR 0020, operator-approved): untrusted commands run as atlas-sbx, a standard local
// account with no network (Windows Firewall rule), or as atlas-sbx-net for network commands the operator approved.
// Created only when the operator clicks Set up in Settings and accepts the administrator prompt; visible like any
// other account; removed with one click. File access is by explicit grants to the account's SID.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { alreadyReadable, atlasLocalDir, containerHome, ensureHelper, grant, quoteArg } from './appcontainer';

export interface SandboxAccount { kind: 'offline' | 'network'; name: string; sid: string }
export interface AccountsInfo { offline: SandboxAccount; network: SandboxAccount; firewall: boolean; store: string }

const real = (p: string) => { try { return realpathSync.native(p); } catch { return p; } };
export const accountStore = () => path.join(atlasLocalDir(), 'accounts.txt');

/** The accounts from the store (SIDs only; the protected passwords stay with the helper). Null when not set up. */
export function readAccounts(): AccountsInfo | null {
  const store = accountStore();
  if (!existsSync(store)) return null;
  const acc: Partial<Record<'offline' | 'network', SandboxAccount>> = {};
  let firewall = false;
  for (const l of readFileSync(store, 'utf8').split(/\r?\n/)) {
    const f = l.trim().split(' ');
    if (f[0] === 'account' && (f[1] === 'offline' || f[1] === 'network') && f.length === 5) acc[f[1]] = { kind: f[1], name: f[2], sid: f[3] };
    if (f[0] === 'firewall') firewall = f[1] === 'ok';
  }
  return acc.offline && acc.network ? { offline: acc.offline, network: acc.network, firewall, store } : null;
}

function elevated(): boolean {
  try { execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true, timeout: 15_000 }); return true; } catch { return false; }
}

/** Run the helper as administrator: directly when already elevated (CI), else through the Windows consent prompt. */
function runElevated(args: string[]) {
  const helper = ensureHelper();
  if (elevated()) { execFileSync(helper, args, { stdio: 'pipe', windowsHide: true, timeout: 180_000 }); return; }
  const ps = `$p = Start-Process -FilePath '${helper.replace(/'/g, "''")}' -ArgumentList ${args.map((a) => `'${quoteArg(a).replace(/'/g, "''")}'`).join(',')} -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'pipe', windowsHide: true, timeout: 300_000 });
}

/** Operator action: create (or refresh) both accounts and the firewall rule. */
export function setupAccounts(): AccountsInfo {
  if (process.platform !== 'win32') throw new Error('Sandbox accounts exist only on Windows');
  try { runElevated(['account-setup', accountStore()]); }
  catch (e) {
    const out = String((e as { stderr?: Buffer }).stderr ?? (e as Error).message).trim();
    throw new Error(/canceled|cancelled|1223/i.test(out) ? 'The administrator prompt was declined; nothing was changed.' : `Setting up the sandbox accounts failed: ${out.slice(0, 400)}`);
  }
  const info = readAccounts();
  if (!info) throw new Error('The sandbox accounts were not recorded');
  // The helper hosts a ConPTY as the account for operator terminals: the account must be able to run it.
  for (const a of [info.offline, info.network]) grantFor(a.sid, ensureHelper(), 'rx');
  writeFileSync(grantsFile(), '[]');
  return info;
}

/** Operator action: delete both accounts and the firewall rule. */
export function removeAccounts(): void {
  if (process.platform !== 'win32') return;
  runElevated(['account-remove']);
  rmSync(accountStore(), { force: true });
  rmSync(grantsFile(), { force: true });
}

const grantsFile = () => path.join(atlasLocalDir(), 'account-grants.json');
let grantCache: Set<string> | null = null;
/**
 * Grant the account `mode` on `target` (inherited by children), and read-attributes on each ancestor so the
 * account can resolve the path (it cannot list the operator's profile folders). Remembered per machine.
 */
export function grantFor(sid: string, target: string, mode: 'rw' | 'rx') {
  const p = real(target);
  if (!existsSync(p)) return;
  if (!grantCache) { try { grantCache = new Set(JSON.parse(readFileSync(grantsFile(), 'utf8'))); } catch { grantCache = new Set(); } }
  const key = `${sid}|${p.toLowerCase()}|${mode}`;
  if (grantCache.has(key)) return;
  if (!(mode === 'rx' && alreadyReadable(p))) grant(sid, p, mode);
  for (let d = path.dirname(p); path.dirname(d) !== d; d = path.dirname(d)) {
    const k = `${sid}|${d.toLowerCase()}|ra`;
    if (grantCache.has(k) || alreadyReadable(d)) continue;
    try { execFileSync(ensureHelper(), ['grant', d, sid, 'ra'], { stdio: 'pipe', windowsHide: true, timeout: 60_000 }); } catch { /* not ours to change: the path may stay unresolvable */ }
    grantCache.add(k);
  }
  grantCache.add(key);
  try { writeFileSync(grantsFile(), JSON.stringify([...grantCache])); } catch { /* cache only */ }
}

/** Private home and temp folders for commands under one sandbox root, writable by the account. */
export function accountHome(root: string, sid: string): string {
  const home = containerHome(`acct.${createHash('sha256').update(real(root).toLowerCase()).digest('hex').slice(0, 24)}`);
  grantFor(sid, home, 'rw');
  return home;
}

/** A real run as the offline account: what detectSandbox uses to decide the mode works on this machine. */
export function probeAccount(info: AccountsInfo): void {
  const home = accountHome(path.join(atlasLocalDir(), 'probe'), info.offline.sid);
  const cmd = process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe';
  execFileSync(ensureHelper(), ['run', '-', '--account', 'offline', '--store', info.store, '--cmdline', `${quoteArg(cmd)} /d /c exit 0`], { cwd: home, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true, timeout: 120_000 });
}
