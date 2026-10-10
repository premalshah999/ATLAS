// State machines (manual §12). Transitions are validated here and nowhere else.
import { AtlasError, type MissionState, type TaskState } from '@atlas/contracts';

const MISSION: Record<MissionState, MissionState[]> = {
  draft: ['planning', 'cancelled'],
  planning: ['awaiting_approval', 'failed', 'cancelled'],
  awaiting_approval: ['running', 'planning', 'cancelled'],
  running: ['verifying', 'failed', 'cancelled'],
  verifying: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

const TASK: Record<TaskState, TaskState[]> = {
  queued: ['ready', 'blocked', 'cancelled'],
  blocked: ['ready', 'cancelled', 'failed'],
  ready: ['running', 'cancelled'],
  running: ['reviewing', 'done', 'failed', 'cancelled', 'ready'],
  reviewing: ['done', 'failed', 'cancelled'],
  done: [],
  failed: [],
  cancelled: [],
};

export const TERMINAL_MISSION: ReadonlySet<MissionState> = new Set(['completed', 'failed', 'cancelled']);
export const TERMINAL_TASK: ReadonlySet<TaskState> = new Set(['done', 'failed', 'cancelled']);

export function canMission(from: MissionState, to: MissionState) { return MISSION[from].includes(to); }
export function canTask(from: TaskState, to: TaskState) { return TASK[from].includes(to); }

export function assertMission(from: MissionState, to: MissionState) {
  if (!canMission(from, to)) throw new AtlasError('invalid_request', `Mission cannot move from ${from} to ${to}`);
}
export function assertTask(from: TaskState, to: TaskState) {
  if (!canTask(from, to)) throw new AtlasError('invalid_request', `Task cannot move from ${from} to ${to}`);
}
