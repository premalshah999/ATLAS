// Owns every virtual desktop session and the controller lease (manual §26–27).
// The operator can take over, hand back, pause, resume or stop at any time; each change is recorded.
import { AtlasError, type DesktopAction, type DesktopControl, type DesktopController, type DesktopSessionInfo } from '@atlas/contracts';
import type { SandboxSpec } from '@atlas/terminal';
import { DesktopSession } from './session';

const TRANSITIONS: Record<DesktopControl, { from: DesktopController[]; to: DesktopController }> = {
  takeover: { from: ['agent', 'paused'], to: 'operator' },
  release: { from: ['operator'], to: 'agent' },
  pause: { from: ['agent', 'operator'], to: 'paused' },
  resume: { from: ['paused'], to: 'agent' },
  stop: { from: ['agent', 'operator', 'paused'], to: 'stopped' },
};

export interface DesktopObserver {
  /** A session started, changed controller or ended. `by` is who caused it. */
  session(info: DesktopSessionInfo, change: string, by: 'agent' | 'operator' | 'system'): void;
  /** The operator sent input during a takeover (agent input is reported by the tool). */
  operatorInput?(info: DesktopSessionInfo, action: DesktopAction, ok: boolean, message: string): void;
}

export class DesktopManager {
  private readonly sessions = new Map<string, DesktopSession>();
  constructor(private readonly observer: DesktopObserver) {}

  async open(owner: { missionId: string; taskId: string | null; worktree: string }, sandbox: SandboxSpec | null | 'unsandboxed', size?: { width: number; height: number }) {
    const s = new DesktopSession(owner, sandbox, size);
    await s.start();
    this.sessions.set(s.id, s);
    this.observer.session(s.info(), 'started', 'agent');
    return s;
  }

  list(): DesktopSessionInfo[] { return [...this.sessions.values()].map((s) => s.info()); }
  get(id: string) { return this.sessions.get(id) ?? null; }

  private must(id: string) {
    const s = this.sessions.get(id);
    if (!s) throw new AtlasError('invalid_request', 'No such desktop session (it may have ended)');
    return s;
  }

  async control(id: string, op: DesktopControl): Promise<DesktopSessionInfo> {
    const s = this.must(id);
    const t = TRANSITIONS[op];
    if (!t.from.includes(s.controller)) throw new AtlasError('invalid_request', `Cannot ${op} while the desktop is ${s.controller}`);
    if (op === 'stop') { await this.close(id, 'operator', 'stopped by operator'); return s.info(); }
    s.setController(t.to);
    this.observer.session(s.info(), op, 'operator');
    return s.info();
  }

  async operatorInput(id: string, action: DesktopAction) {
    const s = this.must(id);
    const r = await s.act('operator', action);
    this.observer.operatorInput?.(s.info(), action, r.ok, r.message);
    return r;
  }

  async frame(id: string): Promise<{ png: string; info: DesktopSessionInfo }> {
    const s = this.must(id);
    if (s.controller === 'stopped') throw new AtlasError('invalid_request', 'Desktop session has ended');
    return { png: (await s.screenshot()).toString('base64'), info: s.info() };
  }

  async close(id: string, by: 'agent' | 'operator' | 'system', change = 'ended') {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    await s.stop();
    this.observer.session(s.info(), change, by);
  }

  async closeMission(missionId: string) {
    for (const s of [...this.sessions.values()]) if (s.owner.missionId === missionId) await this.close(s.id, 'system', 'mission ended');
  }

  async shutdown() { for (const id of [...this.sessions.keys()]) await this.close(id, 'system', 'daemon stopped'); }
}
