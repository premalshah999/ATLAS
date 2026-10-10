// desktop_action for the desktop_operator role. A session starts on first use and only if the operator
// enabled desktop control in Settings AND approves this session once. It ends with the attempt.
import { DesktopAction, type Approval, type ToolResult } from '@atlas/contracts';
import type { SandboxSpec } from '@atlas/terminal';
import type { DesktopManager } from './manager';
import { desktopSupport, type DesktopSession } from './session';

export interface DesktopToolOptions {
  manager: DesktopManager;
  missionId: string;
  taskId: string;
  worktree: string;
  /** Spec for launched apps; null = no OS sandbox (nothing is launched); 'unsandboxed' = operator allowed it. */
  sandbox: SandboxSpec | null | 'unsandboxed';
  enabled(): boolean;
  requestApproval(a: Pick<Approval, 'tool' | 'capability' | 'action' | 'environment' | 'resources' | 'reason' | 'risk'>): Promise<Approval>;
  putScreenshot(name: string, png: Buffer): string;
  emit(type: 'desktop.action' | 'desktop.session', payload: Record<string, unknown>, artifactIds: string[]): void;
  size?: { width: number; height: number };
}

const fail = (output: string, error: ToolResult['error'] = 'process_failed'): ToolResult => ({ ok: false, output, exitCode: null, artifactIds: [], error });

export function createDesktopTool(o: DesktopToolOptions) {
  let session: DesktopSession | null = null;
  let refused: string | null = null;
  let refusedKind: ToolResult['error'] = 'policy_denied';
  return {
    async invoke(raw: unknown): Promise<ToolResult> {
      const parsed = DesktopAction.safeParse(raw);
      if (!parsed.success) return fail(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`, 'invalid_args');
      if (refused) return fail(refused, refusedKind);
      if (!session) {
        if (!o.enabled()) { refused = 'Desktop control is turned off. The operator must enable it in Settings → Desktop control.'; return fail(refused, 'policy_denied'); }
        const support = desktopSupport();
        if (!support.ok) return fail(`Desktop control is unavailable: ${support.detail}`);
        const size = o.size ?? { width: 1280, height: 800 };
        const decision = await o.requestApproval({
          tool: 'desktop_action', capability: 'desktop.input', action: 'Start a virtual desktop session and let the agent control its mouse and keyboard',
          environment: `New virtual display (${size.width}×${size.height}, Xvfb). Your own desktop is never controlled.`,
          resources: ['virtual display', o.sandbox === null ? 'no app launching (no sandbox)' : o.sandbox === 'unsandboxed' ? 'launch apps UNSANDBOXED' : 'launch apps in the sandbox, read-only worktree'],
          reason: 'Desktop control needs the operator\'s consent for each session', risk: 'elevated',
        });
        if (decision.status !== 'approved') {
          refused = decision.status === 'expired' ? 'Desktop session approval expired' : 'The operator declined the desktop session';
          refusedKind = decision.status === 'expired' ? 'approval_expired' : 'approval_denied';
          return fail(refused, refusedKind);
        }
        try { session = await o.manager.open({ missionId: o.missionId, taskId: o.taskId, worktree: o.worktree }, o.sandbox, size); }
        catch (e) { return fail(`Could not start the virtual display: ${(e as Error).message}`); }
      }
      const a = parsed.data;
      const r = await session.act('agent', a);
      const ids: string[] = [];
      // Every input and every explicit screenshot leaves a frame as evidence of what the agent saw or did.
      if (session.controller !== 'stopped' && (a.action === 'screenshot' || r.input)) {
        try { ids.push(o.putScreenshot(`desktop ${a.action}${r.ok ? '' : ' (refused)'}`, await session.screenshot())); } catch { /* display gone */ }
      }
      o.emit('desktop.action', { sessionId: session.id, display: session.display, action: a.action, args: summarize(a), ok: r.ok, message: r.message, controller: session.controller, by: 'agent' }, ids);
      return { ok: r.ok, output: `${r.message}${ids.length ? `\nScreenshot: ${ids[0]}` : ''}\nController: ${session.controller}`, exitCode: null, artifactIds: ids, error: r.ok ? null : 'process_failed' };
    },
    async dispose() {
      if (session) await o.manager.close(session.id, 'system', 'attempt ended');
      session = null;
    },
    get session() { return session; },
  };
}

/** Typed text is recorded by length only; it may contain things the agent read from the screen. */
function summarize(a: DesktopAction): Record<string, unknown> {
  if (a.action === 'type') return { chars: a.text.length };
  const { action: _a, ...rest } = a as Record<string, unknown>;
  return rest;
}
