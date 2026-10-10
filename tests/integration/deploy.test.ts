// Staging deployment, verification, gates and rollback (manual §30–32, §40).
import { afterEach, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { applicationStage, resolveBrowser } from '@atlas/browser';
import { DeployManager, stagingStage } from '@atlas/deploy';
import { forTask, sampleSlugifyScript, SAMPLE_FIX, type FakeScript } from '@atlas/runtime-fake';
import { detectSandbox } from '@atlas/terminal';
import { loadConfig } from '@atlas/workspace';
import { sampleRepo, sh } from '../helpers';
import { autoDecide, makeOrchestrator, startMission } from './harness';

const ready = detectSandbox().kind === 'bwrap' && !!resolveBrowser().path;
const managers: DeployManager[] = [];
afterEach(async () => { for (const m of managers.splice(0)) await m.shutdown(); });

function setup(scripts: FakeScript[] = [sampleSlugifyScript], dataDir?: string, secrets: Record<string, string> = {}) {
  const h = makeOrchestrator({ scripts, dataDir, stages: [] });
  const mgr = new DeployManager({ repo: h.repo, dataDir: h.dataDir, secrets: () => secrets, isolation: () => ({ mode: 'sandbox', detail: 'bwrap' }), log: () => {} });
  managers.push(mgr);
  h.orch.addStage(applicationStage());
  h.orch.addStage(stagingStage(mgr));
  return { h, mgr };
}

describe.skipIf(!ready)('staging', () => {
  it('deploys the integrated commit locally, verifies it independently and records a hashed manifest', async () => {
    const root = sampleRepo();
    const { h } = setup();
    h.repo.setSetting('deploy.allowedTargets', ['local-staging']);
    const id = await (async () => { const p = startMission(h, root, { targetEnvironment: 'local-staging' }); return p; })();
    const stop = autoDecide(h, id, 'staging_deploy');
    await h.orch.settle(id);
    stop();
    const m = h.repo.mission(id)!;
    const checks = Object.fromEntries(h.repo.checks(id).map((c) => [c.name, c]));
    for (const n of ['deploy', 'staging:revision', 'staging:ready', 'staging:traffic', 'staging:api:slug-endpoint', 'staging:browser:make-a-slug']) expect(checks[n]?.result, n).toBe('pass');
    expect(checks['staging:revision'].reason).toBe(`Serving ${m.integrationCommit!.slice(0, 12)}`);
    const dep = h.repo.deployments({ missionId: id })[0];
    expect(dep).toMatchObject({ status: 'live', verified: true, revision: m.integrationCommit, provider: 'local' });
    expect(h.events.find((e) => e.type === 'staging.check')!.payload).toMatchObject({ verified: true, manifestSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(m.outcome).toMatch(/^Verified/);
    // The deployment approval was a single-use human decision.
    expect(h.repo.approvals(id).find((a) => a.tool === 'staging_deploy')).toMatchObject({ status: 'approved', capability: 'deploy.staging', scope: 'once' });
  });

  it('a deployment reporting the wrong revision blocks completion and is rolled back to the last verified one', async () => {
    const root = sampleRepo();
    const { h, mgr } = setup();
    h.repo.setSetting('deploy.allowedTargets', ['local-staging']);
    const first = await startMission(h, root, { targetEnvironment: 'local-staging' });
    let stop = autoDecide(h, first, 'staging_deploy');
    await h.orch.settle(first);
    stop();
    const good = h.repo.deployments({ missionId: first })[0];
    expect(good.verified).toBe(true);

    // Second mission: the server reports a hard-coded revision instead of the real one.
    const lying = forTask('implement', [
      { tool: 'write_file', args: { path: 'src/slugify.js', content: SAMPLE_FIX } },
      { tool: 'write_file', args: { path: 'server.js', content: (await import('node:fs')).readFileSync(path.join(root, 'server.js'), 'utf8').replace("process.env.ATLAS_REVISION ?? 'unknown'", "'deadbeefcafe'") } },
      { claim: 'Deployed version is correct.' },
    ]);
    (h.orch as any).o.runtimes.fake = new (await import('@atlas/runtime-fake')).FakeRuntime([lying]);
    const second = await startMission(h, root, { targetEnvironment: 'local-staging' });
    stop = autoDecide(h, second, 'staging_deploy');
    await h.orch.settle(second);
    stop();
    const checks = Object.fromEntries(h.repo.checks(second).map((c) => [c.name, c]));
    expect(checks['staging:revision'].result).toBe('fail');
    expect(checks['staging:revision'].reason).toMatch(/target reports deadbeefcafe/);
    expect(h.repo.mission(second)!.state).toBe('failed');
    const rb = h.events.find((e) => e.type === 'rollback.result' && e.missionId === second)!;
    expect(rb.payload).toMatchObject({ attempted: true, ok: true, to: good.id, revisionConfirmed: true });
    expect(h.repo.liveDeployment('local-staging')!.id).toBe(good.id);
    expect(h.repo.deployments({ missionId: second })[0].status).toBe('rolled_back');
    void mgr;
  });

  it('refuses targets the operator has not allowlisted, and honors a declined approval', async () => {
    const root = sampleRepo();
    const { h } = setup();
    const a = await startMission(h, root, { targetEnvironment: 'local-staging' });
    await h.orch.settle(a);
    expect(h.repo.checks(a).find((c) => c.name === 'deploy')).toMatchObject({ result: 'skipped', reason: expect.stringMatching(/allowlist/) });
    expect(h.repo.deployments().length).toBe(0);

    h.repo.setSetting('deploy.allowedTargets', ['local-staging']);
    const b = await startMission(h, root, { targetEnvironment: 'local-staging' });
    const stop = autoDecide(h, b, 'staging_deploy', 'deny');
    await h.orch.settle(b);
    stop();
    expect(h.repo.checks(b).find((c) => c.name === 'deploy')).toMatchObject({ result: 'skipped', reason: 'Operator declined the deployment' });
    expect(h.repo.mission(b)!.state).toBe('failed');
    expect(h.repo.deployments().length).toBe(0);
  });

  it('command provider: secrets reach only the deploy command and never the record', async () => {
    const root = sampleRepo();
    // A stand-in staging service the deploy CLI "publishes" to.
    const srv = http.createServer((q, s) => { s.end(q.url === '/version' ? JSON.stringify({ revision: 'unknown' }) : 'ok'); }).listen(0, '127.0.0.1');
    await new Promise((r) => srv.once('listening', r));
    const port = (srv.address() as any).port;
    writeFileSync(path.join(root, 'deploy.js'), `const t = process.env.STAGING_TOKEN; console.log('token-present=' + (t ? t.length : 0)); console.log('token=' + t); console.log('Deployed url=http://127.0.0.1:${port} id=cmd-42');`);
    const cfg = JSON.parse((await import('node:fs')).readFileSync(path.join(root, 'atlas.config.json'), 'utf8'));
    cfg.deploy = { target: 'cmd-staging', provider: 'command', command: ['node', 'deploy.js'], urlPattern: 'url=(\\S+)', idPattern: 'id=(\\S+)', versionPath: '/version', readyPath: '/', syntheticRequests: 2 };
    writeFileSync(path.join(root, 'atlas.config.json'), JSON.stringify(cfg, null, 2));
    sh(root, 'git', ['add', '-A']); sh(root, 'git', ['commit', '-q', '-m', 'command deploy']);
    expect(loadConfig(root).error).toBeNull();
    const secret = 'stg_tok_secretvalue_0123456789';
    const { h } = setup([sampleSlugifyScript], undefined, { STAGING_TOKEN: secret });
    h.repo.setSetting('deploy.allowedTargets', ['cmd-staging']);
    const id = await startMission(h, root, { targetEnvironment: 'cmd-staging' });
    const stop = autoDecide(h, id, 'staging_deploy');
    await h.orch.settle(id);
    stop();
    srv.close();
    const deployCheck = h.repo.checks(id).find((c) => c.name === 'deploy')!;
    expect(deployCheck.result).toBe('pass');
    const log = h.artifacts.read(deployCheck.artifactId!).text;
    expect(log).toContain(`token-present=${secret.length}`);
    expect(log).not.toContain(secret);
    expect(JSON.stringify(h.repo.eventsSince(id, 0))).not.toContain(secret);
    expect(h.repo.deployments({ missionId: id })[0]).toMatchObject({ externalId: 'cmd-42', url: `http://127.0.0.1:${port}` });
    // The stand-in service cannot prove the revision: staging verification fails closed.
    expect(h.repo.checks(id).find((c) => c.name === 'staging:revision')!.result).toBe('inconclusive');
    expect(h.repo.mission(id)!.state).toBe('failed');
  });

  it('a crash mid-deploy is reconciled to unknown and never silently redeployed', async () => {
    const root = sampleRepo();
    const { h, mgr } = setup();
    h.repo.setSetting('deploy.allowedTargets', ['local-staging']);
    const id = await startMission(h, root, { targetEnvironment: 'local-staging' });
    // Let the mission reach the approval, then simulate a crash after intent was recorded.
    for (let i = 0; i < 400 && !h.repo.approvals(id).some((a) => a.tool === 'staging_deploy'); i++) await new Promise((r) => setTimeout(r, 25));
    const commit = h.repo.mission(id)!.integrationCommit!;
    h.repo.insertDeployment({ id: 'dep_crashcrash01', missionId: id, target: 'local-staging', provider: 'local', revision: commit, url: null, externalId: null, status: 'deploying', verified: false, releaseDir: null, previousId: null, detail: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await h.orch.cancelMission(id);
    const r = await mgr.reconcile(() => loadConfig(root).config);
    expect(r.unknown).toEqual(['dep_crashcrash01']);
    expect(h.repo.deployment('dep_crashcrash01')!.status).toBe('unknown');
    // Re-running the stage for the same commit surfaces the unknown deployment instead of deploying again.
    const before = h.repo.deployments().length;
    const stage = stagingStage(mgr);
    const checks: any[] = [];
    await stage.run({
      mission: { ...h.repo.mission(id)!, targetEnvironment: 'local-staging' } as any, worktree: root, commit, signal: new AbortController().signal,
      sandbox: {} as any, putArtifact: () => ({ id: 'art_x' }) as any, emit: () => {}, setting: (_k: string, f: any) => f,
      check: (c: any) => { checks.push(c); return c; }, requestApproval: async () => { throw new Error('must not ask'); },
      repoDeployments: (mid: string) => h.repo.deployments({ missionId: mid }), repoDeployment: (x: string) => h.repo.deployment(x),
    } as any);
    expect(checks).toMatchObject([{ name: 'deploy', result: 'inconclusive', reason: expect.stringMatching(/did not finish; its state is unknown/) }]);
    expect(h.repo.deployments().length).toBe(before);
  });
});
