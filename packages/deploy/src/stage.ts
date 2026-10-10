// Staging deployment + verification stage (manual §30–32). Verification is independent of the deploy
// call's success: exact revision, readiness, API and browser checks, synthetic traffic, logs.
// Unknown version or missing evidence fails closed. A failed verification triggers a verified rollback.
import { createHash } from 'node:crypto';
import type { AtlasConfig, ReleaseStage, StageContext } from '@atlas/contracts';
import { loadConfig } from '@atlas/workspace';
import { runApplicationChecks, waitReady } from '@atlas/browser';
import { matchesRevision, readRevision, type DeployManager } from './manager';

export function stagingStage(mgr: DeployManager): ReleaseStage & { preflight(root: string): { level: 'block' | 'warn' | 'info'; message: string } | null } {
  return {
    name: 'staging',
    preflight(root) {
      const { config } = loadConfig(root);
      if (!config?.deploy) return { level: 'info', message: 'No deploy section in atlas.config.json: staging deployment is not available for this project.' };
      const t = config.deploy.target;
      if (!mgr.allowed(t)) return { level: 'info', message: `Staging target "${t}" (${config.deploy.provider}) is configured but not allowlisted. Allow it in Settings to deploy.` };
      return { level: 'info', message: `Staging target "${t}" (${config.deploy.provider}) is allowlisted. Deploying asks for your approval each time.${config.deploy.versionPath ? '' : ' No versionPath: staging verification will be inconclusive.'}` };
    },
    applies(ctx) { return !!ctx.mission.targetEnvironment; },
    async run(ctx) {
      const target = ctx.mission.targetEnvironment!;
      const { config, error } = loadConfig(ctx.worktree);
      const fail = (name: string, reason: string, result: 'fail' | 'inconclusive' | 'skipped' = 'fail') =>
        ctx.check({ name, command: null, required: true, result, exitCode: null, durationMs: null, reason, artifactId: null });
      if (!config?.deploy || config.deploy.target !== target) return void fail('deploy', error ?? `Target "${target}" is not defined in atlas.config.json`);
      if (!mgr.allowed(target)) return void fail('deploy', `Target "${target}" is not on the operator's allowlist (Settings → Deployment targets)`, 'skipped');

      // Never deploy the same mission commit twice; an unfinished earlier attempt is surfaced, not retried.
      const prior = ctx.repoDeployments?.(ctx.mission.id).find((d) => d.revision === ctx.commit && d.target === target);
      if (prior?.status === 'unknown' || prior?.status === 'deploying') {
        return void fail('deploy', `An earlier deployment of this commit (${prior.id}) did not finish; its state is unknown. Check the target, then re-run verification.`, 'inconclusive');
      }

      const cfg = config.deploy;
      let dep = prior?.status === 'live' ? prior : null;
      if (!dep) {
        const decision = await ctx.requestApproval({
          tool: 'staging_deploy', capability: 'deploy.staging', action: `Deploy ${ctx.commit.slice(0, 12)} to ${target} (${cfg.provider})`,
          environment: `Staging target ${target}`, resources: cfg.provider === 'command' ? ['network', 'target secrets', target] : ['local port', target],
          reason: 'Every deployment needs an operator decision', risk: 'elevated',
        });
        if (decision.status !== 'approved') return void fail('deploy', decision.status === 'expired' ? 'Deployment approval expired' : 'Operator declined the deployment', 'skipped');
        ctx.emit('deploy.event', { phase: 'started', target, provider: cfg.provider, revision: ctx.commit });
        let out = '';
        const r = await mgr.deployStaging({ missionId: ctx.mission.id, target, repoDir: ctx.worktree, commit: ctx.commit, config, signal: ctx.signal, onOutput: (t) => { out += t; } });
        const log = ctx.putArtifact({ kind: 'log', name: `Deploy to ${target}`, content: `${r.output || out}\n\n${r.message}` });
        ctx.emit('deploy.event', { phase: r.ok ? 'live' : 'failed', target, deploymentId: r.deployment.id, url: r.deployment.url, revision: ctx.commit, message: r.message }, [log.id]);
        ctx.check({ name: 'deploy', command: cfg.provider === 'command' ? cfg.command!.join(' ') : `local release of ${ctx.commit.slice(0, 12)}`, required: true, result: r.ok ? 'pass' : 'fail', exitCode: null, durationMs: null, reason: r.message, artifactId: log.id });
        if (!r.ok) return void ctx.emit('rollback.result', { attempted: false, reason: 'Deployment failed; the previous deployment (if any) is still live', previous: r.deployment.previousId });
        dep = r.deployment;
      }

      const verdict = await verifyStaging(ctx, mgr, config, dep.url!, dep.id);
      if (verdict.ok) { ctx.markDeployment?.(dep.id, true); return; }
      // Fail closed and roll back to the last verified deployment, then confirm what is live.
      if (ctx.setting('deploy.autoRollback', true)) {
        const rb = await mgr.rollback(target, config);
        ctx.emit('rollback.result', { attempted: true, ok: rb.ok, message: rb.message, to: rb.to?.id ?? null, toRevision: rb.to?.revision ?? null, revisionConfirmed: rb.revisionConfirmed });
        ctx.check({ name: 'staging:rollback', command: null, required: false, result: rb.ok && rb.revisionConfirmed !== false ? 'pass' : rb.ok ? 'inconclusive' : 'fail', exitCode: null, durationMs: null, reason: rb.message + (rb.revisionConfirmed === true ? ' · live revision confirmed' : rb.revisionConfirmed === false ? ' · live revision does NOT match' : ''), artifactId: null });
      } else {
        ctx.emit('rollback.result', { attempted: false, reason: 'Automatic rollback is off', available: true });
      }
    },
  };
}

export async function verifyStaging(ctx: StageContext, mgr: DeployManager, config: AtlasConfig, url: string, deploymentId: string): Promise<{ ok: boolean }> {
  const cfg = config.deploy!;
  const before = ctx.checks?.().length ?? 0;
  // 1. Exact revision.
  if (!cfg.versionPath) ctx.check({ name: 'staging:revision', command: null, required: true, result: 'inconclusive', exitCode: null, durationMs: null, reason: 'No deploy.versionPath: the deployed revision cannot be confirmed', artifactId: null });
  else {
    const v = await readRevision(url, cfg.versionPath);
    const ok = v.revision != null && matchesRevision(v.revision, ctx.commit);
    // A value that is not a commit id ("unknown", a semver) is an unknown version: inconclusive, still blocking.
    const plausible = v.revision != null && /^[0-9a-f]{7,40}$/i.test(v.revision.trim());
    ctx.check({ name: 'staging:revision', command: `GET ${cfg.versionPath}`, required: true, result: ok ? 'pass' : plausible ? 'fail' : 'inconclusive', exitCode: v.status, durationMs: null, reason: ok ? `Serving ${ctx.commit.slice(0, 12)}` : `Expected ${ctx.commit.slice(0, 12)}, target reports ${v.revision ?? `nothing (${v.raw.slice(0, 120)})`}`, artifactId: null });
  }
  // 2. Readiness.
  const ready = await waitReady(new URL(cfg.readyPath, url).toString(), cfg.readyTimeoutSec * 1000, ctx.signal);
  ctx.check({ name: 'staging:ready', command: `GET ${cfg.readyPath}`, required: true, result: ready.ok ? 'pass' : 'fail', exitCode: ready.status, durationMs: ready.ms, reason: ready.ok ? `Ready in ${ready.ms} ms` : ready.detail, artifactId: null });
  // 3. Synthetic traffic: error rate and p95 latency.
  if (cfg.syntheticRequests > 0) {
    const lat: number[] = []; let errors = 0;
    for (let i = 0; i < cfg.syntheticRequests && !ctx.signal.aborted; i++) {
      const t0 = Date.now();
      try { const r = await fetch(new URL(cfg.readyPath, url), { signal: AbortSignal.timeout(10_000) }); await r.arrayBuffer(); if (r.status >= 500) errors++; } catch { errors++; }
      lat.push(Date.now() - t0);
    }
    lat.sort((a, b) => a - b);
    const p95 = lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] ?? 0;
    const rate = lat.length ? errors / lat.length : 1;
    const problems = [rate > cfg.maxErrorRate ? `error rate ${(rate * 100).toFixed(1)}% > ${(cfg.maxErrorRate * 100).toFixed(1)}%` : '', cfg.latencyP95Ms && p95 > cfg.latencyP95Ms ? `p95 ${p95} ms > ${cfg.latencyP95Ms} ms` : ''].filter(Boolean);
    ctx.check({ name: 'staging:traffic', command: `${lat.length} × GET ${cfg.readyPath}`, required: true, result: problems.length ? 'fail' : 'pass', exitCode: null, durationMs: lat.reduce((a, b) => a + b, 0), reason: problems.length ? problems.join('; ') : `${lat.length} requests, ${errors} errors, p95 ${p95} ms`, artifactId: null });
  }
  // 4. API checks and browser flows against the deployed URL.
  await runApplicationChecks(ctx, config, { label: 'staging', baseUrl: url });
  // 5. Logs.
  const dep = ctx.repoDeployment?.(deploymentId) ?? null;
  const logs = dep ? await mgr.logs(dep, cfg, 500) : '';
  const logArt = ctx.putArtifact({ kind: 'log', name: 'Staging logs', content: logs });
  if (cfg.errorLogPattern) {
    const hits = logs.split('\n').filter((l) => new RegExp(cfg.errorLogPattern!, 'i').test(l));
    ctx.check({ name: 'staging:logs', command: `/${cfg.errorLogPattern}/`, required: true, result: hits.length ? 'fail' : 'pass', exitCode: null, durationMs: null, reason: hits.length ? `${hits.length} matching log line(s): ${hits[0].slice(0, 200)}` : 'No error lines', artifactId: logArt.id });
  }
  // 6. Evidence manifest: every staging check with its evidence hash.
  const staging = (ctx.checks?.() ?? []).slice(before);
  const manifest = { deploymentId, url, revision: ctx.commit, at: new Date().toISOString(), checks: staging.map((c) => ({ name: c.name, result: c.result, reason: c.reason, artifactId: c.artifactId })) };
  const body = JSON.stringify(manifest, null, 2);
  const sha256 = createHash('sha256').update(body).digest('hex');
  const art = ctx.putArtifact({ kind: 'manifest', name: `Staging evidence manifest · ${sha256.slice(0, 12)}`, content: body });
  const ok = staging.length > 0 && staging.filter((c) => c.required).every((c) => c.result === 'pass');
  ctx.emit('staging.check', { deploymentId, url, verified: ok, manifestSha256: sha256 }, [art.id]);
  return { ok };
}
