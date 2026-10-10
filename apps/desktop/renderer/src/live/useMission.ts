// Live mission view: snapshot + ordered event log, resumable after a daemon restart via events.since.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AtlasEvent } from '@atlas/contracts';
import { call, type MissionSnapshot } from './api';
import { onEvent, useLive } from './store';

export function useMission(missionId: string) {
  const [snap, setSnap] = useState<MissionSnapshot | null>(null);
  const [events, setEvents] = useState<AtlasEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lastSeq = useRef(0);
  const status = useLive((s) => s.status.state);

  const reload = useCallback(async () => {
    try {
      const s = await call('mission.get', { missionId });
      setSnap(s);
      setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [missionId]);

  // Catch up from the last sequence we saw: no gaps, no duplicates.
  const catchUp = useCallback(async () => {
    const more = await call('events.since', { missionId, afterSeq: lastSeq.current });
    if (more.length) {
      lastSeq.current = more[more.length - 1].seq;
      setEvents((prev) => [...prev, ...more]);
    }
  }, [missionId]);

  useEffect(() => {
    lastSeq.current = 0;
    setEvents([]);
    setSnap(null);
    void reload();
    void catchUp().catch(() => {});
  }, [missionId, reload, catchUp]);

  useEffect(() => {
    let t: number | undefined;
    return onEvent((e) => {
      if (e.missionId !== missionId) return;
      if (e.seq === lastSeq.current + 1) { lastSeq.current = e.seq; setEvents((prev) => [...prev, e]); }
      else if (e.seq > lastSeq.current) void catchUp().catch(() => {});
      if (e.type !== 'process.output') { window.clearTimeout(t); t = window.setTimeout(() => void reload(), 120); }
    });
  }, [missionId, reload, catchUp]);

  // After a daemon restart, resync both views.
  useEffect(() => { if (status === 'ready') { void reload(); void catchUp().catch(() => {}); } }, [status, reload, catchUp]);

  return { snap, events, error, reload };
}
