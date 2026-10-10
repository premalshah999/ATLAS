import React from 'react';
import { Badge, Button, Dot, EmptyState, Icon } from '../ui/primitives';
import { IFolderOpen, IPlus, IRepo, IBranch } from '../lib/icons';
import { go, useLive } from './store';
import { openRepository, dotFor } from './shell';
import { ago, stateWord } from './format';

export function Projects() {
  const workspaces = useLive((s) => s.workspaces);
  const missions = useLive((s) => s.missions);
  const status = useLive((s) => s.status.state);
  return (
    <div className="at-screen lv-page" data-testid="projects">
      <div className="at-pagehead">
        <span className="heading">Projects</span><span style={{ flex: 1 }} />
        <Button variant="primary" icon={IFolderOpen} kbd="⌘ O" onClick={() => void openRepository()} disabled={status !== 'ready'}>Open repository</Button>
      </div>
      <div className="lv-scroll">
        {workspaces.length === 0 ? (
          <EmptyState center icon={IRepo} title="Open a repository to begin"
            body="ATLAS reads the repository and runs agents in isolated git worktrees. Your checkout is never edited. To try the bundled sample project, run `pnpm seed:sample` and open the folder it prints.">
            <Button variant="primary" icon={IFolderOpen} onClick={() => void openRepository()} disabled={status !== 'ready'}>Open repository</Button>
          </EmptyState>
        ) : (
          <div className="lv-grid">
            {workspaces.map((w) => {
              const ms = missions.filter((m) => m.workspaceId === w.id);
              return (
                <section key={w.id} className="lv-card" data-testid="workspace-card">
                  <div className="lv-card-head">
                    <Icon as={IRepo} className="at-subtle" />
                    <span className="heading at-trunc">{w.name}</span>
                    <span style={{ flex: 1 }} />
                    <Button size="sm" icon={IPlus} onClick={() => go({ screen: 'new', workspaceId: w.id })}>New mission</Button>
                  </div>
                  <div className="lv-card-meta">
                    <span className="at-mono at-subtle at-trunc" title={w.root}>{w.root}</span>
                    {w.isGit ? <span className="at-row" style={{ gap: 6 }}><Icon as={IBranch} size="sm" className="at-subtle" /><span className="at-mono">{w.branch}</span><span className="at-mono at-subtle">{w.head?.slice(0, 7)}</span>{w.dirty ? <Badge tone="warning">{w.dirty} uncommitted</Badge> : <Badge tone="outline">clean</Badge>}</span> : <Badge tone="warning">not a git repository</Badge>}
                  </div>
                  <div className="at-label" style={{ margin: '14px 0 6px' }}>Missions</div>
                  {ms.length === 0 ? <div className="at-subtle lv-small">No missions yet.</div> : (
                    <ul className="lv-list">
                      {ms.slice(0, 6).map((m) => (
                        <li key={m.id}>
                          <button type="button" className="lv-row" onClick={() => go({ screen: 'mission', missionId: m.id })}>
                            <Dot s={dotFor(m.state)} />
                            <span className="at-trunc" style={{ fontWeight: 500 }}>{m.title}</span>
                            <span className="at-subtle lv-small">{stateWord(m.state)}{m.outcome ? ` · ${m.outcome.split(':')[0]}` : ''}</span>
                            <span style={{ flex: 1 }} />
                            <span className="at-subtle lv-small">{ago(m.updatedAt)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
