import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { AtlasConfig, CONFIG_FILE } from '@atlas/contracts';

/** Read and validate a repository's atlas.config.json. Invalid config is reported, never half-applied. */
export function loadConfig(dir: string): { config: AtlasConfig | null; error: string | null } {
  const f = path.join(dir, CONFIG_FILE);
  if (!existsSync(f)) return { config: null, error: null };
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return { config: null, error: `${CONFIG_FILE} is not valid JSON: ${(e as Error).message}` }; }
  const r = AtlasConfig.safeParse(raw);
  if (!r.success) return { config: null, error: `${CONFIG_FILE}: ${r.error.issues.slice(0, 5).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}` };
  return { config: r.data, error: null };
}
