// OS-level sandbox for untrusted commands (manual §23, ADR 0007).
// Linux: bubblewrap (user, mount, pid, ipc, uts, net namespaces). macOS: sandbox-exec profile.
// Anything else: no sandbox — callers must fail closed unless the operator opted into unsandboxed runs.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as win from './win/appcontainer';

export type SandboxKind = 'bwrap' | 'sandbox-exec' | 'appcontainer' | 'none';

export interface SandboxSpec {
  /** Directory the command may write (the task worktree). Mounted at the same path. */
  root: string;
  writable: boolean;
  /** Network egress. Off unless a network command was explicitly approved. */
  network: boolean;
  /** Extra read-only paths (e.g. the main repository's .git for a worktree). */
  readOnly?: string[];
  /** Extra writable paths (e.g. the worktree's git admin directory). */
  readWrite?: string[];
  /** Resource limits applied with prlimit when available. */
  limits?: { cpuSeconds?: number; fileSizeBytes?: number; openFiles?: number };
}

export interface SandboxInfo { kind: SandboxKind; detail: string; path: string | null }

let cached: SandboxInfo | null = null;

function which(bin: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const p = path.join(dir, bin);
    if (dir && existsSync(p)) return p;
  }
  return null;
}

/** Detect a working sandbox. bwrap is probed with a real run, because user namespaces can be disabled. */
export function detectSandbox(force = false): SandboxInfo {
  if (cached && !force) return cached;
  if (process.env.ATLAS_SANDBOX === 'none') return (cached = { kind: 'none', detail: 'Disabled by ATLAS_SANDBOX=none', path: null });
  if (process.platform === 'linux') {
    const bwrap = which('bwrap');
    if (!bwrap) return (cached = { kind: 'none', detail: 'bubblewrap (bwrap) is not installed. Install it: apt install bubblewrap / dnf install bubblewrap.', path: null });
    try {
      execFileSync(bwrap, ['--ro-bind', '/', '/', '--unshare-all', '--die-with-parent', 'true'], { stdio: 'ignore', timeout: 5000 });
      return (cached = { kind: 'bwrap', detail: `bubblewrap at ${bwrap}`, path: bwrap });
    } catch (e) {
      return (cached = { kind: 'none', detail: `bubblewrap is installed but cannot create namespaces (${(e as Error).message.slice(0, 120)}). Enable unprivileged user namespaces.`, path: null });
    }
  }
  if (process.platform === 'darwin') {
    if (!existsSync('/usr/bin/sandbox-exec')) return (cached = { kind: 'none', detail: '/usr/bin/sandbox-exec is missing', path: null });
    try {
      execFileSync('/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)', '/usr/bin/true'], { stdio: 'ignore', timeout: 5000 });
      return (cached = { kind: 'sandbox-exec', detail: 'macOS Seatbelt (sandbox-exec)', path: '/usr/bin/sandbox-exec' });
    } catch (e) { return (cached = { kind: 'none', detail: `sandbox-exec cannot run here (${(e as Error).message.slice(0, 120)})`, path: null }); }
  }
  if (process.platform === 'win32') {
    try {
      const helper = win.ensureHelper();
      // Probe: a real contained process must start and exit cleanly.
      execFileSync(helper, ['run', 'atlas.probe', '--cmdline', `${win.quoteArg(process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe')} /d /c exit 0`], { stdio: 'ignore', windowsHide: true, timeout: 60_000 });
      return (cached = { kind: 'appcontainer', detail: 'Windows AppContainer + Job Object', path: helper });
    } catch (e) { return (cached = { kind: 'none', detail: `Windows AppContainer sandbox unavailable (${(e as Error).message.slice(0, 200)})`, path: null }); }
  }
  return (cached = { kind: 'none', detail: `No supported sandbox on ${process.platform}`, path: null });
}

const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };

/** Toolchain directories commands need (node, npm, git…): every PATH entry and its install prefix, read-only. */
export function toolchainPaths(env: Record<string, string | undefined> = process.env): string[] {
  const out = new Set<string>();
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir) || !existsSync(dir)) continue;
    const r = real(dir);
    out.add(r);
    // `/opt/node22/bin` → also `/opt/node22` (lib/node_modules for npm); never a top-level dir like /usr or /home.
    const prefix = path.dirname(r);
    if (path.basename(r) === 'bin' && prefix.split(path.sep).filter(Boolean).length >= 2 && prefix !== os.homedir()) out.add(prefix);
  }
  return [...out];
}

const SYSTEM_RO = ['/usr', '/bin', '/sbin', '/lib', '/lib32', '/lib64', '/libx32', '/opt/homebrew', '/nix/store', '/nix/var/nix/profiles',
  '/etc/alternatives', '/etc/ssl', '/etc/ca-certificates', '/etc/pki', '/etc/resolv.conf', '/etc/hosts', '/etc/nsswitch.conf', '/etc/passwd', '/etc/group',
  '/etc/ld.so.cache', '/etc/localtime', '/etc/gitconfig'];

export const SANDBOX_HOME = '/home/atlas-sandbox';

/** Proxy and CA settings forwarded only when network egress is granted, so approved network commands work behind corporate proxies. */
export const NETWORK_ENV = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'GIT_SSL_CAINFO', 'npm_config_cafile'];

function networkEnv(source: NodeJS.ProcessEnv = process.env): { env: Record<string, string>; files: string[] } {
  const env: Record<string, string> = {};
  const files: string[] = [];
  for (const k of NETWORK_ENV) {
    const v = source[k];
    if (!v) continue;
    env[k] = v;
    if (/CERT|CA/i.test(k) && path.isAbsolute(v) && existsSync(v)) files.push(v);
  }
  return { env, files };
}

/** Wrap a command so it runs inside the sandbox. Throws if no sandbox is available. */
export function wrapCommand(command: string, args: string[], cwd: string, spec: SandboxSpec, env: Record<string, string>): { command: string; args: string[]; env: Record<string, string> } {
  const info = detectSandbox();
  const root = real(spec.root);
  const net = spec.network ? networkEnv() : { env: {}, files: [] };
  const envOut = { ...env, ...net.env, HOME: SANDBOX_HOME, TMPDIR: '/tmp', npm_config_cache: '/tmp/.npm', XDG_CACHE_HOME: '/tmp/.cache' };
  let inner = { command, args };
  if (spec.limits && which('prlimit')) {
    const l: string[] = [];
    if (spec.limits.cpuSeconds) l.push(`--cpu=${spec.limits.cpuSeconds}`);
    if (spec.limits.fileSizeBytes) l.push(`--fsize=${spec.limits.fileSizeBytes}`);
    if (spec.limits.openFiles) l.push(`--nofile=${spec.limits.openFiles}`);
    if (l.length) inner = { command: which('prlimit')!, args: [...l, '--', command, ...args] };
  }
  if (info.kind === 'bwrap') {
    const a: string[] = ['--unshare-all', '--die-with-parent', '--new-session'];
    if (spec.network) a.push('--share-net');
    for (const p of SYSTEM_RO) a.push('--ro-bind-try', p, p);
    for (const p of toolchainPaths(env)) a.push('--ro-bind-try', p, p);
    a.push('--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--tmpfs', '/home', '--dir', SANDBOX_HOME);
    for (const p of [...(spec.readOnly ?? []), ...net.files]) a.push('--ro-bind-try', real(p), real(p));
    a.push(spec.writable ? '--bind' : '--ro-bind', root, root);
    for (const p of spec.readWrite ?? []) a.push('--bind-try', real(p), real(p));
    a.push('--chdir', real(cwd), '--', inner.command, ...inner.args);
    return { command: info.path!, args: a, env: envOut };
  }
  if (info.kind === 'sandbox-exec') {
    const home = real(os.homedir());
    const writable = [root, ...(spec.readWrite ?? []).map(real), real(os.tmpdir())];
    const readable = [...writable, ...(spec.readOnly ?? []).map(real), ...toolchainPaths(env), ...net.files.map(real)];
    const q = (p: string) => JSON.stringify(p);
    const profile = [
      '(version 1)', '(allow default)',
      `(deny file-write* (require-all ${writable.map((p) => `(require-not (subpath ${q(p)}))`).join(' ')} (require-not (literal "/dev/null")) (require-not (subpath "/dev/fd"))))`,
      `(deny file-read* (require-all (subpath ${q(home)}) ${readable.map((p) => `(require-not (subpath ${q(p)}))`).join(' ')}))`,
      ...(spec.network ? [] : ['(deny network-outbound (require-not (remote unix-socket)))', '(deny network-inbound)']),
    ].join('\n');
    const dir = path.join(os.tmpdir(), 'atlas-sb');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `profile-${process.pid}-${Date.now()}.sb`);
    writeFileSync(file, profile);
    return { command: info.path!, args: ['-f', file, inner.command, ...inner.args], env: { ...envOut, HOME: real(os.tmpdir()) } };
  }
  if (info.kind === 'appcontainer') return wrapWindows(command, args, spec, env, net);
  throw Object.assign(new Error(`No OS sandbox is available: ${info.detail}`), { kind: 'sandbox_unavailable' });
}

/**
 * Windows (ADR 0012): one AppContainer per sandbox root. The container SID gets the root (and the worktree's git
 * admin directory) by ACL; shared read-only paths and the toolchain are granted to capabilities the container
 * holds; everything else in the user's profile is unreadable. Network capabilities only when approved.
 */
function wrapWindows(command: string, args: string[], spec: SandboxSpec, env: Record<string, string>, net: { env: Record<string, string>; files: string[] }): { command: string; args: string[]; env: Record<string, string> } {
  const helper = win.ensureHelper();
  const name = win.containerName(spec.root);
  const sid = win.containerSid(name);
  win.grant(sid, spec.root, spec.writable ? 'rw' : 'rx');
  for (const p of spec.readWrite ?? []) win.grant(sid, p, 'rw');
  const caps: string[] = [];
  for (const p of [...(spec.readOnly ?? []), ...net.files]) { try { caps.push(win.readCapability(p)); } catch { /* path vanished */ } }
  win.grantToolchain(toolchainPaths(env));
  const home = win.containerHome(name);
  win.grant(sid, home, 'rw');
  // App servers under test listen on loopback for the browser; AppContainers need an exemption for that.
  if (spec.network) win.tryLoopbackExemption(sid);
  const envOut: Record<string, string> = {
    ...env, ...net.env,
    USERPROFILE: home, HOME: home, APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    TEMP: path.join(home, 'Temp'), TMP: path.join(home, 'Temp'), npm_config_cache: path.join(home, 'npm-cache'),
  };
  const cmd = win.windowsCommand(command, args, envOut);
  return { command: helper, args: ['run', name, ...(spec.network ? ['--net'] : []), ...caps.flatMap((c) => ['--cap', c]), '--cmdline', cmd.line], env: envOut };
}
