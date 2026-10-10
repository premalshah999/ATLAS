// Secret redaction (manual §24). Applied to every event payload, log artifact and export.
const PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{10,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{16,}/g,
  /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|APIKEY)[A-Z0-9_]*)=([^\s'"]{4,})/g,
];

const known = new Set<string>();

/** Register a value that must never appear in output (e.g. an injected credential). */
export function registerSecret(value: string | undefined | null): void {
  if (value && value.length >= 6) known.add(value);
}

export function redact(text: string): string {
  let out = text;
  for (const v of known) out = out.split(v).join('[REDACTED]');
  for (const re of PATTERNS) {
    out = out.replace(re, (m, a: string | undefined) => {
      if (re.source.startsWith('\\b([A-Z0-9_]*')) return `${a}=[REDACTED]`;
      if (a === 'Bearer') return 'Bearer [REDACTED]';
      return '[REDACTED]';
    });
  }
  return out;
}

export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      o[k] = /secret|token|password|api[_-]?key|authorization/i.test(k) && typeof v === 'string' ? '[REDACTED]' : redactDeep(v);
    }
    return o as T;
  }
  return value;
}
