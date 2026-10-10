import React, { useState } from 'react';
import { actions, useApp } from '../lib/store';
import { terminals, agentById, reviewFiles, findings, sessionBefore, sessionAfter, middlewareBefore, middlewareAfter, browserActions, tasks } from '../data/sample';
import { cx, Icon, Button, IconButton, Badge, PanelHead, RoleMark, Seg, Split, Tip, SampleTag, EmptyState, Kbd, Input, Dot } from '../ui/primitives';
import { TerminalView, TermTabs, ExitChip } from '../ui/terminal';
import { DiffView, DiffStat, type ReviewComment } from '../ui/code';
import { VerificationRow, StageGlyph } from '../ui/verify';
import {
  ITerminal, ISplit, IPlus, IRecord, IHand, IFileCode, IFolder, ICheck, IClose, IOpen, IArrowRight, IReviews, ITube, IShield, ICommit, ISearch,
  IPause, IPlay, IRewind, IStep, ILock, IGlobe, IMonitor, IWindow, ICursor, ICamera, IEye, IChevronRight, IWarn, IXCircle, IFlag, IHistory,
} from '../lib/icons';

/* ---------- 7. Terminal workspace ---------- */
export function TerminalWorkspace() {
  const [left, setLeft] = useState('t-qa');
  const [right, setRight] = useState<string | null>('t-me');
  const [focus, setFocus] = useState<'l' | 'r'>('r');
  const term = useApp((s) => s.term);
  const A = actions();
  const L = terminals.find((t) => t.id === left)!;
  const R = right ? terminals.find((t) => t.id === right)! : null;
  const open = (id: string) => { if (focus === 'r' && right) setRight(id); else setLeft(id); };
  const Session = ({ id }: { id: string }) => {
    const s = terminals.find((t) => t.id === id)!; const a = s.agent ? agentById(s.agent) : null;
    const isOpen = id === left || id === right;
    return (
      <button type="button" className="at-list-row at-sess" aria-selected={isOpen} onClick={() => open(id)}>
        {a ? <RoleMark mark={a.mark} s={a.status} size="sm" /> : <RoleMark mark="YOU" size="sm" human />}
        <span className="at-col" style={{ minWidth: 0, flex: 1, gap: 1 }}><span className="at-trunc">{s.title}</span><span className="at-mono at-subtle at-trunc" style={{ fontSize: 10.5 }}>{s.command}</span></span>
        {s.status === 'running' ? <span className="at-act"><i /><i /><i /></span> : (s.exit ?? 0) > 0 ? <Dot s="failed" /> : s.status === 'exited' ? <Dot s="done" /> : <Dot s="idle" />}
      </button>
    );
  };
  return (
    <div className="at-screen at-terms">
      <aside className="at-terms-side">
        <div className="at-phead"><span className="at-label">Sessions</span><span className="at-spacer" /><IconButton icon={IPlus} label="New shell" kbd="⌃ ⇧ `" size="sm" /></div>
        <div className="at-pbody">
          <div className="at-label" style={{ padding: '12px 12px 4px' }}>Agent-managed · read-only</div>
          {terminals.filter((t) => t.owner === 'agent').map((t) => <Session key={t.id} id={t.id} />)}
          <div className="at-label" style={{ padding: '16px 12px 4px' }}>Yours</div>
          {terminals.filter((t) => t.owner === 'human').map((t) => <Session key={t.id} id={t.id} />)}
          <div className="at-label" style={{ padding: '16px 12px 4px' }}>Recordings</div>
          {['playwright · auth · 09:55', 'semgrep · 09:55', 'vitest · auth · 09:52'].map((r) => <button key={r} type="button" className="at-list-row"><Icon as={IRecord} size="sm" className="at-subtle" /><span className="at-trunc at-muted">{r}</span><Icon as={IPlay} size="sm" className="at-subtle" style={{ marginLeft: 'auto' }} /></button>)}
        </div>
      </aside>
      <div className="at-col at-grow">
        <div className="at-terms-bar">
          <TermTabs sessions={terminals} active={focus === 'r' && right ? right : left} onSelect={open} />
        </div>
        <div className="at-grow" style={{ display: 'flex' }}>
          <Split dir="h" id="terms" initial={0.5} min={280} collapsedSecond={!R}>
            <div className="at-col" style={{ height: '100%' }}>
              {L.owner === 'agent' && <div className="at-owner-strip"><RoleMark mark={agentById(L.agent!).mark} size="sm" /><span>Driven by <b>{agentById(L.agent!).name}</b> · you’re observing</span><span style={{ flex: 1 }} /><Button size="sm" variant="human" icon={IHand} onClick={() => A.toast({ tone: 'human', title: 'You took over this session', body: `${agentById(L.agent!).name} paused and will not send input until you hand back.` })}>Take over</Button></div>}
              <div className="at-grow" style={{ display: 'flex', flexDirection: 'column' }}><TerminalView s={L} extra={term[L.id]} focused={focus === 'l'} onFocus={() => setFocus('l')} onSplit={!R ? () => setRight('t-me') : undefined} /></div>
            </div>
            {R ? (
              <div className="at-col" style={{ height: '100%' }}>
                {R.owner === 'agent' && <div className="at-owner-strip"><RoleMark mark={agentById(R.agent!).mark} size="sm" /><span>Driven by <b>{agentById(R.agent!).name}</b> · you’re observing</span></div>}
                <div className="at-grow" style={{ display: 'flex', flexDirection: 'column' }}><TerminalView s={R} extra={term[R.id]} focused={focus === 'r'} onFocus={() => setFocus('r')} onClose={() => { setRight(null); setFocus('l'); }} /></div>
              </div>
            ) : <div />}
          </Split>
        </div>
      </div>
    </div>
  );
}

/* ---------- 8. Code review ---------- */
const tokensBefore = `export const REFRESH_TTL = 60 * 60 * 24 * 30;

export function newRefreshToken(userId: string) {
  return { token: randomToken(48), userId, expiresAt: addSeconds(new Date(), REFRESH_TTL) };
}`;
const tokensAfter = `export const REFRESH_TTL = 60 * 60 * 24 * 30;

export function newRefreshToken(familyId: string, ttl = REFRESH_TTL) {
  return {
    id: ulid(),
    token: randomToken(48),
    familyId,
    replacedBy: null,
    expiresAt: addSeconds(new Date(), ttl),
  };
}`;
const migration = `-- 0042_token_family.sql
ALTER TABLE refresh_tokens
  ADD COLUMN family_id   uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN replaced_by text REFERENCES refresh_tokens(id);

CREATE INDEX idx_refresh_family ON refresh_tokens (family_id)
  WHERE replaced_by IS NULL;`;

const contents: Record<string, { before: string; after: string; lang?: string; comments: ReviewComment[] }> = {
  'src/auth/session.ts': { before: sessionBefore, after: sessionAfter, comments: [
    { line: 7, author: 'Security Engineer', mark: 'SE', id: 'SEC-1', severity: 'high', resolved: true, body: <>Race fixed: <code>findForUpdate</code> holds a row lock inside the transaction. Verified by <code>concurrent-refresh.spec</code> · 50/50 runs.</> },
    { line: 12, author: 'You', mark: 'YOU', human: true, body: <>Log <code>refresh_reuse_detected</code> with the family id — we’ll want this in the security dashboard.</> },
  ] },
  'src/middleware.ts': { before: middlewareBefore, after: middlewareAfter, comments: [
    { line: 6, author: 'Security Engineer', mark: 'SE', id: 'SEC-2', severity: 'medium', body: <><code>__Host-</code> cookies must use <code>Path=/</code>. Logout at <code>/</code> can’t clear this — matches QA failure <code>auth.spec.ts:71</code>.</> },
  ] },
  'src/auth/tokens.ts': { before: tokensBefore, after: tokensAfter, comments: [{ line: 1, author: 'Security Engineer', mark: 'SE', id: 'RV-3', severity: 'low', body: <>Move the TTL into <code>config/auth.ts</code>.</> }] },
  'db/migrations/0042_token_family.sql': { before: '', after: migration, lang: 'sql', comments: [] },
};

export function Review() {
  const [file, setFile] = useState('src/auth/session.ts');
  const [mode, setMode] = useState<'split' | 'inline'>('split');
  const [verdict, setVerdict] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [hoverLine, setHoverLine] = useState<number | undefined>();
  const [hoverFile, setHoverFile] = useState<string | null>(null);
  const f = reviewFiles.find((x) => x.path === file)!;
  const c = contents[file] ?? { before: '// Generated test file — 88 lines', after: '// Generated test file — 88 lines', comments: [] };
  const a = agentById(f.agent);
  const t = tasks.find((x) => x.id === f.task);
  const groups: Record<string, typeof reviewFiles> = {};
  reviewFiles.forEach((rf) => { const d = rf.path.split('/').slice(0, -1).join('/'); (groups[d] ??= []).push(rf); });
  const total = reviewFiles.reduce((s, x) => [s[0] + x.add, s[1] + x.del], [0, 0]);
  return (
    <div className="at-screen at-review">
      <div className="at-trace-strip">
        <div className="at-ts-step"><span className="at-label">Task</span><span className="at-ts-v"><span className="at-mono at-subtle">{t?.id}</span>{t?.title}</span></div>
        <Icon as={IArrowRight} size="sm" className="at-ts-arrow" />
        <div className="at-ts-step"><span className="at-label">Agent</span><span className="at-ts-v"><RoleMark mark={a.mark} size="sm" />{a.name}</span></div>
        <Icon as={IArrowRight} size="sm" className="at-ts-arrow" />
        <div className="at-ts-step"><span className="at-label">Change</span><span className="at-ts-v">{reviewFiles.length} files <DiffStat add={total[0]} del={total[1]} blocks={false} /></span></div>
        <Icon as={IArrowRight} size="sm" className="at-ts-arrow" />
        <div className="at-ts-step"><span className="at-label">Findings</span><span className="at-ts-v"><Badge tone="danger">1 high · fixed</Badge><Badge tone="warning">1 open</Badge></span></div>
        <Icon as={IArrowRight} size="sm" className="at-ts-arrow" />
        <div className="at-ts-step"><span className="at-label">Evidence</span><span className="at-ts-v"><span className="at-ok">38 unit ✓</span><span className="at-err">QA 11/12</span></span></div>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" icon={ICommit}>3 commits</Button>
        <Button variant="primary" icon={ICheck} disabled={Object.keys(verdict).length < 2}>Approve & merge</Button>
      </div>
      <div className="at-row at-grow" style={{ alignItems: 'stretch', gap: 0 }}>
        <aside className="at-filetree">
          <div className="at-phead"><span className="at-label">Changed files</span><span className="at-mono at-subtle">{reviewFiles.length}</span><span className="at-spacer" /><Tip label="Next file" kbd="J"><span><IconButton icon={IChevronRight} label="Next file" size="sm" /></span></Tip></div>
          <div style={{ padding: 8 }}><Input icon={ISearch} placeholder="Filter files" kbd="⌘ P" /></div>
          <div className="at-pbody">
            {Object.entries(groups).map(([dir, fs]) => (
              <div key={dir}>
                <div className="at-tree-dir"><Icon as={IFolder} size="sm" />{dir}</div>
                {fs.map((rf) => {
                  const name = rf.path.split('/').pop();
                  const ag = agentById(rf.agent);
                  return (
                    <button key={rf.path} type="button" className="at-tree-file" aria-selected={rf.path === file} onClick={() => setFile(rf.path)} onMouseEnter={() => setHoverFile(rf.path)} onMouseLeave={() => setHoverFile(null)}>
                      <span className={cx('at-tree-st', rf.status === 'added' ? 'at-ok' : 'at-warn')}>{rf.status === 'added' ? 'A' : 'M'}</span>
                      <span className="at-mono at-trunc">{name}</span>
                      {verdict[rf.path] && <Icon as={verdict[rf.path] === 'accepted' ? ICheck : IClose} size="sm" className={verdict[rf.path] === 'accepted' ? 'at-ok' : 'at-err'} />}
                      <span style={{ marginLeft: 'auto' }}><DiffStat add={rf.add} del={rf.del} blocks={false} /></span>
                      {hoverFile === rf.path && <span className="at-file-tip" style={{ left: 28 }}><RoleMark mark={ag.mark} size="sm" /> {ag.name} · {rf.task} {tasks.find((x) => x.id === rf.task)?.title}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>
        <div className="at-col at-grow">
          <div className="at-diffhead">
            <Icon as={IFileCode} className="at-subtle" /><span className="at-mono" style={{ fontSize: 12 }}>{file}</span><DiffStat add={f.add} del={f.del} />
            <span className="at-subtle at-hide-narrow" style={{ fontSize: 12 }}>by {a.name} · {f.task}</span>
            {hoverLine && <span className="at-mono at-subtle" style={{ fontSize: 11 }}>L{hoverLine}</span>}
            <span style={{ flex: 1 }} />
            <Seg value={mode} onChange={setMode} items={[{ id: 'split', label: 'Split' }, { id: 'inline', label: 'Inline' }]} />
            <IconButton icon={IOpen} label="Open in external editor" kbd="⌘ ⇧ O" />
            <Button size="sm" variant="ghost" icon={IClose} onClick={() => setVerdict({ ...verdict, [file]: 'rejected' })}><span className="at-hide-narrow">Request changes</span></Button>
            <Button size="sm" icon={ICheck} onClick={() => { setVerdict({ ...verdict, [file]: 'accepted' }); const i = reviewFiles.findIndex((x) => x.path === file); if (reviewFiles[i + 1]) setFile(reviewFiles[i + 1].path); }}>Accept file</Button>
          </div>
          <div className="at-pbody" style={{ background: 'var(--bg-void)' }}>
            <DiffView key={file + mode} before={c.before} after={c.after} lang={c.lang} mode={mode} comments={c.comments} onLineHover={setHoverLine} />
          </div>
        </div>
        <aside className="at-review-side">
          <PanelHead label="Findings" count={findings.length} />
          <div className="at-pbody">
            {findings.map((fd) => (
              <button key={fd.id} type="button" className="at-finding" data-sev={fd.severity} onClick={() => setFile(fd.file)}>
                <div className="at-row" style={{ gap: 6 }}>
                  <Badge tone={fd.severity === 'high' ? 'danger' : fd.severity === 'medium' ? 'warning' : 'outline'}>{fd.severity}</Badge>
                  <span className="at-mono at-subtle">{fd.id}</span>
                  <span style={{ marginLeft: 'auto' }}>{fd.status === 'fixed' ? <Badge tone="success" icon={ICheck}>fixed · verified</Badge> : <Badge tone="outline">open</Badge>}</span>
                </div>
                <div className="at-finding-title">{fd.title}</div>
                <div className="at-mono at-subtle" style={{ fontSize: 10.5 }}>{fd.file}:{fd.line}</div>
              </button>
            ))}
            <div className="at-label" style={{ padding: '14px 14px 6px' }}>Evidence for this file</div>
            {file === 'src/middleware.ts' ? (<>
              <VerificationRow label="middleware.test.ts" value="7 passed" status="passed" />
              <VerificationRow label="auth.spec · logout clears session" value="failed" status="failed" />
            </>) : (<>
              <VerificationRow label="session.test.ts" value="19 passed" status="passed" />
              <VerificationRow label="concurrent-refresh.spec" value="50 / 50" status="passed" />
              <VerificationRow label="auth.spec · refresh rotates" value="passed" status="passed" />
            </>)}
            <div className="at-label" style={{ padding: '14px 14px 6px' }}>History</div>
            {[['a41f9c2', 'auth: rotate refresh tokens per use', 'BE'], ['9be03d1', 'auth: token family schema (0042)', 'BE'], ['77c1a0e', 'middleware: __Host- prefix, SameSite=Lax', 'BE']].map(([h, m, k]) => (
              <div key={h} className="at-commit"><span className="at-mono at-acc">{h}</span><span className="at-trunc">{m}</span><RoleMark mark={k} size="sm" /></div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------- 9. Browser & desktop control ---------- */
const envs = [
  { id: 'auto', label: 'Isolated automation browser', icon: IGlobe },
  { id: 'local', label: 'Local browser', icon: IWindow },
  { id: 'vdesk', label: 'Virtual desktop', icon: IMonitor },
  { id: 'desk', label: 'Your desktop', icon: IMonitor },
];

export function Computer() {
  const takeover = useApp((s) => s.takeover);
  const paused = useApp((s) => s.paused);
  const [env, setEnv] = useState('auto');
  const [step, setStep] = useState(5);
  const A = actions();
  const agentPaused = takeover || paused;
  return (
    <div className="at-screen at-computer">
      <div className="at-pagehead">
        <span className="heading">Browser & desktop</span>
        <Seg value={env} onChange={setEnv} items={envs.map((e) => ({ id: e.id, label: e.label }))} />
        <span style={{ flex: 1 }} />
        {env === 'auto' && <>
          <Button icon={agentPaused ? IPlay : IPause} disabled={takeover} onClick={() => A.set({ paused: !paused })}>{paused ? 'Resume agent' : 'Pause agent'}</Button>
          {takeover
            ? <Button variant="primary" icon={IArrowRight} onClick={() => { A.set({ takeover: false }); A.toast({ tone: 'info', title: 'Control returned to QA Engineer', body: 'It re-reads the page before acting. Your 2 actions were added to its context.' }); }}>Hand back to QA Engineer</Button>
            : <Button variant="human" icon={IHand} kbd="⌘ ⇧ T" onClick={() => A.set({ takeover: true })}>Take over</Button>}
        </>}
      </div>
      {env === 'auto' ? (
        <div className="at-row at-grow" style={{ alignItems: 'stretch', gap: 0 }}>
          <div className="at-col at-grow at-vp-wrap">
            <div className={cx('at-envbar', takeover && 'at-envbar--human')}>
              {takeover ? <><Icon as={IHand} size="sm" /><b>You have control</b><span>QA Engineer is paused and won’t send input until you hand back.</span></>
                : <><span className="at-envbar-kind">ISOLATED AUTOMATION BROWSER</span><span>Chromium 141 · ephemeral profile atlas-qa · localhost:3000 only</span></>}
              <span style={{ flex: 1 }} />
              <SampleTag>Sample replay · not a live session</SampleTag>
            </div>
            <div className={cx('at-viewport', takeover && 'at-viewport--human')}>
              <div className="at-bchrome">
                <span className="at-bdots"><i /><i /><i /></span>
                <span className="at-burl"><Icon as={ILock} size="sm" />localhost:3000/account</span>
              </div>
              <div className="at-page">
                <div className="at-page-nav"><b>acme</b><span>Shop</span><span>Collections</span><span>Journal</span><span style={{ flex: 1 }} /><span className="at-page-acct">Account ▾</span></div>
                <div className="at-page-body">
                  <div className="at-page-h">Your account</div>
                  <div className="at-page-sub">qa+auth@acme.dev · member since 2024</div>
                  <div className="at-page-grid"><div /><div /><div /></div>
                </div>
                <div className="at-page-menu"><span>Orders</span><span>Addresses</span><span className="at-page-target">Sign out</span></div>
                {!takeover && (
                  <div className="at-agent-cursor" style={{ left: 'calc(100% - 96px)', top: 128 }}>
                    <Icon as={ICursor} className="at-agent-cursor-ico" />
                    <span className="at-agent-cursor-label"><b>QA</b> click “Sign out”</span>
                  </div>
                )}
              </div>
            </div>
            <div className="at-replay">
              <IconButton icon={IRewind} label="Previous action" size="sm" onClick={() => setStep(Math.max(0, step - 1))} />
              <IconButton icon={IStep} label="Next action" size="sm" onClick={() => setStep(Math.min(browserActions.length - 1, step + 1))} />
              <div className="at-scrub">
                {browserActions.map((b, i) => <button key={i} type="button" className="at-scrub-tick" data-s={b.status} data-cur={i === step} style={{ left: `${(i / (browserActions.length - 1)) * 100}%` }} onClick={() => setStep(i)} aria-label={b.text} />)}
                <span className="at-scrub-fill" style={{ width: `${(step / (browserActions.length - 1)) * 100}%` }} />
              </div>
              <span className="at-mono at-subtle at-tnum">{browserActions[step].time}</span>
              <span className="at-rec"><Icon as={IRecord} size="sm" />REC</span>
            </div>
          </div>
          <aside className="at-computer-side">
            <PanelHead label="Actions" count={browserActions.length}><RoleMark mark="QA" s="failed" size="sm" /></PanelHead>
            <div className="at-pbody">
              {browserActions.map((b, i) => (
                <button key={i} type="button" className="at-bact" aria-selected={i === step} data-s={b.status} onClick={() => setStep(i)}>
                  <span className="at-mono at-subtle">{b.time.slice(3)}</span>
                  <StageGlyph s={b.status === 'verified' ? 'passed' : b.status === 'failed' ? 'failed' : 'done'} />
                  <span className="at-trunc">{b.text}</span>
                </button>
              ))}
              {takeover && <div className="at-bact at-bact--human"><span className="at-mono at-subtle">now</span><Icon as={IHand} size="sm" className="at-human-c" /><span>You · inspecting DevTools › Application › Cookies</span></div>}
              <div className="at-label" style={{ padding: '14px 12px 6px' }}>Boundaries</div>
              <div style={{ padding: '0 12px 12px' }} className="at-col">
                <div className="at-perms">
                  {[['allow', 'Hosts', 'localhost:3000'], ['ask', 'Hosts', '*.staging.acme.dev'], ['deny', 'Downloads', 'blocked'], ['deny', 'Clipboard', 'isolated from yours'], ['deny', 'Your profile', 'no cookies shared']].map(([l, s, d], i) => <div key={i} className="at-perm" data-l={l}><span className="at-perm-level">{l}</span><span className="at-perm-scope">{s}</span><span className="at-perm-detail at-trunc">{d}</span></div>)}
                </div>
              </div>
              <div className="at-label" style={{ padding: '6px 12px' }}>Screenshots</div>
              <div className="at-shots">{['login-filled', 'account', 'logout-after'].map((s) => <div key={s} className="at-shot"><div className="at-shot-img" /><span className="at-mono">{s}.png</span></div>)}</div>
            </div>
          </aside>
        </div>
      ) : env === 'local' ? (
        <EmptyState center icon={IWindow} title="No browser session" body="Agents use an isolated automation browser by default. Attaching your local browser shares your cookies and sign-ins — only do it for flows that need them.">
          <Button icon={IWindow}>Attach local browser…</Button>
        </EmptyState>
      ) : env === 'vdesk' ? (
        <EmptyState center icon={IMonitor} title="No virtual desktop running" body="A disposable Linux desktop for native-app testing. Nothing on it can reach your machine.">
          <Button icon={IPlay}>Start virtual desktop</Button>
        </EmptyState>
      ) : (
        <div className="at-desk-auth">
          <span className="at-apd-icon"><Icon as={IShield} /></span>
          <div className="heading" style={{ marginTop: 14 }}>Authorize control of your desktop</div>
          <p>An agent would see your screen and move your mouse and keyboard. Use this only for tasks that can’t run in an isolated browser or virtual desktop.</p>
          <div className="at-perms" style={{ width: '100%', margin: '14px 0' }}>
            {[['allow', 'Screen', 'Main display only'], ['allow', 'Apps', 'Simulator, Xcode'], ['deny', 'Apps', 'Mail, Messages, password managers'], ['ask', 'Typing', 'Every text entry is shown first'], ['allow', 'Stop', 'Move your mouse or press Esc to take over instantly']].map(([l, s, d], i) => <div key={i} className="at-perm" data-l={l} style={{ gridTemplateColumns: '40px 70px 1fr' }}><span className="at-perm-level">{l}</span><span className="at-perm-scope">{s}</span><span className="at-perm-detail">{d}</span></div>)}
          </div>
          <div className="at-row" style={{ gap: 8 }}><Button variant="ghost">Not now</Button><Button variant="primary" icon={IShield}>Authorize for 30 min</Button></div>
        </div>
      )}
    </div>
  );
}

export { ExitChip, Kbd, IWarn, IXCircle, IFlag, IHistory, IEye, ICamera, ITube, IShield, IReviews, ISplit, ITerminal };
