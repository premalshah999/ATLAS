// Daemon entry. Runs as an Electron utility process (parentPort) or a Node child process (process.send).
import { PROVIDER_ENV, type DaemonInbound, type DaemonOutbound } from '@atlas/contracts';
import { DaemonService } from './service';

type Port = { send(m: DaemonOutbound): void; on(fn: (m: DaemonInbound) => void): void };

function port(): Port {
  const pp = (process as any).parentPort;
  if (pp) return { send: (m) => pp.postMessage(m), on: (fn) => pp.on('message', (e: { data: DaemonInbound }) => fn(e.data)) };
  if (process.send) return { send: (m) => process.send!(m), on: (fn) => process.on('message', (m) => fn(m as DaemonInbound)) };
  throw new Error('daemon must be started by the ATLAS shell');
}

async function main() {
  const dataDir = process.env.ATLAS_DATA_DIR;
  if (!dataDir) throw new Error('ATLAS_DATA_DIR is required');
  const apiKeys: Record<string, string> = {};
  for (const [provider, env] of Object.entries(PROVIDER_ENV)) {
    const v = process.env[env];
    if (v) { apiKeys[provider] = v; delete process.env[env]; }
  }
  let deploySecrets: Record<string, Record<string, string>> = {};
  if (process.env.ATLAS_DEPLOY_SECRETS) { try { deploySecrets = JSON.parse(process.env.ATLAS_DEPLOY_SECRETS); } catch { /* ignored */ } delete process.env.ATLAS_DEPLOY_SECRETS; }
  const svc = new DaemonService({ dataDir, version: process.env.ATLAS_VERSION ?? '0.0.0', apiKeys, model: process.env.ATLAS_MODEL || undefined, deploySecrets });
  const io = port();
  svc.onEvent((event) => io.send({ kind: 'event', event }));
  svc.onTerminal((sessionId, data, exit) => io.send({ kind: 'terminal', sessionId, ...(data !== undefined ? { data } : {}), ...(exit !== undefined ? { exit } : {}) }));
  io.on(async (msg) => {
    if (!msg || msg.kind !== 'req' || typeof msg.id !== 'number' || typeof msg.method !== 'string') return;
    try {
      const data = await svc.handle(msg.method, msg.params);
      io.send({ kind: 'res', id: msg.id, ok: true, data: JSON.parse(JSON.stringify(data ?? null)) });
    } catch (e) {
      const err = e as Error & { kind?: string; issues?: unknown };
      const kind = err.kind ?? (err.name === 'ZodError' ? 'invalid_request' : 'internal');
      svc.log.warn('request failed', { method: msg.method, kind, message: err.message });
      io.send({ kind: 'res', id: msg.id, ok: false, error: { kind, message: kind === 'invalid_request' && err.name === 'ZodError' ? 'Malformed request' : err.message } });
    }
  });
  const recovered = await svc.start();
  io.send({ kind: 'ready', pid: process.pid, recovered });
  const stop = async () => { await svc.stop().catch(() => {}); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  process.stderr.write(`ATLAS daemon failed to start: ${(e as Error).stack}\n`);
  process.exit(1);
});
