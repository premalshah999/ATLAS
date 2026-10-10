// Event replay (manual §12, §38): current state is reconstructable from the append-only log.
import type { AtlasEvent, MissionState, TaskState } from '@atlas/contracts';

export interface Replayed { mission: MissionState | null; tasks: Record<string, TaskState>; approvals: Record<string, string>; lastSeq: number }

export function replay(events: AtlasEvent[]): Replayed {
  const out: Replayed = { mission: null, tasks: {}, approvals: {}, lastSeq: 0 };
  let expected = 1;
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.seq !== expected) throw new Error(`Event log gap: expected seq ${expected}, found ${e.seq}`);
    expected++;
    out.lastSeq = e.seq;
    if (e.type === 'mission.created') out.mission = 'draft';
    else if (e.type === 'mission.state') out.mission = e.payload.to as MissionState;
    else if (e.type === 'task.state' && e.taskId) out.tasks[e.taskId] = e.payload.to as TaskState;
    else if (e.type === 'approval.requested') out.approvals[e.payload.approvalId as string] = 'pending';
    else if (e.type === 'approval.decided') out.approvals[e.payload.approvalId as string] = e.payload.status as string;
  }
  return out;
}
