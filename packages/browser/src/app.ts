import type { AtlasConfig, StageSandbox } from '@atlas/contracts';
import { freePort, waitReady } from './http';

export interface RunningApp { baseUrl: string; stop(): Promise<void>; logs(): string; pid: number | null }

/** Start the project's app in the sandbox on a free port and wait until it answers. */
export async function startApp(sandbox: StageSandbox, app: NonNullable<AtlasConfig['app']>, opts: { cwd?: string; env?: Record<string, string>; signal?: AbortSignal; onOutput?: (t: string) => void } = {}): Promise<RunningApp> {
  const port = app.port ?? (await freePort());
  const h = await sandbox.start({ command: app.start[0], args: app.start.slice(1), cwd: opts.cwd, network: true, env: { ...app.env, ...(opts.env ?? {}), PORT: String(port), HOST: '127.0.0.1' }, onOutput: opts.onOutput });
  if (h.spawnError) throw new Error(`App did not start: ${h.spawnError}`);
  const baseUrl = `http://127.0.0.1:${port}`;
  const ready = await waitReady(new URL(app.readyPath, baseUrl).toString(), app.readyTimeoutSec * 1000, opts.signal, () => !h.exited());
  if (!ready.ok) {
    const logs = h.output();
    await h.stop();
    throw new Error(`App not ready: ${ready.detail}\n${logs.slice(-2000)}`);
  }
  return { baseUrl, stop: () => h.stop(), logs: () => h.output(), pid: h.pid };
}
