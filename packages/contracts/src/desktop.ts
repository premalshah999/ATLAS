// Desktop control actions (manual §26–27). Shared by the agent tool and the operator's takeover input.
import { z } from 'zod';

const coord = z.number().int().min(0).max(10_000);
export const DesktopAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('screenshot') }).strict(),
  z.object({ action: z.literal('click'), x: coord, y: coord, button: z.enum(['left', 'right', 'middle']).optional(), double: z.boolean().optional() }).strict(),
  z.object({ action: z.literal('move'), x: coord, y: coord }).strict(),
  z.object({ action: z.literal('type'), text: z.string().min(1).max(2000) }).strict(),
  z.object({ action: z.literal('key'), keys: z.string().regex(/^[A-Za-z0-9_+\- ]{1,100}$/) }).strict(),
  z.object({ action: z.literal('scroll'), dx: z.number().int().min(-20).max(20).optional(), dy: z.number().int().min(-20).max(20).optional() }).strict(),
  z.object({ action: z.literal('windows') }).strict(),
  z.object({ action: z.literal('focus'), windowId: z.string().regex(/^\d{1,12}$/) }).strict(),
  z.object({ action: z.literal('launch'), app: z.string().min(1).max(200), args: z.array(z.string().max(1000)).max(20).optional() }).strict(),
  z.object({ action: z.literal('waitFor'), windowTitle: z.string().min(1).max(200), timeoutMs: z.number().int().min(100).max(60_000).optional() }).strict(),
]);
export type DesktopAction = z.infer<typeof DesktopAction>;

/** Who may emit input right now. Exactly one holder; `paused` and `stopped` mean nobody. */
export const DesktopController = z.enum(['agent', 'operator', 'paused', 'stopped']);
export type DesktopController = z.infer<typeof DesktopController>;
export const DesktopControl = z.enum(['takeover', 'release', 'pause', 'resume', 'stop']);
export type DesktopControl = z.infer<typeof DesktopControl>;

export interface DesktopSessionInfo {
  id: string; missionId: string; taskId: string | null; display: string; width: number; height: number;
  controller: DesktopController; startedAt: string; inputs: number; environment: string;
}
