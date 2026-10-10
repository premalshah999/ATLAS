import React, { useMemo, useState, type ReactNode } from 'react';
import hljs from 'highlight.js/lib/core';
import ts from 'highlight.js/lib/languages/typescript';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import yaml from 'highlight.js/lib/languages/yaml';
import { cx, Icon, IconButton, Badge, RoleMark, Button } from './primitives';
import { ICopy, IComment, ICheck, IClose, IOpen } from '../lib/icons';

hljs.registerLanguage('ts', ts);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('yaml', yaml);

export const hl = (code: string, lang = 'ts') => {
  try { return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; } catch { return code.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;')); }
};

export function CodeBlock({ code, lang = 'ts', title, startLine = 1, highlight = [], compact, actions }: { code: string; lang?: string; title?: ReactNode; startLine?: number; highlight?: number[]; compact?: boolean; actions?: ReactNode }) {
  const lines = useMemo(() => code.split('\n').map((l) => hl(l, lang)), [code, lang]);
  return (
    <div className={cx('at-code', compact && 'at-code--compact')}>
      {title && (
        <div className="at-code-head">
          <span className="at-mono at-muted at-trunc">{title}</span>
          <span style={{ flex: 1 }} />
          {actions}
          <IconButton icon={ICopy} label="Copy" size="sm" />
        </div>
      )}
      <pre className="at-code-body"><code>
        {lines.map((h, i) => (
          <div key={i} className={cx('at-cl', highlight.includes(i + startLine) && 'at-cl--hl')}>
            <span className="at-ln">{i + startLine}</span>
            <span className="at-lc" dangerouslySetInnerHTML={{ __html: h || ' ' }} />
          </div>
        ))}
      </code></pre>
    </div>
  );
}

/* ---------- Diff ---------- */
type Row = { k: 'ctx' | 'add' | 'del'; a?: number; b?: number; text: string };

export function diffLines(before: string, after: string): Row[] {
  const A = before.split('\n'), B = after.split('\n');
  const n = A.length, m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows: Row[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { rows.push({ k: 'ctx', a: i + 1, b: j + 1, text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push({ k: 'del', a: i + 1, text: A[i] }); i++; }
    else { rows.push({ k: 'add', b: j + 1, text: B[j] }); j++; }
  }
  while (i < n) { rows.push({ k: 'del', a: i + 1, text: A[i] }); i++; }
  while (j < m) { rows.push({ k: 'add', b: j + 1, text: B[j] }); j++; }
  return rows;
}

export interface ReviewComment { line: number; author: string; mark: string; human?: boolean; body: ReactNode; severity?: 'high' | 'medium' | 'low'; id?: string; resolved?: boolean }

function CommentThread({ c }: { c: ReviewComment }) {
  const [state, setState] = useState<'open' | 'accepted' | 'dismissed'>(c.resolved ? 'accepted' : 'open');
  return (
    <div className="at-dcomment" data-state={state}>
      <div className="at-row" style={{ gap: 8 }}>
        <RoleMark mark={c.mark} size="sm" human={c.human} />
        <span className="at-dcomment-author">{c.author}</span>
        {c.id && <span className="at-mono at-subtle">{c.id}</span>}
        {c.severity && <Badge tone={c.severity === 'high' ? 'danger' : c.severity === 'medium' ? 'warning' : 'outline'}>{c.severity}</Badge>}
        <span style={{ flex: 1 }} />
        {state === 'open' ? (
          <>
            <Button size="sm" variant="ghost" icon={IClose} onClick={() => setState('dismissed')}>Dismiss</Button>
            <Button size="sm" icon={ICheck} onClick={() => setState('accepted')}>Send fix to agent</Button>
          </>
        ) : <Badge tone={state === 'accepted' ? 'accent' : 'outline'}>{state === 'accepted' ? 'Routed to Backend Engineer' : 'Dismissed'}</Badge>}
      </div>
      <div className="at-dcomment-body">{c.body}</div>
    </div>
  );
}

export function DiffView({ before, after, lang = 'ts', mode = 'split', comments = [], onLineHover }: { before: string; after: string; lang?: string; mode?: 'split' | 'inline'; comments?: ReviewComment[]; onLineHover?: (line?: number) => void }) {
  const rows = useMemo(() => diffLines(before, after).map((r) => ({ ...r, html: hl(r.text, lang) })), [before, after, lang]);
  const byLine = (b?: number) => comments.filter((c) => b !== undefined && c.line === b);

  if (mode === 'inline') {
    return (
      <div className="at-diff at-diff--inline" onMouseLeave={() => onLineHover?.()}>
        {rows.map((r, idx) => (
          <React.Fragment key={idx}>
            <div className={cx('at-drow', `at-drow--${r.k}`)} onMouseEnter={() => onLineHover?.(r.b)}>
              <span className="at-dno">{r.a ?? ''}</span>
              <span className="at-dno">{r.b ?? ''}</span>
              <span className="at-dsign">{r.k === 'add' ? '+' : r.k === 'del' ? '−' : ''}</span>
              <span className="at-dtext" dangerouslySetInnerHTML={{ __html: r.html || ' ' }} />
              <button type="button" className="at-dadd" aria-label="Comment on line"><Icon as={IComment} size="sm" /></button>
            </div>
            {r.k !== 'del' && byLine(r.b).map((c, i) => <CommentThread key={i} c={c} />)}
          </React.Fragment>
        ))}
      </div>
    );
  }
  // split: pair consecutive del/add blocks
  type Pair = { l?: (typeof rows)[number]; r?: (typeof rows)[number] };
  const pairs: Pair[] = [];
  for (let i = 0; i < rows.length;) {
    if (rows[i].k === 'ctx') { pairs.push({ l: rows[i], r: rows[i] }); i++; continue; }
    const dels: typeof rows = [], adds: typeof rows = [];
    while (i < rows.length && rows[i].k === 'del') dels.push(rows[i++]);
    while (i < rows.length && rows[i].k === 'add') adds.push(rows[i++]);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) pairs.push({ l: dels[k], r: adds[k] });
  }
  return (
    <div className="at-diff at-diff--split" onMouseLeave={() => onLineHover?.()}>
      {pairs.map((p, idx) => (
        <React.Fragment key={idx}>
          <div className="at-dpair" onMouseEnter={() => onLineHover?.(p.r?.b)}>
            <div className={cx('at-drow', p.l ? `at-drow--${p.l.k}` : 'at-drow--empty')}>
              <span className="at-dno">{p.l?.a ?? ''}</span>
              <span className="at-dsign">{p.l?.k === 'del' ? '−' : ''}</span>
              <span className="at-dtext" dangerouslySetInnerHTML={{ __html: p.l ? p.l.html || ' ' : '' }} />
            </div>
            <div className={cx('at-drow', p.r ? `at-drow--${p.r.k}` : 'at-drow--empty')}>
              <span className="at-dno">{p.r?.b ?? ''}</span>
              <span className="at-dsign">{p.r?.k === 'add' ? '+' : ''}</span>
              <span className="at-dtext" dangerouslySetInnerHTML={{ __html: p.r ? p.r.html || ' ' : '' }} />
              <button type="button" className="at-dadd" aria-label="Comment on line"><Icon as={IComment} size="sm" /></button>
            </div>
          </div>
          {p.r && byLine(p.r.b).map((c, i) => <CommentThread key={i} c={c} />)}
        </React.Fragment>
      ))}
    </div>
  );
}

export function DiffStat({ add, del, blocks = true }: { add: number; del: number; blocks?: boolean }) {
  const total = add + del || 1;
  const g = Math.round((add / total) * 5);
  return (
    <span className="at-dstat">
      <span className="at-ok">+{add}</span><span className="at-err">−{del}</span>
      {blocks && <span className="at-dstat-blocks">{Array.from({ length: 5 }, (_, i) => <i key={i} data-k={i < g ? 'a' : 'd'} />)}</span>}
    </span>
  );
}

export function OpenInEditor() {
  return <Button size="sm" variant="ghost" icon={IOpen}>Open in editor</Button>;
}
