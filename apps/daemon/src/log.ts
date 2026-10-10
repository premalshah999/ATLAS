// Operational log (JSON lines), kept separate from the user-visible audit trail (manual §38).
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { redactDeep } from '@atlas/contracts';

export function createLogger(dir: string) {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'daemon.log');
  const write = (level: 'info' | 'warn' | 'error', msg: string, data: Record<string, unknown> = {}) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...redactDeep(data) });
    try { appendFileSync(file, line + '\n'); } catch { /* disk full: logging never takes the daemon down */ }
    if (level !== 'info') process.stderr.write(line + '\n');
  };
  return { info: (m: string, d?: Record<string, unknown>) => write('info', m, d), warn: (m: string, d?: Record<string, unknown>) => write('warn', m, d), error: (m: string, d?: Record<string, unknown>) => write('error', m, d) };
}
export type Logger = ReturnType<typeof createLogger>;
