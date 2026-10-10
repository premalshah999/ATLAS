// Surfaces decisions waiting on the operator: window title count and a toast when an agent asks.
import { useEffect } from 'react';
import { get, onEvent, useLive } from './store';
import { toast } from './toast';

export function useAttentionTitle() {
  const missions = useLive((s) => s.missions);
  const route = useLive((s) => s.route);
  useEffect(() => {
    const n = missions.reduce((a, m) => a + m.pendingApprovals + (m.state === 'awaiting_approval' ? 1 : 0), 0);
    const cur = route.screen === 'mission' ? missions.find((m) => m.id === route.missionId) : undefined;
    document.title = `${n ? `(${n}) ` : ''}${cur ? `${cur.title} — ` : ''}ATLAS`;
  }, [missions, route]);

  useEffect(() => onEvent((e) => {
    if (e.type !== 'approval.requested') return;
    const r = get().route;
    if (r.screen === 'mission' && r.missionId === e.missionId && document.hasFocus()) return;
    const m = get().missions.find((x) => x.id === e.missionId);
    toast({ tone: 'warning', title: 'An agent is waiting for your approval', body: `${String(e.payload.action)}${m ? ` · ${m.title}` : ''}. Open the mission to review it.` });
  }), []);
}
