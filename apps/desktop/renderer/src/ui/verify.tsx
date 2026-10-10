import React from 'react';
import type { PipelineStage } from '../data/types';
import { cx, Icon, Activity } from './primitives';
import { ICheck, IXCircle, IWarn, ILock, ICircleDashed } from '../lib/icons';

export function StageGlyph({ s }: { s: PipelineStage['status'] | 'done' }) {
  if (s === 'done') return <span className="at-sg at-sg--done"><Icon as={ICheck} size="sm" /></span>;
  if (s === 'passed') return <span className="at-sg at-sg--ok"><Icon as={ICheck} size="sm" /></span>;
  if (s === 'failed') return <span className="at-sg at-sg--err"><Icon as={IXCircle} size="sm" /></span>;
  if (s === 'warning') return <span className="at-sg at-sg--warn"><Icon as={IWarn} size="sm" /></span>;
  if (s === 'running') return <span className="at-sg at-sg--run"><Activity /></span>;
  if (s === 'locked') return <span className="at-sg at-sg--lock"><Icon as={ILock} size="sm" /></span>;
  return <span className="at-sg"><Icon as={ICircleDashed} size="sm" /></span>;
}

export function Pipeline({ stages, selected, onSelect }: { stages: PipelineStage[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="at-pipe" role="tablist" aria-label="Verification pipeline">
      {stages.map((st, i) => (
        <button key={st.id} type="button" role="tab" aria-selected={st.id === selected} className={cx('at-pipe-stage', st.id === selected && 'at-pipe-stage--sel')} data-s={st.status} onClick={() => onSelect(st.id)}>
          <div className="at-pipe-track">
            <span className="at-pipe-line" data-s={i === 0 ? 'none' : stages[i - 1].status} />
            <StageGlyph s={st.status} />
            <span className="at-pipe-line" data-s={i === stages.length - 1 ? 'none' : st.status} />
          </div>
          <span className="at-pipe-name">{st.name}</span>
          <span className="at-pipe-sub at-mono at-tnum">{st.status === 'locked' ? 'needs you' : st.duration ?? '—'}</span>
        </button>
      ))}
    </div>
  );
}

export function VerificationRow({ label, value, status }: { label: React.ReactNode; value: React.ReactNode; status?: 'passed' | 'failed' | 'warning' | 'pending' | 'running' }) {
  return (
    <div className="at-vrow" data-s={status}>
      <StageGlyph s={status === 'pending' || !status ? 'pending' : status} />
      <span className="at-vrow-label at-trunc">{label}</span>
      <span className="at-vrow-value at-mono">{value}</span>
    </div>
  );
}
