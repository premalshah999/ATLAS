// SAMPLE DATA — every value here is illustrative prototype content, not output from a live runtime.
import type {
  Agent, Task, TimelineEvent, Approval, TerminalSession, Checkpoint, Mission, PipelineStage, ReviewFinding, FileTouch,
} from './types';

export const workspace = {
  name: 'storefront',
  owner: 'acme',
  path: '~/code/acme/storefront',
  branch: 'feat/auth-refactor',
  head: 'a41f9c2',
  environment: 'staging',
  envHealth: 'healthy' as const,
  runtime: 'Pi runtime 0.9 · sample adapter',
};

export const workspaces = [
  { id: 'storefront', name: 'acme/storefront', path: '~/code/acme/storefront', branch: 'feat/auth-refactor', missions: 2, updated: 'now' },
  { id: 'payments', name: 'acme/payments-api', path: '~/code/acme/payments-api', branch: 'main', missions: 0, updated: '2h ago' },
  { id: 'ds', name: 'acme/design-system', path: '~/code/acme/design-system', branch: 'next', missions: 1, updated: 'yesterday' },
  { id: 'dotfiles', name: 'premal/dotfiles', path: '~/dotfiles', branch: 'main', missions: 0, updated: 'Oct 2' },
];

export const mission: Mission = {
  id: 'MSN-0142',
  title: 'Refactor authentication & ship to staging',
  objective: 'Refactor the authentication system, fix all security issues, and deploy the verified changes to staging.',
  status: 'running',
  elapsed: '14m 32s',
  agents: 6,
  tasksDone: 6,
  tasksTotal: 14,
  tokens: '1.42M',
  compute: '$3.18',
  workspace: 'acme/storefront',
  updated: 'now',
};

export const missions: Mission[] = [
  mission,
  { id: 'MSN-0141', title: 'Upgrade Next.js 14 → 15.3', objective: 'Upgrade the framework, migrate async request APIs, keep all routes green.', status: 'review', elapsed: '41m', agents: 3, tasksDone: 9, tasksTotal: 9, tokens: '2.10M', compute: '$4.62', workspace: 'acme/storefront', updated: '38m ago' },
  { id: 'MSN-0139', title: 'Implement Stripe checkout', objective: 'Implement Stripe checkout, delegate frontend and backend work, test, deploy to staging and verify.', status: 'verified', elapsed: '1h 12m', agents: 5, tasksDone: 16, tasksTotal: 16, tokens: '3.84M', compute: '$8.91', workspace: 'acme/storefront', updated: 'yesterday' },
  { id: 'MSN-0138', title: 'Triage flaky checkout e2e test', objective: 'Find the root cause of the intermittent checkout.spec failure and fix it.', status: 'failed', elapsed: '22m', agents: 2, tasksDone: 3, tasksTotal: 5, tokens: '640k', compute: '$1.12', workspace: 'acme/storefront', updated: 'Oct 8' },
  { id: 'MSN-0136', title: 'Add OpenTelemetry tracing to API', objective: 'Instrument the API with OTel spans for every route and DB call.', status: 'done', elapsed: '33m', agents: 2, tasksDone: 7, tasksTotal: 7, tokens: '1.02M', compute: '$2.04', workspace: 'acme/storefront', updated: 'Oct 6' },
];

const be_files: FileTouch[] = [
  { path: 'src/auth/session.ts', add: 142, del: 38, agent: 'be', task: 'T5', status: 'modified' },
  { path: 'src/auth/tokens.ts', add: 64, del: 12, agent: 'be', task: 'T5', status: 'modified' },
  { path: 'src/middleware.ts', add: 19, del: 22, agent: 'be', task: 'T7', status: 'modified' },
  { path: 'db/migrations/0042_token_family.sql', add: 28, del: 0, agent: 'be', task: 'T4', status: 'added' },
];

export const agents: Agent[] = [
  {
    id: 'orch', name: 'Atlas Orchestrator', mark: 'OR', role: 'Orchestrator', model: 'Claude Opus 5.5', status: 'running',
    assignment: 'Decompose MSN-0142, delegate, and gate the staging deploy on verification.',
    activity: 'Coordinating 5 agents · re-planning T8 around contract v2',
    children: ['be', 'fe', 'sec', 'qa', 'ops'], worktree: '—', branch: 'feat/auth-refactor', environment: 'Host · read-only',
    context: { used: 84_000, limit: 200_000 }, tools: ['plan', 'delegate', 'read', 'search', 'checkpoint'],
    permissions: [
      { scope: 'Filesystem', level: 'allow', detail: 'Read entire workspace' },
      { scope: 'Filesystem write', level: 'deny', detail: 'Delegates writes to engineers' },
      { scope: 'Shell', level: 'deny', detail: 'No direct execution' },
    ],
    files: [], terminals: [], lastAction: { time: '09:56:41', text: 'Delegated T12 to QA Engineer' },
    artifacts: [{ name: 'mission-plan.md', kind: 'plan' }, { name: 'threat-model.md', kind: 'doc' }], tokens: 412_000, elapsed: '14m 32s',
  },
  {
    id: 'be', name: 'Backend Engineer', mark: 'BE', role: 'Backend Engineer', model: 'Claude Sonnet 5.5', status: 'running', parent: 'orch',
    assignment: 'T5 · Rotate refresh tokens on every use; revoke the whole token family on reuse.',
    activity: 'Implementing reuse detection in rotateRefreshToken()',
    children: [], worktree: '.atlas/wt/be-auth', branch: 'atlas/msn-0142/backend', environment: 'Isolated worktree · local Postgres 16 (docker)',
    context: { used: 118_400, limit: 200_000 }, tools: ['read', 'edit', 'shell', 'test', 'search', 'git'],
    permissions: [
      { scope: 'Filesystem write', level: 'allow', detail: 'src/auth/**, src/middleware.ts, db/migrations/**' },
      { scope: 'Shell', level: 'allow', detail: 'pnpm test*, pnpm lint, git (no push)' },
      { scope: 'Database', level: 'ask', detail: 'Schema changes need approval' },
      { scope: 'Network', level: 'deny', detail: 'No outbound network' },
    ],
    files: be_files, terminals: ['t-be'], lastAction: { time: '09:56:58', text: 'Edited src/auth/session.ts (+18 −4)' },
    artifacts: [{ name: 'api-contract-v2.yaml', kind: 'contract · draft' }],
    tokens: 386_000, elapsed: '13m 50s',
  },
  {
    id: 'fe', name: 'Frontend Engineer', mark: 'FE', role: 'Frontend Engineer', model: 'Claude Sonnet 5.5', status: 'waiting', parent: 'orch',
    assignment: 'T8 · Update the auth client and useSession() for rotating refresh tokens.',
    activity: 'Waiting for API contract v2 from Backend Engineer',
    children: [], worktree: '.atlas/wt/fe-auth', branch: 'atlas/msn-0142/frontend', environment: 'Isolated worktree',
    context: { used: 41_200, limit: 200_000 }, tools: ['read', 'edit', 'shell', 'test', 'browser'],
    permissions: [
      { scope: 'Filesystem write', level: 'allow', detail: 'app/**, lib/auth-client/**' },
      { scope: 'Shell', level: 'allow', detail: 'pnpm test*, pnpm lint' },
      { scope: 'Network', level: 'deny', detail: 'No outbound network' },
    ],
    files: [{ path: 'lib/auth-client/refresh.ts', add: 12, del: 3, agent: 'fe', task: 'T8', status: 'modified' }],
    terminals: [], lastAction: { time: '09:51:20', text: 'Requested contract v2 from Backend Engineer' },
    blocker: 'Depends on T6 · API contract v2 (Backend Engineer, est. 3 min)', artifacts: [], tokens: 96_000, elapsed: '9m 02s',
  },
  {
    id: 'sec', name: 'Security Engineer', mark: 'SE', role: 'Security Engineer', model: 'Claude Opus 5.5', status: 'running', parent: 'orch',
    assignment: 'T10 · Review session handling, CSRF and cookie scope on /api/auth/*.',
    activity: 'Inspecting cookie attributes in src/middleware.ts',
    children: [], worktree: 'read-only mount', branch: 'atlas/msn-0142/backend', environment: 'Read-only · semgrep sandbox',
    context: { used: 152_900, limit: 200_000 }, tools: ['read', 'search', 'semgrep', 'comment'],
    permissions: [
      { scope: 'Filesystem', level: 'allow', detail: 'Read workspace' },
      { scope: 'Filesystem write', level: 'deny', detail: 'Findings only, never edits' },
      { scope: 'Shell', level: 'allow', detail: 'semgrep, rg' },
    ],
    files: [], terminals: ['t-sec'], lastAction: { time: '09:55:09', text: 'Opened finding SEC-2 · cookie Path too narrow' },
    artifacts: [{ name: 'findings.sarif', kind: 'report' }], tokens: 298_000, elapsed: '11m 15s',
  },
  {
    id: 'qa', name: 'QA Engineer', mark: 'QA', role: 'QA Engineer', model: 'Claude Sonnet 5.5', status: 'failed', parent: 'orch',
    assignment: 'T12 · Browser QA for login, refresh and logout flows.',
    activity: '1 of 12 Playwright tests failed · logout clears session',
    children: [], worktree: '.atlas/wt/qa-auth', branch: 'atlas/msn-0142/backend', environment: 'Isolated automation browser · Chromium 141',
    context: { used: 63_700, limit: 200_000 }, tools: ['browser', 'shell', 'test', 'screenshot'],
    permissions: [
      { scope: 'Browser', level: 'allow', detail: 'Isolated profile, localhost:3000 only' },
      { scope: 'Shell', level: 'allow', detail: 'pnpm playwright*' },
      { scope: 'Network', level: 'ask', detail: 'Hosts outside localhost need approval' },
    ],
    files: [{ path: 'e2e/auth.spec.ts', add: 88, del: 0, agent: 'qa', task: 'T11', status: 'added' }],
    terminals: ['t-qa'], lastAction: { time: '09:56:12', text: 'Test failed: logout clears session' },
    blocker: 'Cookie __Host-session survives logout — likely Path=/api in middleware.ts', artifacts: [{ name: 'trace-logout.zip', kind: 'playwright trace' }, { name: 'logout-after.png', kind: 'screenshot' }], tokens: 151_000, elapsed: '6m 40s',
  },
  {
    id: 'ops', name: 'DevOps Engineer', mark: 'DO', role: 'DevOps Engineer', model: 'Claude Haiku 5.5', status: 'blocked', parent: 'orch',
    assignment: 'T13 · Deploy the verified branch to staging; T14 · verify and report.',
    activity: 'Blocked on verification gate — needs Security + QA sign-off',
    children: [], worktree: '—', branch: 'atlas/msn-0142/backend', environment: 'Deploy runner · staging (fly.io)',
    context: { used: 12_300, limit: 200_000 }, tools: ['deploy', 'http-check', 'logs', 'browser'],
    permissions: [
      { scope: 'Deploy', level: 'allow', detail: 'staging only' },
      { scope: 'Deploy production', level: 'deny', detail: 'Requires your explicit authorization' },
      { scope: 'Network', level: 'allow', detail: '*.staging.acme.dev' },
    ],
    files: [], terminals: ['t-ops'], lastAction: { time: '09:49:30', text: 'Prepared deploy plan for staging' },
    blocker: 'Gate: T10 security review and T12 browser QA must pass', artifacts: [{ name: 'deploy-plan.txt', kind: 'plan' }], tokens: 31_000, elapsed: '2m 10s',
  },
  {
    id: 'pe', name: 'Principal Engineer', mark: 'PE', role: 'Principal Engineer', model: 'Claude Opus 5.5', status: 'idle',
    assignment: 'Not assigned to the current mission.', activity: 'Idle', children: [], worktree: '—', branch: '—', environment: '—',
    context: { used: 0, limit: 200_000 }, tools: ['read', 'plan', 'review'], permissions: [], files: [], terminals: [],
    lastAction: { time: 'Oct 9', text: 'Reviewed MSN-0139 architecture' }, artifacts: [], tokens: 0, elapsed: '—',
  },
  {
    id: 'rev', name: 'Code Reviewer', mark: 'CR', role: 'Code Reviewer', model: 'Claude Sonnet 5.5', status: 'idle',
    assignment: 'Queued: review MSN-0142 once T5–T9 complete.', activity: 'Queued', children: [], worktree: '—', branch: '—', environment: '—',
    context: { used: 0, limit: 200_000 }, tools: ['read', 'comment', 'diff'], permissions: [], files: [], terminals: [],
    lastAction: { time: '38m ago', text: 'Approved MSN-0141 with 2 comments' }, artifacts: [], tokens: 0, elapsed: '—',
  },
];

export const agentById = (id: string) => agents.find((a) => a.id === id) ?? agents[0];

export const tasks: Task[] = [
  { id: 'T1', title: 'Map the auth surface', agent: 'orch', status: 'done', deps: [], phase: 0, duration: '48s' },
  { id: 'T2', title: 'Threat-model auth flows', agent: 'sec', status: 'done', deps: ['T1'], phase: 1, duration: '2m 10s' },
  { id: 'T3', title: 'Design token-family schema', agent: 'be', status: 'done', deps: ['T1'], phase: 1, duration: '1m 31s' },
  { id: 'T4', title: 'Migration 0042_token_family', agent: 'be', status: 'done', deps: ['T3'], phase: 2, duration: '1m 05s' },
  { id: 'T7', title: 'Harden session middleware', agent: 'be', status: 'done', deps: ['T2'], phase: 2, duration: '2m 44s' },
  { id: 'T11', title: 'Generate regression tests', agent: 'qa', status: 'done', deps: ['T2'], phase: 2, duration: '1m 50s' },
  { id: 'T5', title: 'Refresh-token rotation', agent: 'be', status: 'running', deps: ['T4'], phase: 3 },
  { id: 'T10', title: 'Security review: session & CSRF', agent: 'sec', status: 'running', deps: ['T7'], phase: 3 },
  { id: 'T6', title: 'Publish API contract v2', agent: 'be', status: 'pending', deps: ['T5'], phase: 4 },
  { id: 'T12', title: 'Browser QA: login · refresh · logout', agent: 'qa', status: 'failed', deps: ['T11', 'T7'], phase: 3 },
  { id: 'T8', title: 'Update auth client & useSession()', agent: 'fe', status: 'waiting', deps: ['T6'], phase: 5 },
  { id: 'T9', title: 'Session-expiry UI states', agent: 'fe', status: 'pending', deps: ['T8'], phase: 6 },
  { id: 'T13', title: 'Deploy to staging', agent: 'ops', status: 'blocked', deps: ['T10', 'T12', 'T9'], phase: 7 },
  { id: 'T14', title: 'Verify staging & report', agent: 'ops', status: 'pending', deps: ['T13'], phase: 8 },
];

export const timeline: TimelineEvent[] = [
  { id: 'e1', time: '09:42:11', agent: 'orch', kind: 'milestone', title: 'Mission started', detail: 'Plan approved: 14 tasks across 6 agents. Checkpoint CP-6 created.', meta: 'CP-6' },
  { id: 'e2', time: '09:42:13', agent: 'be', kind: 'activity', title: 'Backend Engineer initialized', detail: 'Created isolated worktree .atlas/wt/be-auth on atlas/msn-0142/backend', children: [
    { time: '09:42:13', text: 'git worktree add .atlas/wt/be-auth', meta: '0.4s' },
    { time: '09:42:15', text: 'pnpm install --frozen-lockfile', meta: '11.2s' },
    { time: '09:42:27', text: 'docker compose up -d postgres', meta: '3.1s' },
  ] },
  { id: 'e3', time: '09:42:58', agent: 'orch', kind: 'delegation', title: 'Delegated T2 threat model to Security Engineer', meta: 'T2' },
  { id: 'e4', time: '09:43:04', agent: 'be', kind: 'file', title: 'Authentication schema updated', detail: 'Added token_family and replaced_by columns', meta: '+28 −0', children: [
    { time: '09:43:04', text: 'db/migrations/0042_token_family.sql', meta: '+28' },
  ] },
  { id: 'e5', time: '09:44:02', agent: 'orch', kind: 'decision', title: 'Rotate on every refresh; revoke family on reuse', detail: 'Chosen over sliding expiry: detects stolen refresh tokens. Trade-off: one extra write per refresh. Source: T2 threat model §3.' },
  { id: 'e6', time: '09:44:28', agent: 'fe', kind: 'delegation', title: 'Frontend Engineer received API contract v1', detail: 'Contract v2 pending — refresh response adds `family_id`.', meta: 'T8' },
  { id: 'e7', time: '09:45:09', agent: 'sec', kind: 'error', title: 'Security reviewer identified a potential issue', detail: 'SEC-1 · Two concurrent refreshes can both succeed before revocation (race).', meta: 'High' },
  { id: 'e8', time: '09:45:35', agent: 'qa', kind: 'test', title: 'Verification test generated', detail: 'e2e/auth.spec.ts · 12 cases including concurrent-refresh reuse.', meta: '+88' },
  { id: 'e9', time: '09:46:02', agent: 'qa', kind: 'milestone', title: 'Regression test passed', detail: 'refresh-reuse.spec: family revoked on second use.', meta: '1.8s' },
  { id: 'e10', time: '09:47:40', agent: 'be', kind: 'approval', title: 'Approved: apply migration to local dev database', detail: 'Approved by you · once', meta: 'CP-8' },
  { id: 'e11', time: '09:51:12', agent: 'be', kind: 'file', title: 'Session middleware hardened', detail: 'SameSite=Lax, __Host- prefix, Secure', meta: '+19 −22', children: [
    { time: '09:51:12', text: 'src/middleware.ts', meta: '+19 −22' },
  ] },
  { id: 'e12', time: '09:55:09', agent: 'sec', kind: 'error', title: 'SEC-2 · Cookie Path=/api leaves stale session at /', detail: 'Logout clears /api scope only.', meta: 'Medium' },
  { id: 'e13', time: '09:56:12', agent: 'qa', kind: 'error', title: 'Test failed: logout clears session', detail: 'Expected cookie __Host-session to be absent after logout; found 1.', meta: '1 / 12' },
  { id: 'e14', time: '09:56:30', agent: 'be', kind: 'approval', title: 'Approval requested: run migration on dev database', detail: 'pnpm db:migrate --to 0043', meta: 'Waiting' },
];

// Events the prototype's sample adapter appends while the mission screen is open.
export const liveEvents: TimelineEvent[] = [
  { id: 'l1', time: '09:57:04', agent: 'be', kind: 'file', title: 'Reuse detection implemented', detail: 'rotateRefreshToken() revokes the family inside one transaction', meta: '+18 −4' },
  { id: 'l2', time: '09:57:19', agent: 'be', kind: 'test', title: 'pnpm vitest run src/auth', detail: '38 passed', meta: '4.1s' },
  { id: 'l3', time: '09:57:31', agent: 'sec', kind: 'activity', title: 'semgrep: p/owasp-top-ten on src/auth', detail: '0 new findings', meta: '6.0s' },
  { id: 'l4', time: '09:57:48', agent: 'orch', kind: 'decision', title: 'Route SEC-2 to Backend Engineer before T6', detail: 'Cookie scope fix is a 1-line change and unblocks QA logout test.' },
  { id: 'l5', time: '09:58:02', agent: 'be', kind: 'milestone', title: 'SEC-1 race fixed and verified', detail: 'concurrent-refresh.spec passed 50/50 runs', meta: '50/50' },
];

export const approvals: Approval[] = [
  {
    id: 'AP-31', agent: 'be', kind: 'shell', title: 'Run a database migration',
    action: 'pnpm db:migrate --to 0043_family_index',
    environment: 'Worktree .atlas/wt/be-auth · local Postgres 16 (docker: atlas-pg-be)',
    resources: ['database storefront_dev', 'tables refresh_tokens, sessions', 'adds index idx_refresh_family'],
    duration: 'This command, once', reason: 'Schema changes require approval under your workspace policy (Database: ask).',
    risk: 'elevated', requestedAt: '09:56:30',
  },
  {
    id: 'AP-32', agent: 'qa', kind: 'network', title: 'Allow network access',
    action: 'https://auth.staging.acme.dev',
    environment: 'Isolated automation browser · Chromium 141',
    resources: ['GET, POST to auth.staging.acme.dev', 'no cookies shared with your profile'],
    duration: '30 minutes', reason: 'QA Engineer’s browser is limited to localhost:3000. Staging hosts need approval.',
    risk: 'low', requestedAt: '09:56:44',
  },
];

const y = 'var(--term-yellow)';
export const terminals: TerminalSession[] = [
  {
    id: 't-be', title: 'vitest · auth', owner: 'agent', agent: 'be', cwd: '.atlas/wt/be-auth', command: 'pnpm vitest run src/auth --reporter=dot', status: 'running', duration: '00:04', pid: 48211, recording: true,
    lines: [
      { t: 'cmd', text: 'pnpm vitest run src/auth --reporter=dot' },
      { t: 'dim', text: ' RUN  v2.1.8 /Users/premal/code/acme/storefront/.atlas/wt/be-auth' },
      { t: 'out', text: '' },
      { t: 'ok', text: ' ✓ src/auth/tokens.test.ts (14 tests) 212ms' },
      { t: 'ok', text: ' ✓ src/auth/session.test.ts (19 tests) 488ms' },
      { t: 'out', text: ' ⋯ src/auth/rotation.test.ts', segs: [{ text: ' ⋯ ', c: y }, { text: 'src/auth/rotation.test.ts' }] },
    ],
  },
  {
    id: 't-sec', title: 'semgrep', owner: 'agent', agent: 'sec', cwd: 'read-only mount', command: 'semgrep --config p/owasp-top-ten src/auth src/middleware.ts', status: 'exited', exit: 1, duration: '6.0s', pid: 48190, recording: true,
    lines: [
      { t: 'cmd', text: 'semgrep --config p/owasp-top-ten src/auth src/middleware.ts' },
      { t: 'dim', text: 'Scanning 9 files with 412 rules.' },
      { t: 'out', text: '' },
      { t: 'path', text: '  src/middleware.ts' },
      { t: 'warn', text: '     cookie-path-too-narrow' },
      { t: 'out', text: '        Session cookie scoped to /api — logout at / leaves it intact.' },
      { t: 'dim', text: '        41┆ res.cookies.set("__Host-session", token, { path: "/api", ...opts })' },
      { t: 'out', text: '' },
      { t: 'err', text: 'Ran 412 rules on 9 files: 1 finding.' },
    ],
  },
  {
    id: 't-qa', title: 'playwright · auth', owner: 'agent', agent: 'qa', cwd: '.atlas/wt/qa-auth', command: 'pnpm playwright test e2e/auth.spec.ts --project=chromium', status: 'failed', exit: 1, duration: '38.4s', pid: 48302, recording: true,
    lines: [
      { t: 'cmd', text: 'pnpm playwright test e2e/auth.spec.ts --project=chromium' },
      { t: 'dim', text: 'Running 12 tests using 4 workers' },
      { t: 'ok', text: '  ✓  1 [chromium] › auth.spec.ts:8:3 › login with valid credentials (2.1s)' },
      { t: 'ok', text: '  ✓  2 [chromium] › auth.spec.ts:21:3 › rejects wrong password (1.2s)' },
      { t: 'ok', text: '  ✓  3 [chromium] › auth.spec.ts:33:3 › refresh rotates token (1.9s)' },
      { t: 'ok', text: '  ✓  4 [chromium] › auth.spec.ts:47:3 › reused refresh revokes family (2.4s)' },
      { t: 'err', text: '  ✘  5 [chromium] › auth.spec.ts:62:3 › logout clears session (3.0s)' },
      { t: 'ok', text: '  ✓  6 [chromium] › auth.spec.ts:78:3 › expired session redirects to /login (1.4s)' },
      { t: 'dim', text: '  … 6 more passed' },
      { t: 'out', text: '' },
      { t: 'err', text: '  1) logout clears session' },
      { t: 'out', text: '     Error: expect(received).toBeUndefined()' },
      { t: 'out', text: '     Received: { name: "__Host-session", path: "/api", … }' },
      { t: 'path', text: '       at e2e/auth.spec.ts:71:52' },
      { t: 'out', text: '' },
      { t: 'err', text: '  1 failed' },
      { t: 'ok', text: '  11 passed (38.4s)' },
    ],
  },
  {
    id: 't-ops', title: 'deploy plan', owner: 'agent', agent: 'ops', cwd: 'deploy runner', command: 'atlas deploy plan --env staging', status: 'idle', duration: '—', pid: 48120, recording: true,
    lines: [
      { t: 'cmd', text: 'atlas deploy plan --env staging' },
      { t: 'out', text: '  target     fly.io · storefront-staging (iad)' },
      { t: 'out', text: '  source     atlas/msn-0142/backend @ pending' },
      { t: 'out', text: '  migrations 0042_token_family, 0043_family_index' },
      { t: 'warn', text: '  gate       waiting · security review, browser QA' },
    ],
  },
  {
    id: 't-me', title: 'zsh', owner: 'human', cwd: '~/code/acme/storefront', command: 'zsh', status: 'idle', duration: '12m', pid: 47002, recording: false,
    lines: [
      { t: 'cmd', text: 'git log --oneline -5' },
      { t: 'out', text: '', segs: [{ text: 'a41f9c2 ', c: y }, { text: 'auth: rotate refresh tokens per use' }] },
      { t: 'out', text: '', segs: [{ text: '9be03d1 ', c: y }, { text: 'auth: token family schema (0042)' }] },
      { t: 'out', text: '', segs: [{ text: '77c1a0e ', c: y }, { text: 'middleware: __Host- cookie prefix, SameSite=Lax' }] },
      { t: 'out', text: '', segs: [{ text: '3d0b9f4 ', c: y }, { text: 'checkout: Stripe webhooks idempotency' }] },
      { t: 'out', text: '', segs: [{ text: 'c82e511 ', c: y }, { text: 'chore: bump next to 15.3.1' }] },
    ],
  },
];

export const liveTermLines: Record<string, string[]> = {
  't-be': [
    ' ✓ src/auth/rotation.test.ts (5 tests) 1104ms',
    '',
    ' Test Files  3 passed (3)',
    '      Tests  38 passed (38)',
    '   Duration  4.12s',
  ],
};

export const checkpoints: Checkpoint[] = [
  { id: 'CP-9', time: '09:55:20', label: 'Before SEC-2 cookie fix', by: 'Atlas Orchestrator', files: 4, note: 'Auto · before routing a security fix' },
  { id: 'CP-8', time: '09:47:40', label: 'Migration 0042 applied (dev)', by: 'Backend Engineer', files: 3, note: 'Auto · after an approved schema change' },
  { id: 'CP-7', time: '09:44:02', label: 'Token-family design accepted', by: 'Atlas Orchestrator', files: 1, note: 'Auto · after a recorded decision' },
  { id: 'CP-6', time: '09:42:11', label: 'Mission start', by: 'You', files: 0, note: 'Clean tree at 9be03d1' },
];

export const findings: ReviewFinding[] = [
  { id: 'SEC-1', severity: 'high', title: 'Concurrent refreshes can both succeed before revocation', file: 'src/auth/session.ts', line: 58, agent: 'sec', status: 'fixed', body: 'Two requests holding the same refresh token race between SELECT and UPDATE. Wrap rotation in a transaction with SELECT … FOR UPDATE, or use a conditional UPDATE on replaced_by IS NULL.' },
  { id: 'SEC-2', severity: 'medium', title: 'Session cookie scoped to /api survives logout at /', file: 'src/middleware.ts', line: 41, agent: 'sec', status: 'open', body: '__Host- cookies must use Path=/. The current Path=/api means the logout handler at / cannot clear it. Matches QA failure in auth.spec.ts:71.' },
  { id: 'RV-3', severity: 'low', title: 'Magic number for family TTL', file: 'src/auth/tokens.ts', line: 12, agent: 'sec', status: 'open', body: 'Move 60 * 60 * 24 * 30 into config/auth.ts as REFRESH_FAMILY_TTL_SECONDS.' },
];

export const reviewFiles: FileTouch[] = [...be_files, { path: 'e2e/auth.spec.ts', add: 88, del: 0, agent: 'qa', task: 'T11', status: 'added' }, { path: 'lib/auth-client/refresh.ts', add: 12, del: 3, agent: 'fe', task: 'T8', status: 'modified' }];

export const sessionBefore = `import { db } from '@/db';
import { signAccessToken, newRefreshToken } from './tokens';

export async function refreshSession(refreshToken: string) {
  const row = await db.refreshTokens.find({ token: refreshToken });
  if (!row || row.expiresAt < new Date()) {
    throw new AuthError('invalid_refresh');
  }
  // Sliding expiry: extend the same token.
  await db.refreshTokens.update(row.id, {
    expiresAt: addDays(new Date(), 30),
  });
  return {
    accessToken: await signAccessToken(row.userId),
    refreshToken,
  };
}`;

export const sessionAfter = `import { db } from '@/db';
import { signAccessToken, newRefreshToken } from './tokens';
import { REFRESH_FAMILY_TTL } from '@/config/auth';

export async function refreshSession(refreshToken: string) {
  return db.transaction(async (tx) => {
    const row = await tx.refreshTokens.findForUpdate({ token: refreshToken });
    if (!row || row.expiresAt < new Date()) {
      throw new AuthError('invalid_refresh');
    }
    // Reuse of a rotated token means it was stolen: revoke the family.
    if (row.replacedBy !== null) {
      await tx.refreshTokens.revokeFamily(row.familyId);
      throw new AuthError('refresh_reuse_detected');
    }
    const next = newRefreshToken(row.familyId, REFRESH_FAMILY_TTL);
    await tx.refreshTokens.insert(next);
    await tx.refreshTokens.update(row.id, { replacedBy: next.id });
    return {
      accessToken: await signAccessToken(row.userId),
      refreshToken: next.token,
      familyId: row.familyId,
    };
  });
}`;

export const middlewareBefore = `export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set('session', token, {
    httpOnly: true,
    path: '/',
  });
}`;

export const middlewareAfter = `export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set('__Host-session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api',
  });
}`;

export const pipeline: PipelineStage[] = [
  { id: 'commit', name: 'Commit', status: 'passed', duration: '—', summary: '3d0b9f4 · checkout: Stripe webhooks idempotency', evidence: [{ label: 'Signed', value: 'Atlas DevOps key · verified' }, { label: 'Branch', value: 'atlas/msn-0139/checkout' }], logs: ['git rev-parse HEAD → 3d0b9f4e1c0a', 'git verify-commit 3d0b9f4 → Good signature'], artifacts: [] },
  { id: 'build', name: 'Build', status: 'passed', duration: '1m 12s', summary: 'next build · 0 warnings', evidence: [{ label: 'Bundle', value: '312 kB first-load JS (−4 kB)' }, { label: 'Routes', value: '41 static · 9 dynamic' }], logs: ['▲ Next.js 15.3.1', '✓ Compiled successfully in 58s', '✓ Generating static pages (41/41)'], artifacts: ['build-manifest.json'] },
  { id: 'tests', name: 'Tests', status: 'passed', duration: '2m 48s', summary: '412 passed · 0 failed · 3 skipped', evidence: [{ label: 'Unit', value: '356 passed', status: 'passed' }, { label: 'Integration', value: '56 passed', status: 'passed' }, { label: 'Coverage', value: '84.1% (+1.2)' }], logs: ['Test Files  61 passed (61)', '     Tests  412 passed | 3 skipped (415)'], artifacts: ['junit.xml', 'coverage/lcov.info'] },
  { id: 'deploy', name: 'Staging deploy', status: 'passed', duration: '54s', summary: 'fly.io · storefront-staging · v214', evidence: [{ label: 'Release', value: 'v214 · 2 machines (iad)' }, { label: 'Migrations', value: '0039_checkout_sessions applied' }], logs: ['==> Building image with Depot', '--> Pushing image done', 'Updating existing machines in \'storefront-staging\'', '✓ Machine 3d8d9e1 [app] update finished: success'], artifacts: ['release-v214.json'] },
  { id: 'api', name: 'API checks', status: 'passed', duration: '21s', summary: '18 / 18 contract checks', evidence: [{ label: 'POST /api/checkout/session', value: '201 · 184 ms', status: 'passed' }, { label: 'POST /api/stripe/webhook', value: '200 · idempotent replay ok', status: 'passed' }, { label: 'GET /api/orders/:id', value: '200 · schema valid', status: 'passed' }], logs: ['18 checks against openapi.yaml@3d0b9f4'], artifacts: ['api-checks.json'] },
  { id: 'qa', name: 'Browser QA', status: 'passed', duration: '3m 06s', summary: '6 / 6 user flows', evidence: [{ label: 'Guest checkout · card 4242', value: 'Order confirmed', status: 'passed' }, { label: '3-D Secure challenge', value: 'Completed', status: 'passed' }, { label: 'Declined card 0002', value: 'Error shown, no order', status: 'passed' }, { label: 'Apply promo SAVE10', value: 'Total updated', status: 'passed' }], logs: ['Isolated automation browser · Chromium 141', '6 flows · 23 screenshots · 0 console errors'], artifacts: ['qa-report.html', 'flows.zip'] },
  { id: 'health', name: 'Runtime health', status: 'warning', duration: '5m 00s', summary: 'Healthy · 1 warning', evidence: [{ label: 'Error rate', value: '0.00% (5 min)', status: 'passed' }, { label: 'p95 /api/checkout/session', value: '412 ms · budget 300 ms', status: 'warning' }, { label: 'Memory', value: '61% of 1 GB', status: 'passed' }], logs: ['Synthetic traffic: 120 req/min for 5 min', 'p95 412ms on /api/checkout/session (Stripe API round-trip)'], artifacts: ['health-window.json'] },
  { id: 'approval', name: 'Approval', status: 'locked', summary: 'Production promotion requires your authorization', evidence: [], logs: [], artifacts: [] },
];

export const deployments = [
  { id: 'DEP-312', env: 'staging', mission: 'MSN-0139', commit: '3d0b9f4', status: 'verified · 1 warning', when: 'yesterday 17:42' },
  { id: 'DEP-309', env: 'staging', mission: 'MSN-0136', commit: '1e77b2c', status: 'verified', when: 'Oct 6' },
  { id: 'DEP-305', env: 'production', mission: 'MSN-0131', commit: '88a0c4d', status: 'live', when: 'Oct 3' },
  { id: 'DEP-301', env: 'staging', mission: 'MSN-0129', commit: '0f3a19e', status: 'rolled back', when: 'Oct 1' },
];

export const models = [
  { id: 'opus', name: 'Claude Opus 5.5', provider: 'Anthropic', ctx: '200k', role: 'Orchestration, security review', status: 'connected' },
  { id: 'sonnet', name: 'Claude Sonnet 5.5', provider: 'Anthropic', ctx: '200k', role: 'Engineering, QA', status: 'connected' },
  { id: 'haiku', name: 'Claude Haiku 5.5', provider: 'Anthropic', ctx: '200k', role: 'Deploy, summaries', status: 'connected' },
  { id: 'qwen', name: 'qwen3-coder:30b', provider: 'Local · Ollama', ctx: '128k', role: 'Offline sandbox', status: 'connected' },
];

export const providers = [
  { id: 'anthropic', name: 'Anthropic', detail: 'API key · ···· 9f2c · org acme', status: 'connected' as const },
  { id: 'bedrock', name: 'Amazon Bedrock', detail: 'Not configured', status: 'off' as const },
  { id: 'vertex', name: 'Google Vertex AI', detail: 'Not configured', status: 'off' as const },
  { id: 'ollama', name: 'Ollama (local)', detail: 'http://127.0.0.1:11434 · 2 models', status: 'connected' as const },
];

export const browserActions = [
  { time: '09:55:41', text: 'Navigate to http://localhost:3000/login', status: 'done' },
  { time: '09:55:43', text: 'Fill “Email” with qa+auth@acme.dev', status: 'done' },
  { time: '09:55:44', text: 'Fill “Password” with ••••••••', status: 'done' },
  { time: '09:55:45', text: 'Click “Sign in”', status: 'done' },
  { time: '09:55:47', text: 'Assert URL is /account', status: 'verified' },
  { time: '09:55:52', text: 'Click “Sign out” in account menu', status: 'done' },
  { time: '09:55:53', text: 'Assert cookie __Host-session is cleared', status: 'failed' },
  { time: '09:55:54', text: 'Capture screenshot logout-after.png', status: 'done' },
];

export const templates = [
  { id: 'swe', name: 'Software Engineer', mark: 'SW', desc: 'Implements scoped changes in an isolated worktree, writes tests first.', tools: 6 },
  { id: 'arch', name: 'Architecture Reviewer', mark: 'AR', desc: 'Reads plans and diffs, flags coupling and migration risk. Never edits.', tools: 3 },
  { id: 'sec', name: 'Security Analyst', mark: 'SA', desc: 'Threat-models, runs semgrep and dependency audits, files findings.', tools: 4 },
  { id: 'bqa', name: 'Browser QA', mark: 'BQ', desc: 'Drives an isolated browser through user flows and records evidence.', tools: 4 },
  { id: 'dep', name: 'Deployment Engineer', mark: 'DE', desc: 'Deploys to non-production, runs health checks, writes release reports.', tools: 5 },
];

export const activity = [
  { time: '09:56', who: 'QA Engineer', text: 'Test failed: logout clears session', kind: 'error' as const, mission: 'MSN-0142' },
  { time: '09:55', who: 'Security Engineer', text: 'Opened SEC-2 · cookie Path too narrow', kind: 'warn' as const, mission: 'MSN-0142' },
  { time: '09:47', who: 'You', text: 'Approved migration 0042 on dev database', kind: 'human' as const, mission: 'MSN-0142' },
  { time: '09:42', who: 'You', text: 'Started MSN-0142', kind: 'human' as const, mission: 'MSN-0142' },
  { time: '09:04', who: 'Code Reviewer', text: 'Approved MSN-0141 with 2 comments', kind: 'ok' as const, mission: 'MSN-0141' },
  { time: 'Yest.', who: 'DevOps Engineer', text: 'DEP-312 verified on staging · 1 warning', kind: 'ok' as const, mission: 'MSN-0139' },
];
