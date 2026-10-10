// ATLAS application contracts used by the design prototype.
// Visual components consume these shapes only; runtime adapters produce them.

export type AgentStatus = 'idle' | 'running' | 'waiting' | 'blocked' | 'failed' | 'done' | 'paused';
export type TaskStatus = 'pending' | 'running' | 'waiting' | 'blocked' | 'failed' | 'done';
export type Severity = 'high' | 'medium' | 'low' | 'info';

export interface Agent {
  id: string;
  name: string;
  mark: string; // two-letter functional mark, e.g. "BE"
  role: string;
  model: string;
  status: AgentStatus;
  assignment: string;
  activity: string; // present-tense current action
  parent?: string;
  children: string[];
  worktree: string;
  branch: string;
  environment: string;
  context: { used: number; limit: number };
  tools: string[];
  permissions: { scope: string; level: 'allow' | 'ask' | 'deny'; detail: string }[];
  files: FileTouch[];
  terminals: string[];
  lastAction: { time: string; text: string };
  blocker?: string;
  artifacts: { name: string; kind: string }[];
  tokens: number;
  elapsed: string;
}

export interface FileTouch {
  path: string;
  add: number;
  del: number;
  agent: string;
  task: string;
  status?: 'modified' | 'added' | 'deleted';
}

export interface Task {
  id: string;
  title: string;
  agent: string;
  status: TaskStatus;
  deps: string[];
  phase: number;
  duration?: string;
}

export type EventKind = 'activity' | 'decision' | 'file' | 'error' | 'approval' | 'milestone' | 'delegation' | 'test';

export interface TimelineEvent {
  id: string;
  time: string;
  agent: string;
  kind: EventKind;
  title: string;
  detail?: string;
  meta?: string;
  children?: { time: string; text: string; meta?: string }[];
}

export interface Approval {
  id: string;
  agent: string;
  kind: 'shell' | 'filesystem' | 'network' | 'sensitive' | 'deployment' | 'desktop' | 'tool';
  title: string;
  action: string; // exact command / path / host
  environment: string;
  resources: string[];
  duration: string;
  reason: string;
  risk: 'low' | 'elevated' | 'high';
  requestedAt: string;
}

export interface TermLine {
  t?: 'cmd' | 'out' | 'ok' | 'err' | 'warn' | 'dim' | 'info' | 'path';
  text: string;
  segs?: { text: string; c?: string }[];
}

export interface TerminalSession {
  id: string;
  title: string;
  owner: 'agent' | 'human';
  agent?: string;
  cwd: string;
  command: string;
  status: 'running' | 'exited' | 'failed' | 'idle';
  exit?: number;
  duration: string;
  pid: number;
  recording: boolean;
  lines: TermLine[];
}

export interface Checkpoint {
  id: string;
  time: string;
  label: string;
  by: string;
  files: number;
  note: string;
}

export interface Mission {
  id: string;
  title: string;
  objective: string;
  status: 'running' | 'review' | 'verified' | 'failed' | 'paused' | 'done' | 'draft';
  elapsed: string;
  agents: number;
  tasksDone: number;
  tasksTotal: number;
  tokens: string;
  compute: string;
  workspace: string;
  updated: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'running' | 'warning' | 'pending' | 'locked';
  duration?: string;
  summary: string;
  evidence: { label: string; value: string; status?: 'passed' | 'failed' | 'warning' }[];
  logs: string[];
  artifacts: string[];
}

export interface ReviewFinding {
  id: string;
  severity: Severity;
  title: string;
  file: string;
  line: number;
  agent: string;
  status: 'open' | 'fixed' | 'accepted';
  body: string;
}
