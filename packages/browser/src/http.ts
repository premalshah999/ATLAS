import net from 'node:net';

/** A free local TCP port. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const p = (srv.address() as net.AddressInfo).port; srv.close(() => resolve(p)); });
  });
}

/** Poll a URL until it answers 2xx/3xx or the deadline passes. */
export async function waitReady(url: string, timeoutMs: number, signal?: AbortSignal, alive?: () => boolean): Promise<{ ok: boolean; status: number | null; ms: number; detail: string }> {
  const t0 = Date.now();
  let last = 'no response';
  while (Date.now() - t0 < timeoutMs) {
    if (signal?.aborted) return { ok: false, status: null, ms: Date.now() - t0, detail: 'cancelled' };
    if (alive && !alive()) return { ok: false, status: null, ms: Date.now() - t0, detail: 'process exited before becoming ready' };
    try {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
      if (r.status < 400) return { ok: true, status: r.status, ms: Date.now() - t0, detail: `${r.status}` };
      last = `HTTP ${r.status}`;
    } catch (e) { last = (e as Error).message; }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false, status: null, ms: Date.now() - t0, detail: `not ready after ${timeoutMs} ms (${last})` };
}

export interface ApiResult { ok: boolean; status: number | null; latencyMs: number; message: string; bodySample: string }

export async function apiRequest(base: string, c: { method: string; path: string; body?: string; headers?: Record<string, string>; expectStatus: number; bodyIncludes?: string; maxLatencyMs?: number }): Promise<ApiResult> {
  const t0 = Date.now();
  try {
    const r = await fetch(new URL(c.path, base), { method: c.method, body: c.body, headers: c.headers, redirect: 'manual', signal: AbortSignal.timeout(Math.max(5000, (c.maxLatencyMs ?? 0) * 3)) });
    const text = await r.text();
    const latencyMs = Date.now() - t0;
    const problems: string[] = [];
    if (r.status !== c.expectStatus) problems.push(`status ${r.status}, expected ${c.expectStatus}`);
    if (c.bodyIncludes && !text.includes(c.bodyIncludes)) problems.push(`body does not include "${c.bodyIncludes}"`);
    if (c.maxLatencyMs && latencyMs > c.maxLatencyMs) problems.push(`latency ${latencyMs} ms > ${c.maxLatencyMs} ms`);
    return { ok: !problems.length, status: r.status, latencyMs, message: problems.length ? problems.join('; ') : `${r.status} in ${latencyMs} ms`, bodySample: text.slice(0, 2000) };
  } catch (e) {
    return { ok: false, status: null, latencyMs: Date.now() - t0, message: (e as Error).message, bodySample: '' };
  }
}
