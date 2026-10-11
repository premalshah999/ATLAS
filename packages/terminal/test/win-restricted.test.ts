// ADR 0016 experiment (Windows only, operator-approved): which restricted-token configuration lets Node's piped child
// processes work while keeping the sandbox properties ATLAS needs? Each variant runs one probe and the results are
// printed as a table. This test asserts nothing about the outcome; it gathers the evidence for the decision, and the
// chosen mode must then pass the full sandbox suite before ATLAS uses it.
import { execFileSync, spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as win from '../src/win/appcontainer';
import { tmpDir } from '../../../tests/helpers';

const PROBE = String.raw`
const fs = require('fs'), net = require('net'), cp = require('child_process');
const [home, outside, pub] = process.argv.slice(2);
const out = {};
const tryDo = (k, f) => { try { out[k] = f(); } catch (e) { out[k] = 'ERR ' + (e.code || e.message); } };
tryDo('readHome', () => 'READ ' + fs.readFileSync(home, 'utf8'));
tryDo('readOutside', () => 'READ ' + fs.readFileSync(outside + '/canary.txt', 'utf8'));
tryDo('writeRoot', () => { fs.writeFileSync('w.txt', 'x'); return 'WROTE'; });
tryDo('writeOutside', () => { fs.writeFileSync(outside + '/x.txt', 'x'); return 'WROTE'; });
tryDo('writePublic', () => { fs.writeFileSync(pub, 'x'); fs.unlinkSync(pub); return 'WROTE'; });
tryDo('childPipe', () => { const r = cp.spawnSync(process.execPath, ['-e', 'console.log(7)'], { stdio: 'pipe', timeout: 5000 }); return r.error ? 'ERR ' + r.error.code : 'exit ' + r.status + ' out ' + String(r.stdout).trim(); });
tryDo('childIgnore', () => { const r = cp.spawnSync(process.execPath, ['-e', '0'], { stdio: 'ignore', timeout: 5000 }); return r.error ? 'ERR ' + r.error.code : 'exit ' + r.status; });
const b = String.fromCharCode(92);
const pipeName = b + b + '.' + b + 'pipe' + b + 'atlas-r-' + process.pid;
const s = net.createServer();
s.on('error', (e) => { out.globalPipe = 'ERR ' + e.code; netTest(); });
s.listen(pipeName, () => { out.globalPipe = 'ok'; s.close(); netTest(); });
function netTest() {
  const c = net.connect({ host: '140.82.112.3', port: 443 });
  const t = setTimeout(() => { out.network = 'timeout'; c.destroy(); done(); }, 4000);
  c.on('connect', () => { clearTimeout(t); out.network = 'CONNECTED'; c.destroy(); done(); });
  c.on('error', (e) => { clearTimeout(t); out.network = 'ERR ' + e.code; done(); });
}
function done() { console.log('RESULT ' + JSON.stringify(out)); process.exit(0); }
`;

describe.skipIf(process.platform !== 'win32')('ADR 0016: restricted-token variants (diagnostic)', () => {
  it('reports pipes, network and file access per variant', () => {
    const helper = win.ensureHelper();
    const root = tmpDir();
    const outside = tmpDir();
    writeFileSync(path.join(outside, 'canary.txt'), 'CANARY-SECRET');
    const homeCanary = path.join(os.homedir(), `.atlas-rcanary-${process.pid}`);
    writeFileSync(homeCanary, 'HOME-CANARY');
    writeFileSync(path.join(root, 'probe.cjs'), PROBE);
    const logon = execFileSync(helper, ['logonsid'], { encoding: 'utf8' }).trim();
    const custom = win.capabilitySid(`atlasRoot.${process.pid}`);
    // The root: writable for the logon SID (normal check) and this sandbox's own SID (restricting check), low label.
    execFileSync('icacls', [root, '/grant', `*${logon}:(OI)(CI)M`, '/grant', `*${custom}:(OI)(CI)M`, '/C', '/Q'], { stdio: 'pipe' });
    execFileSync('icacls', [root, '/setintegritylevel', '(OI)(CI)low', '/C', '/Q'], { stdio: 'pipe' });
    const pub = path.join(process.env.PUBLIC ?? 'C:\\Users\\Public', `atlas-r-${process.pid}.txt`);
    const variants: [string, string, boolean][] = [
      ['A everyone+users+authusers+logon+own, low', `everyone,users,authusers,logon,${custom}`, true],
      ['B everyone+users+authusers+logon+own, medium', `everyone,users,authusers,logon,${custom}`, false],
      ['C users+logon+own, low', `users,logon,${custom}`, true],
      ['D logon+restricted+own, low', `logon,restricted,${custom}`, true],
      ['E no restricting SIDs, low', '', true],
    ];
    const report: string[] = [`logon SID ${logon}; own SID ${custom}`];
    try {
      for (const [label, sids, low] of variants) {
        const cmdline = `${win.quoteArg(process.execPath)} probe.cjs ${win.quoteArg(homeCanary)} ${win.quoteArg(outside)} ${win.quoteArg(pub)}`;
        const r = spawnSync(helper, ['run', '-', '--restricted', sids || ',', ...(low ? ['--low'] : []), '--cmdline', cmdline], { cwd: root, encoding: 'utf8', timeout: 40_000 });
        const line = (r.stdout ?? '').split(/\r?\n/).find((l) => l.startsWith('RESULT ')) ?? '';
        report.push(`--- ${label}: exit ${r.status}${r.error ? ' ' + (r.error as NodeJS.ErrnoException).code : ''}\n${line || `(no result) stdout: ${(r.stdout ?? '').slice(0, 300)} stderr: ${(r.stderr ?? '').slice(0, 300)}`}`);
      }
    } finally {
      rmSync(homeCanary, { force: true });
    }
    console.log(`[restricted]\n${report.join('\n')}`);
    expect(report.length).toBe(variants.length + 1);
  }, 300_000);
});
