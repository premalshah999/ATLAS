// Release stage: start the integrated app in the sandbox, run API checks and browser flows against it,
// and record each as evidence (manual §25, §28, §37).
import os from 'node:os';
import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import type { AtlasConfig, ReleaseStage, StageContext } from '@atlas/contracts';
import { loadConfig } from '@atlas/workspace';
import { BrowserSession } from './session';
import { startApp } from './app';
import { apiRequest } from './http';
import { resolveBrowser } from './resolve';

export function applicationStage(): ReleaseStage & { preflight(root: string): { level: 'block' | 'warn' | 'info'; message: string } | null } {
  return {
    name: 'application',
    preflight(root) {
      const { config, error } = loadConfig(root);
      if (error) return { level: 'warn', message: `${error} — application checks will be skipped.` };
      if (!config?.app) return { level: 'info', message: 'No app section in atlas.config.json: browser QA and API checks will not run.' };
      const b = resolveBrowser();
      const flows = config.browser?.flows.length ?? 0;
      if (flows && !b.path) return { level: 'warn', message: `${flows} browser flow${flows === 1 ? '' : 's'} configured but ${b.detail}` };
      return { level: 'info', message: `App "${config.app.start.join(' ')}" will run in the sandbox with network access so the browser can reach it: ${flows} browser flow${flows === 1 ? '' : 's'}, ${config.api.length} API check${config.api.length === 1 ? '' : 's'}.` };
    },
    applies(ctx) {
      const { config } = loadConfig(ctx.worktree);
      return !!config?.app && ((config.browser?.flows.length ?? 0) > 0 || config.api.length > 0);
    },
    async run(ctx) {
      const { config } = loadConfig(ctx.worktree) as { config: AtlasConfig };
      await runApplicationChecks(ctx, config, { label: 'local', env: { ATLAS_REVISION: ctx.commit } });
    },
  };
}

/** Shared by local QA and staging verification: API checks + browser flows against `baseUrl` (or a freshly started app). */
export async function runApplicationChecks(ctx: StageContext, config: AtlasConfig, o: { label: string; baseUrl?: string; env?: Record<string, string>; allowedOrigins?: string[] }) {
  const prefix = o.label === 'local' ? '' : `${o.label}:`;
  let app: Awaited<ReturnType<typeof startApp>> | null = null;
  let baseUrl = o.baseUrl;
  if (!baseUrl) {
    try {
      app = await startApp(ctx.sandbox, config.app!, { env: o.env, signal: ctx.signal });
      baseUrl = app.baseUrl;
      ctx.emit('browser.step', { phase: 'app', status: 'ready', url: baseUrl, pid: app.pid });
    } catch (e) {
      const log = ctx.putArtifact({ kind: 'log', name: 'App start failure', content: (e as Error).message });
      ctx.check({ name: `${prefix}app`, command: config.app!.start.join(' '), required: true, result: 'fail', exitCode: null, durationMs: null, reason: (e as Error).message.split('\n')[0], artifactId: log.id });
      return;
    }
  }
  try {
    for (const c of config.api) {
      const r = await apiRequest(baseUrl, c);
      const log = ctx.putArtifact({ kind: 'evidence', name: `API ${c.name}`, content: JSON.stringify({ request: { method: c.method, path: c.path }, ...r }, null, 2) });
      ctx.check({ name: `${prefix}api:${c.name}`, command: `${c.method} ${c.path}`, required: c.required, result: r.ok ? 'pass' : 'fail', exitCode: r.status, durationMs: r.latencyMs, reason: r.message, artifactId: log.id });
    }
    const flows = config.browser?.flows ?? [];
    if (flows.length) {
      const exe = resolveBrowser();
      if (!exe.path) {
        for (const f of flows) ctx.check({ name: `${prefix}browser:${f.name}`, command: null, required: f.required, result: 'inconclusive', exitCode: null, durationMs: null, reason: exe.detail, artifactId: null });
        return;
      }
      for (const flow of flows) await runFlow(ctx, flow, baseUrl, prefix, config.browser!.failOnConsoleErrors, o.allowedOrigins ?? []);
    }
  } finally {
    if (app) {
      ctx.putArtifact({ kind: 'log', name: `${o.label} app log`, content: app.logs() });
      await app.stop();
    }
  }
}

async function runFlow(ctx: StageContext, flow: NonNullable<AtlasConfig['browser']>['flows'][number], baseUrl: string, prefix: string, failOnConsole: boolean, allowedOrigins: string[]) {
  const s = new BrowserSession(baseUrl, allowedOrigins);
  const t0 = Date.now();
  const tracePath = path.join(os.tmpdir(), `atlas-trace-${process.pid}-${Date.now()}.zip`);
  const results: { action: string; ok: boolean; message: string; ms: number; url: string; screenshot?: string }[] = [];
  let failed: string | null = null;
  try {
    await s.open({ trace: true });
    for (const step of flow.steps) {
      if (ctx.signal.aborted) { failed = 'cancelled'; break; }
      const r = await s.step(step);
      let shot: string | undefined;
      if (r.screenshot) shot = ctx.putArtifact({ kind: 'screenshot', name: `${flow.name} · ${step.action}${r.ok ? '' : ' (failed)'}`, bytes: r.screenshot }).id;
      results.push({ action: step.action, ok: r.ok, message: r.message, ms: r.durationMs, url: r.url, screenshot: shot });
      ctx.emit('browser.step', { flow: flow.name, action: step.action, ok: r.ok, message: r.message, url: r.url }, shot ? [shot] : []);
      if (!r.ok) { failed = `${step.action}: ${r.message}`; break; }
    }
  } catch (e) {
    failed = (e as Error).message.split('\n')[0];
  } finally {
    await s.close(tracePath);
  }
  const ids: string[] = [];
  try { ids.push(ctx.putArtifact({ kind: 'trace', name: `${flow.name} · Playwright trace`, bytes: readFileSync(tracePath) }).id); rmSync(tracePath, { force: true }); } catch { /* no trace */ }
  const report = ctx.putArtifact({ kind: 'evidence', name: `Browser flow ${flow.name}`, content: JSON.stringify({ flow: flow.name, baseUrl, steps: results, observed: s.observed, trace: ids[0] ?? null }, null, 2) });
  ctx.check({ name: `${prefix}browser:${flow.name}`, command: `${flow.steps.length} steps`, required: flow.required, result: failed ? 'fail' : 'pass', exitCode: null, durationMs: Date.now() - t0, reason: failed ?? `${results.length} steps passed`, artifactId: report.id });
  const errs = [...s.observed.pageErrors, ...s.observed.consoleErrors];
  if (failOnConsole) {
    ctx.check({ name: `${prefix}browser:${flow.name}:console`, command: null, required: true, result: errs.length ? 'fail' : 'pass', exitCode: null, durationMs: null, reason: errs.length ? `${errs.length} console/page error(s): ${errs[0]}` : 'No console or page errors', artifactId: report.id });
  }
}
