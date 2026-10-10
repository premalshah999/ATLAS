import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Agent, Task } from '../data/types';
import { agents, tasks, agentById } from '../data/sample';
import { cx, Icon, RoleMark, Activity, Dot, IconButton, Tip } from './primitives';
import { IXCircle, IClock, ICheck, IZoomIn, IZoomOut, IFit, IWarn } from '../lib/icons';
import { actions, useApp } from '../lib/store';

/* ---------- shared: scale-to-fit stage ---------- */
function useFit(w: number, h: number, maxScale = 1) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setK(Math.min(maxScale, (r.width - 8) / w, (r.height - 8) / h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);
  return { ref, k };
}

/* ---------- Agent node ---------- */
export function AgentNode({ a, selected, dim, onSelect, onOpen, style, compact }: { a: Agent; selected?: boolean; dim?: boolean; onSelect?: () => void; onOpen?: () => void; style?: React.CSSProperties; compact?: boolean }) {
  const paused = useApp((s) => s.paused);
  const ts = tasks.filter((t) => t.agent === a.id);
  const glyph = a.status === 'running' ? <Activity paused={paused} />
    : a.status === 'failed' ? <Icon as={IXCircle} size="sm" className="at-err" />
      : a.status === 'blocked' ? <Icon as={IWarn} size="sm" className="at-warn" />
        : a.status === 'waiting' ? <Icon as={IClock} size="sm" className="at-warn" />
          : a.status === 'done' ? <Icon as={ICheck} size="sm" className="at-ok" /> : <Dot s="idle" />;
  return (
    <button type="button" className={cx('at-node', selected && 'at-node--sel', dim && 'at-node--dim', compact && 'at-node--compact')} data-s={paused && a.status === 'running' ? 'paused' : a.status}
      style={style} onClick={onSelect} onDoubleClick={onOpen} aria-pressed={selected} aria-label={`${a.name}: ${a.activity}`}>
      <div className="at-node-top">
        <RoleMark mark={a.mark} s={a.status} size="sm" />
        <span className="at-node-name at-trunc">{a.name}</span>
        <span className="at-node-glyph">{glyph}</span>
      </div>
      <div className="at-node-act at-trunc">{paused && a.status === 'running' ? 'Paused after current step' : a.activity}</div>
      {!compact && (
        <div className="at-node-foot">
          <span className="at-meter at-meter--segments" style={{ flex: 1 }}>{ts.map((t) => <span key={t.id} data-s={t.status} title={`${t.id} · ${t.title}`} />)}</span>
          <span className="at-mono at-subtle at-tnum">{ts.filter((t) => t.status === 'done').length}/{ts.length}</span>
        </div>
      )}
    </button>
  );
}

/* ---------- Mission Control agent graph ---------- */
type EdgeState = 'done' | 'active' | 'waiting' | 'blocked' | 'failed' | 'pending';
interface GEdge { id: string; from: string; to: string; d: string; label: string; lx: number; ly: number; state: EdgeState; kind: 'dep' | 'delegate' }

const NW = 184, NH = 66;
const pos: Record<string, { x: number; y: number }> = {
  be: { x: 40, y: 92 }, fe: { x: 296, y: 92 }, sec: { x: 40, y: 200 }, qa: { x: 296, y: 200 }, ops: { x: 552, y: 146 },
};
const AG_W = 752, AG_H = 292;

function edgesFor(): GEdge[] {
  const b = 58;
  return [
    // delegation: drops from the orchestrator bar; lower-row agents are reached through the column gutter
    { id: 'd-be', from: 'orch', to: 'be', kind: 'delegate', d: `M64 ${b} V92`, label: '', lx: 0, ly: 0, state: 'done' },
    { id: 'd-fe', from: 'orch', to: 'fe', kind: 'delegate', d: `M320 ${b} V92`, label: '', lx: 0, ly: 0, state: 'done' },
    { id: 'd-ops', from: 'orch', to: 'ops', kind: 'delegate', d: `M576 ${b} V146`, label: '', lx: 0, ly: 0, state: 'done' },
    { id: 'd-sec', from: 'orch', to: 'sec', kind: 'delegate', d: `M24 ${b} V223 Q24 231 32 231 H40`, label: '', lx: 0, ly: 0, state: 'done' },
    { id: 'd-qa', from: 'orch', to: 'qa', kind: 'delegate', d: `M280 ${b} V223 Q280 231 288 231 H296`, label: '', lx: 0, ly: 0, state: 'done' },
    // work dependencies
    { id: 'be-fe', from: 'be', to: 'fe', kind: 'dep', d: 'M224 112 H296', label: 'contract v2', lx: 260, ly: 100, state: 'waiting' },
    { id: 'be-sec', from: 'be', to: 'sec', kind: 'dep', d: 'M132 158 V200', label: 'review', lx: 132, ly: 179, state: 'active' },
    { id: 'be-qa', from: 'be', to: 'qa', kind: 'dep', d: 'M224 138 C 258 138 254 214 296 214', label: '', lx: 0, ly: 0, state: 'done' },
    { id: 'fe-ops', from: 'fe', to: 'ops', kind: 'dep', d: 'M480 112 C 524 112 512 162 552 162', label: 'UI ready', lx: 516, ly: 120, state: 'pending' },
    { id: 'sec-ops', from: 'sec', to: 'ops', kind: 'dep', d: 'M224 246 C 244 246 242 177 262 177 H 520 C 536 177 536 178 552 178', label: 'sign-off', lx: 400, ly: 177, state: 'blocked' },
    { id: 'qa-ops', from: 'qa', to: 'ops', kind: 'dep', d: 'M480 238 C 524 238 512 194 552 194', label: 'sign-off', lx: 516, ly: 232, state: 'failed' },
  ];
}

export function AgentGraph({ onOpenAgent }: { onOpenAgent?: (id: string) => void }) {
  const sel = useApp((s) => s.agent);
  const paused = useApp((s) => s.paused);
  const [hover, setHover] = useState<string | null>(null);
  const { ref, k } = useFit(AG_W, AG_H, 1.12);
  const edges = useMemo(edgesFor, []);
  const focus = hover ?? null;
  const related = (e: GEdge) => !focus || e.from === focus || e.to === focus;
  const orch = agentById('orch');
  return (
    <div className="at-graph" ref={ref}>
      <div className="at-graph-stage" style={{ width: AG_W, height: AG_H, transform: `translate(-50%, -50%) scale(${k})` }}>
        <svg className="at-graph-svg" width={AG_W} height={AG_H} viewBox={`0 0 ${AG_W} ${AG_H}`} aria-hidden>
          <defs>
            <marker id="at-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1 L7 4 L1 7" fill="none" stroke="context-stroke" strokeWidth="1.4" /></marker>
          </defs>
                    {edges.map((e) => (
            <g key={e.id} className={cx('at-edge-g', !related(e) && 'at-edge-g--dim', paused && 'at-edge-g--paused')} data-state={e.state} data-kind={e.kind}>
              <path d={e.d} className="at-edge" markerEnd={e.kind === 'dep' ? 'url(#at-arrow)' : undefined} />
              {e.state === 'active' && <path d={e.d} className="at-edge-flow" />}
            </g>
          ))}
        </svg>
        <button type="button" className={cx('at-orch', sel === 'orch' && 'at-node--sel')} style={{ left: 16, top: 14, width: AG_W - 32 }}
          onClick={() => actions().selectAgent('orch')} onDoubleClick={() => onOpenAgent?.('orch')} onMouseEnter={() => setHover('orch')} onMouseLeave={() => setHover(null)}>
          <RoleMark mark="OR" s="running" />
          <span className="at-node-name">{orch.name}</span>
          <span className="at-orch-act at-trunc">{paused ? 'Mission paused · agents finish their current step' : orch.activity}</span>
          <span style={{ flex: 1 }} />
          <span className="at-mono at-subtle">delegated 5 · plan v3</span>
          <Activity paused={paused} />
        </button>
        {(['be', 'fe', 'sec', 'qa', 'ops'] as const).map((id) => (
          <div key={id} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} style={{ position: 'absolute', left: pos[id].x, top: pos[id].y, width: NW, height: NH }}>
            <AgentNode a={agentById(id)} selected={sel === id} dim={!!focus && focus !== id && !edges.some((e) => e.kind === 'dep' && ((e.from === focus && e.to === id) || (e.to === focus && e.from === id)))}
              onSelect={() => actions().selectAgent(id)} onOpen={() => onOpenAgent?.(id)} style={{ width: NW, height: NH }} />
          </div>
        ))}
        {edges.filter((e) => e.label).map((e) => (
          <span key={e.id} className={cx('at-elabel', !related(e) && 'at-elabel--dim')} data-state={e.state} style={{ left: e.lx, top: e.ly }}>{e.label}</span>
        ))}
      </div>
      <div className="at-graph-legend">
        <span><i className="lg-del" />delegation</span>
        <span><i className="lg-dep" />dependency</span>
        <span><i className="lg-act" />live handoff</span>
        <span><i className="lg-wait" />waiting / gated</span>
        <span><i className="lg-fail" />failed</span>
      </div>
    </div>
  );
}

/* ---------- Task dependency graph (full screen) ---------- */
const lanes = [
  { id: 'orch', cols: 1 }, { id: 'sec', cols: 1 }, { id: 'be', cols: 2 }, { id: 'qa', cols: 1 }, { id: 'fe', cols: 1 }, { id: 'ops', cols: 1 },
];
const slots: Record<string, number> = { T7: 1 };
const phaseOf: Record<string, number> = { T1: 0, T2: 1, T3: 1, T4: 2, T7: 2, T11: 2, T5: 3, T6: 4, T10: 4, T12: 4, T8: 5, T9: 6, T13: 7, T14: 8 };
const SC = 188, TW = 168, TH = 54, ROW = 74, TOP = 60, LEFT = 20;
const laneX: Record<string, number> = {};
{ let c = 0; for (const l of lanes) { laneX[l.id] = c; c += l.cols; } }
const TG_W = LEFT * 2 + 7 * SC - (SC - TW), TG_H = TOP + 9 * ROW - (ROW - TH) + 16;

export const taskPos = (t: Task) => ({ x: LEFT + (laneX[t.agent] + (slots[t.id] ?? 0)) * SC, y: TOP + phaseOf[t.id] * ROW });

function chain(id: string, dir: 'up' | 'down', acc = new Set<string>()) {
  const t = tasks.find((x) => x.id === id)!;
  const next = dir === 'up' ? t.deps : tasks.filter((x) => x.deps.includes(id)).map((x) => x.id);
  for (const n of next) if (!acc.has(n)) { acc.add(n); chain(n, dir, acc); }
  return acc;
}

export function TaskGraph({ selected, onSelect, critical }: { selected?: string; onSelect: (id?: string) => void; critical?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const fit = () => {
    const r = wrap.current?.getBoundingClientRect(); if (!r) return;
    const k = Math.min(1, (r.width - 32) / TG_W, (r.height - 32) / TG_H);
    setView({ k, x: Math.max(12, (r.width - TG_W * k) / 2), y: 8 });
  };
  useLayoutEffect(fit, []);
  useEffect(() => { const ro = new ResizeObserver(fit); if (wrap.current) ro.observe(wrap.current); return () => ro.disconnect(); }, []);
  const hi = useMemo(() => {
    if (critical) { const s = chain('T14', 'up'); s.add('T14'); return s; }
    if (!selected) return null;
    const s = new Set<string>([selected]); chain(selected, 'up', s); chain(selected, 'down', s); return s;
  }, [selected, critical]);
  const edges = useMemo(() => {
    const out: { id: string; d: string; from: string; to: string; state: string }[] = [];
    const incoming: Record<string, number> = {};
    for (const t of tasks) {
      t.deps.forEach((dep) => {
        const s = tasks.find((x) => x.id === dep)!;
        const a = taskPos(s), b = taskPos(t);
        const n = (incoming[t.id] = (incoming[t.id] ?? -1) + 1);
        const total = t.deps.length;
        const x1 = a.x + TW / 2, y1 = a.y + TH;
        const x2 = b.x + TW / 2 + (n - (total - 1) / 2) * 14, y2 = b.y;
        let d: string;
        if (Math.abs(x1 - x2) < 2) d = `M${x1} ${y1} V${y2}`;
        else {
          const cy = y2 - 11; const r = 7; const dir = x2 > x1 ? 1 : -1;
          d = `M${x1} ${y1} V${cy - r} Q${x1} ${cy} ${x1 + dir * r} ${cy} H${x2 - dir * r} Q${x2} ${cy} ${x2} ${cy + r} V${y2}`;
        }
        const state = s.status === 'done' ? (t.status === 'pending' || t.status === 'waiting' || t.status === 'blocked' ? 'ready' : 'done') : s.status === 'failed' ? 'failed' : s.status === 'running' ? 'active' : 'pending';
        out.push({ id: dep + '-' + t.id, d, from: dep, to: t.id, state });
      });
    }
    return out;
  }, []);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  return (
    <div className="at-tgraph" ref={wrap}
      onWheel={(e) => {
        const r = wrap.current!.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey) {
          const k = Math.max(0.4, Math.min(1.8, view.k * (1 - e.deltaY * 0.002)));
          const mx = e.clientX - r.left, my = e.clientY - r.top;
          setView({ k, x: mx - ((mx - view.x) * k) / view.k, y: my - ((my - view.y) * k) / view.k });
        } else setView({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY });
      }}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('.at-tnode')) return; drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const d = drag.current; if (d) setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y })); }}
      onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && Math.abs(e.clientX - d.x) < 3 && Math.abs(e.clientY - d.y) < 3) onSelect(undefined); }}>
      <div className="at-tgraph-stage" style={{ width: TG_W, height: TG_H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        {lanes.map((l) => {
          const a = agentById(l.id);
          return (
            <div key={l.id} className="at-lane" style={{ left: LEFT + laneX[l.id] * SC - 10, width: l.cols * SC - (SC - TW) + 20, height: TG_H }}>
              <button type="button" className="at-lane-head" onClick={() => actions().selectAgent(l.id)}>
                <RoleMark mark={a.mark} s={a.status} size="sm" /><span className="at-trunc">{a.name}</span>
              </button>
            </div>
          );
        })}
        {Array.from({ length: 9 }, (_, p) => <span key={p} className="at-phase-tick at-mono" style={{ top: TOP + p * ROW + TH / 2 - 7 }}>{p + 1}</span>)}
        <svg className="at-graph-svg" width={TG_W} height={TG_H} aria-hidden>
          <defs><marker id="at-arrow2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1 L7 4 L1 7" fill="none" stroke="context-stroke" strokeWidth="1.4" /></marker></defs>
          {edges.map((e) => (
            <g key={e.id} className={cx('at-edge-g', hi && !(hi.has(e.from) && hi.has(e.to)) && 'at-edge-g--dim', hi && hi.has(e.from) && hi.has(e.to) && 'at-edge-g--hi')} data-state={e.state} data-kind="dep">
              <path d={e.d} className="at-edge" markerEnd="url(#at-arrow2)" />
              {e.state === 'active' && <path d={e.d} className="at-edge-flow" />}
            </g>
          ))}
        </svg>
        {tasks.map((t) => {
          const p = taskPos(t);
          return (
            <button key={t.id} type="button" className={cx('at-tnode', selected === t.id && 'at-node--sel', hi && !hi.has(t.id) && 'at-node--dim')} data-s={t.status}
              style={{ left: p.x, top: p.y, width: TW, height: TH }} onClick={() => onSelect(t.id === selected ? undefined : t.id)}>
              <span className="at-row" style={{ gap: 6 }}>
                <span className="at-mono at-subtle">{t.id}</span>
                <span style={{ flex: 1 }} />
                {t.status === 'running' ? <Activity /> : <Dot s={t.status} />}
              </span>
              <span className="at-tnode-title">{t.title}</span>
            </button>
          );
        })}
      </div>
      <div className="at-zoom">
        <IconButton icon={IZoomOut} label="Zoom out" kbd="⌘ −" size="sm" onClick={() => setView((v) => ({ ...v, k: Math.max(0.4, v.k - 0.1) }))} />
        <span className="at-mono at-subtle at-tnum" style={{ width: 36, textAlign: 'center' }}>{Math.round(view.k * 100)}%</span>
        <IconButton icon={IZoomIn} label="Zoom in" kbd="⌘ +" size="sm" onClick={() => setView((v) => ({ ...v, k: Math.min(1.8, v.k + 0.1) }))} />
        <IconButton icon={IFit} label="Fit to view" kbd="⇧ 1" size="sm" onClick={fit} />
      </div>
    </div>
  );
}

export function TaskChip({ t }: { t: Task }) {
  return <Tip label={`${t.title} · ${agentById(t.agent).name}`}><span className="at-badge at-badge--outline at-mono">{t.id}</span></Tip>;
}
export { agents };
