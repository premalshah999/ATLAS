// Provider credentials (manual §24, E2): encrypted with the OS credential store via safeStorage.
// Values never reach the renderer; only "configured: yes/no" does.
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { PROVIDER_ENV } from '@atlas/contracts';

const file = () => path.join(app.getPath('userData'), 'credentials.json');

function load(): Record<string, string> {
  if (!existsSync(file())) return {};
  try { return JSON.parse(readFileSync(file(), 'utf8')) as Record<string, string>; } catch { return {}; }
}
function save(data: Record<string, string>) {
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  renameSync(tmp, file());
}

export const credentials = {
  available: () => safeStorage.isEncryptionAvailable(),
  /** Decrypted keys from the store, plus any provider variables exported in the launching shell. */
  keys(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [provider, env] of Object.entries(PROVIDER_ENV)) if (process.env[env]) out[provider] = process.env[env]!;
    if (!safeStorage.isEncryptionAvailable()) return out;
    for (const [provider, enc] of Object.entries(load())) {
      try { out[provider] = safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { /* unreadable entry: ignored */ }
    }
    return out;
  },
  list() {
    const stored = load();
    return Object.entries(PROVIDER_ENV).map(([provider, env]) => ({ provider, stored: provider in stored, fromEnvironment: !!process.env[env], env }));
  },
  set(provider: string, key: string) {
    if (!safeStorage.isEncryptionAvailable()) throw Object.assign(new Error('No OS credential store is available. Export the provider variable before launching ATLAS instead.'), { kind: 'secrets' });
    const data = load();
    data[provider] = safeStorage.encryptString(key).toString('base64');
    save(data);
  },
  remove(provider: string) {
    const data = load();
    delete data[provider];
    save(data);
  },
};
