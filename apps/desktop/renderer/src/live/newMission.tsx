// Mission composer (manual §34): repository, objective, constraints, approval mode, runtime, preflight.
import React, { useEffect, useState } from 'react';
import type { ApprovalMode, RuntimeHealth, RuntimeKind } from '@atlas/contracts';
import { Badge, Button, Field, Icon, Input, Seg, Select } from '../ui/primitives';
import { IFolderOpen, IInfo, IWarn, IXCircle, ISpark } from '../lib/icons';
import { call, type Preflight } from './api';
import { go, refreshLists, useLive } from './store';
import { openRepository } from './shell';
import { toast } from './toast';

const MODES: { id: ApprovalMode; label: string; help: string }[] = [
  { id: 'ask_risky', label: 'Ask for risky actions', help: 'Reads, edits inside the worktree and safe commands (tests, git status) run directly. Installs, network, deletes and git writes wait for you.' },
  { id: 'ask_all_writes', label: 'Ask for every write', help: 'Every file write and every privileged command waits for your approval.' },
  { id: 'plan_only', label: 'Read-only', help: 'Agents may read and run tests but cannot change files or run privileged commands.' },
];

export function NewMission({ workspaceId }: { workspaceId?: string }) {
  const workspaces = useLive((s) => s.workspaces);
  const [ws, setWs] = useState<string | undefined>(workspaceId ?? workspaces[0]?.id);
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [constraints, setConstraints] = useState('');
  const [mode, setMode] = useState<ApprovalMode>('ask_risky');
  const [runtime, setRuntime] = useState<RuntimeKind>('fake');
  const [health, setHealth] = useState<RuntimeHealth[]>([]);
  const [pre, setPre] = useState<Preflight | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!ws && workspaces[0]) setWs(workspaceId ?? workspaces[0].id); }, [workspaces, ws, workspaceId]);
  useEffect(() => { void call('runtime.health').then((h) => { setHealth(h); if (h.find((x) => x.runtime === 'pi')?.ok) setRuntime('pi'); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!ws) return;
    setPre(null);
    void call('workspace.preflight', { workspaceId: ws, runtime }).then(setPre).catch((e) => setPre([{ level: 'block', message: (e as Error).message }]));
  }, [ws, runtime]);

  const blocked = !pre || pre.some((p) => p.level === 'block');
  const pi = health.find((h) => h.runtime === 'pi');
  const submit = async () => {
    if (!ws || !title.trim() || !goal.trim()) return;
    setBusy(true);
    try {
      const m = await call('mission.create', { workspaceId: ws, title: title.trim(), goal: goal.trim(), constraints, approvalMode: mode, runtime });
      await call('mission.plan', { missionId: m.id });
      await refreshLists();
      go({ screen: 'mission', missionId: m.id });
    } catch (e) {
      toast({ tone: 'danger', title: 'Could not create the mission', body: (e as Error).message });
    } finally { setBusy(false); }
  };

  if (!workspaces.length) {
    return (
      <div className="at-screen lv-page">
        <div className="at-pagehead"><span className="heading">New mission</span></div>
        <div className="lv-scroll"><div className="lv-narrow"><p className="at-muted">Open a repository first.</p><Button variant="primary" icon={IFolderOpen} onClick={() => void openRepository()}>Open repository</Button></div></div>
      </div>
    );
  }

  return (
    <div className="at-screen lv-page" data-testid="new-mission">
      <div className="at-pagehead"><span className="heading">New mission</span></div>
      <div className="lv-scroll">
        <form className="lv-narrow lv-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Field label="Repository">
            <div className="at-row" style={{ gap: 8 }}>
              <Select value={ws ?? ''} width={360} onChange={(v) => setWs(v)} options={workspaces.map((w) => ({ id: w.id, label: w.name, hint: w.branch ?? 'no git' }))} />
              <Button type="button" variant="ghost" icon={IFolderOpen} onClick={async () => { const id = await openRepository(); if (id) setWs(id); }}>Open another…</Button>
            </div>
          </Field>
          <Field label="Title"><Input data-testid="mission-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fix slug generation for post titles" maxLength={160} /></Field>
          <Field label="Objective" help="Describe the outcome. ATLAS turns it into a plan you approve before anything runs.">
            <textarea data-testid="mission-goal" className="lv-textarea body-lg" rows={5} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="slugify() should lowercase, drop punctuation and collapse separators so the tests in test/slugify.test.js pass." />
          </Field>
          <Field label="Constraints" help="Optional. Things the agent must not do or must preserve.">
            <textarea className="lv-textarea" rows={2} value={constraints} onChange={(e) => setConstraints(e.target.value)} placeholder="Do not change the public function signature." />
          </Field>
          <Field label="Approval mode" help={MODES.find((m) => m.id === mode)!.help}>
            <Seg items={MODES.map((m) => ({ id: m.id, label: m.label }))} value={mode} onChange={setMode} />
          </Field>
          <Field label="Agent runtime" help={runtime === 'fake'
            ? 'Scripted sample runtime: deterministic behavior for the bundled sample project, a read-only survey elsewhere. No model is called.'
            : pi?.detail ?? 'Checking Pi…'}>
            <Seg items={[{ id: 'fake' as const, label: 'Scripted (no model)' }, { id: 'pi' as const, label: `Pi${pi ? (pi.ok ? '' : ' · not configured') : ''}` }]} value={runtime} onChange={setRuntime} />
          </Field>

          <div className="lv-preflight" data-testid="preflight">
            <div className="at-label">Preflight</div>
            {!pre ? <div className="at-subtle lv-small">Checking the repository…</div> : pre.map((p, i) => (
              <div key={i} className="lv-pf" data-level={p.level}>
                <Icon as={p.level === 'block' ? IXCircle : p.level === 'warn' ? IWarn : IInfo} size="sm" />
                <span>{p.message}</span>
              </div>
            ))}
          </div>

          <div className="at-row" style={{ gap: 8, marginTop: 8 }}>
            <Button type="submit" variant="primary" icon={ISpark} disabled={busy || blocked || !title.trim() || !goal.trim()} data-testid="plan-mission">Plan mission</Button>
            <span className="at-subtle lv-small">Planning does not change anything. You approve the plan before agents start.</span>
            {runtime === 'fake' && <Badge tone="sample">scripted runtime</Badge>}
          </div>
        </form>
      </div>
    </div>
  );
}
