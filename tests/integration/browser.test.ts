// Browser QA and API checks against the real sample app, started in the sandbox (manual §25, §28, §37).
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { applicationStage, BrowserSession, resolveBrowser, startApp } from '@atlas/browser';
import { forTask, sampleSlugifyScript, type FakeScript } from '@atlas/runtime-fake';
import { detectSandbox } from '@atlas/terminal';
import { sampleRepo, sh, tmpDir } from '../helpers';
import { makeOrchestrator, startMission } from './harness';

const ready = !!resolveBrowser().path && detectSandbox().kind === 'bwrap';

describe.skipIf(!ready)('application stage', () => {
  it('a UI regression fails the browser flow with a screenshot, and the API check fails too', async () => {
    const root = sampleRepo();
    const liar: FakeScript = forTask('implement', [{ tool: 'read_file', args: { path: 'src/slugify.js' } }, { claim: 'Looks fine.' }]);
    const h = makeOrchestrator({ scripts: [liar], stages: [applicationStage()] });
    const id = await startMission(h, root);
    await h.orch.settle(id);
    const checks = Object.fromEntries(h.repo.checks(id).map((c) => [c.name, c]));
    expect(checks['browser:make-a-slug'].result).toBe('fail');
    expect(checks['browser:make-a-slug'].reason).toMatch(/expected "whats-new-atlas" in #slug; found "What's-new,-ATLAS\?"/);
    expect(checks['api:slug-endpoint'].result).toBe('fail');
    expect(checks['api:health'].result).toBe('pass');
    const shots = h.artifacts.list(id).filter((a) => a.kind === 'screenshot');
    expect(shots.some((a) => /failed/.test(a.name))).toBe(true);
    expect(h.artifacts.readBytes(shots[0].id).bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(h.repo.mission(id)!.state).toBe('failed');
  });

  it('the fixed app passes API checks and the browser flow, with a trace recorded', async () => {
    const root = sampleRepo();
    const h = makeOrchestrator({ scripts: [sampleSlugifyScript], stages: [applicationStage()] });
    const id = await startMission(h, root);
    await h.orch.settle(id);
    const checks = h.repo.checks(id);
    expect(checks.filter((c) => /^(api|browser):/.test(c.name)).map((c) => [c.name, c.result])).toEqual([
      ['api:slug-endpoint', 'pass'], ['api:health', 'pass'], ['browser:make-a-slug', 'pass'], ['browser:make-a-slug:console', 'pass'],
    ]);
    expect(h.artifacts.list(id).some((a) => a.kind === 'trace' && a.size > 1000)).toBe(true);
    expect(h.repo.mission(id)!.outcome).toMatch(/^Verified: tests, api:slug-endpoint, api:health, browser:make-a-slug, browser:make-a-slug:console passed/);
    // The app ran in the sandbox: nothing it did touched the user's checkout.
    expect(sh(root, 'git', ['status', '--porcelain'])).toBe('');
  });

  it('blocks navigation to other origins and reports console errors', async () => {
    const dir = tmpDir();
    writeFileSync(path.join(dir, 'server.js'), `require('http').createServer((q, s) => { s.setHeader('content-type','text/html'); s.end(q.url === '/' ? '<a id=x href="https://example.com/">out</a><script>console.error("boom from page")</script>' : 'ok'); }).listen(process.env.PORT, '127.0.0.1');`);
    const sandbox = {
      available: true, detail: '',
      run: async () => { throw new Error('unused'); },
      start: async (o: any) => {
        const { startProcess } = await import('@atlas/terminal');
        return startProcess({ command: o.command, args: o.args, cwd: dir, env: { PATH: process.env.PATH!, ...o.env } });
      },
    };
    const app = await startApp(sandbox as any, { start: ['node', 'server.js'], readyPath: '/', readyTimeoutSec: 10, env: {} });
    const s = new BrowserSession(app.baseUrl);
    try {
      await s.open();
      expect((await s.step({ action: 'goto', path: '/' })).ok).toBe(true);
      await s.step({ action: 'click', selector: '#x' });
      expect(s.observed.blockedNavigations).toEqual(['https://example.com/']);
      expect(s.observed.consoleErrors).toContain('boom from page');
      expect(s.page!.url()).not.toContain('example.com'); // Chromium shows its own error page for the aborted navigation
    } finally { await s.close(); await app.stop(); }
  });

  it('the browser_qa role drives the app through browser_action', async () => {
    const root = sampleRepo();
    const { createBrowserTool } = await import('@atlas/browser');
    const qa: FakeScript = forTask('qa', [
      { tool: 'browser_action', args: { step: { action: 'goto', path: '/' } } },
      { tool: 'browser_action', args: { step: { action: 'fill', selector: '#title', value: 'Hello World' } } },
      { tool: 'browser_action', args: { step: { action: 'click', text: 'Make slug' } } },
      { tool: 'browser_action', args: { step: { action: 'expectText', selector: '#slug', text: 'Hello-World' } } },
      { tool: 'browser_action', args: { step: { action: 'goto', path: 'https://evil.example/' } } },
      { claim: 'Observed the current behavior.' },
    ], 'browser_qa');
    const plan = { summary: 'qa', scope: 'app', tasks: [{ key: 'qa', title: 'Explore the app', role: 'browser_qa', dependsOn: [], acceptance: ['observed'], tools: ['browser_action'], risk: 'low' }], verification: [] };
    const h = makeOrchestrator({ scripts: [qa], planner: () => plan });
    (h.orch as any).o.toolFactories = { browser_action: (c: any) => createBrowserTool({ worktree: c.worktree, sandbox: c.sandbox, putScreenshot: (n: string, png: Buffer) => c.putArtifact({ kind: 'screenshot', name: n, bytes: png }).id, emit: (p: any, ids: string[]) => c.emit('browser.step', p, ids) }) };
    const id = await startMission(h, root);
    await h.orch.settle(id);
    const results = h.events.filter((e) => e.type === 'agent.tool_result' && e.payload.tool === 'browser_action').map((e) => e.payload.ok);
    expect(results).toEqual([true, true, true, true, false]); // the off-origin goto is rejected by the step schema
    expect(h.events.filter((e) => e.type === 'browser.step').length).toBe(4);
  });
});
