// The renderer's only bridge (manual E2). A fixed, typed method set over one validated channel.
// No ipcRenderer, fs, child_process or arbitrary channels are exposed.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, METHODS, type Envelope, type Method } from '@atlas/contracts';

const allowed = new Set<string>(METHODS);

async function invoke(method: Method, params: unknown = {}): Promise<unknown> {
  if (!allowed.has(method)) throw new Error(`Undeclared method: ${String(method).slice(0, 60)}`);
  const r = (await ipcRenderer.invoke(IPC.invoke, method, params)) as Envelope<unknown>;
  if (!r.ok) throw Object.assign(new Error(r.error.message), { kind: r.error.kind });
  return r.data;
}

function listen(channel: string, fn: (payload: unknown) => void) {
  const h = (_e: IpcRendererEvent, payload: unknown) => fn(payload);
  ipcRenderer.on(channel, h);
  return () => { ipcRenderer.removeListener(channel, h); };
}

const api = {
  platform: process.platform,
  invoke,
  onEvent: (fn: (e: unknown) => void) => listen(IPC.event, fn),
  onStatus: (fn: (s: unknown) => void) => listen(IPC.status, fn),
  onTerminal: (fn: (t: unknown) => void) => listen(IPC.terminal, fn),
  ...(process.env.ATLAS_E2E === '1' ? { e2e: { crashDaemon: () => ipcRenderer.invoke('atlas:e2e:crash-daemon') } } : {}),
};

contextBridge.exposeInMainWorld('atlas', Object.freeze(api));
