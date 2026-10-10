// Export / import / delete / retention (manual §38, §39, §43).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { registerSecret } from '@atlas/contracts';
import { replay } from '@atlas/orchestrator';
import type { FakeScript } from '@atlas/runtime-fake';
import { sampleSlugifyScript } from '@atlas/runtime-fake';
import { sampleRepo, sh, tmpDir } from '../helpers';
import { makeOrchestrator, startMission } from './harness';

describe('export and import', () => {
  it('round-trips a mission into another data directory with intact evidence and no secrets', async () => {
    const root = sampleRepo();
    const secret = 'ghp_exportcanary0123456789abcdefghijkl';
    registerSecret(secret);
    const leak: FakeScript = { ...sampleSlugifyScript, name: 'leak', steps: async (i) => [{ say: `token ${secret}` }, ...(await sampleSlugifyScript.steps(i))] };
    const a = makeOrchestrator({ scripts: [leak] });
    const id = await startMission(a, root);
    await a.orch.settle(id);
    const file = path.join(tmpDir(), 'mission.atlas.jsonl');
    const r = a.orch.exportMission(id, file);
    expect(r.records).toBeGreaterThan(20);
    const text = readFileSync(file, 'utf8');
    expect(text).not.toContain(secret);

    const b = makeOrchestrator();
    const m = b.orch.importMission(file);
    expect(m).toMatchObject({ id, archived: true, state: 'completed' });
    expect(replay(b.repo.eventsSince(id, 0)).mission).toBe('completed');
    for (const art of b.artifacts.list(id)) expect(b.artifacts.read(art.id).intact).toBe(true);
    expect(b.repo.checks(id).find((c) => c.name === 'tests')!.result).toBe('pass');
    // Archived missions are read-only.
    await expect(b.orch.decide(id, 'accept')).rejects.toThrow(/read-only/);
    // Importing twice is refused.
    expect(() => b.orch.importMission(file)).toThrow(/already exists/);
  });

  it('detects a tampered or truncated export', async () => {
    const root = sampleRepo();
    const a = makeOrchestrator();
    const id = await startMission(a, root);
    await a.orch.settle(id);
    const file = path.join(tmpDir(), 'm.jsonl');
    a.orch.exportMission(id, file);
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    const tampered = lines.map((l) => l.replace('"Verified: tests passed', '"Verified: everything passed'));
    writeFileSync(file, tampered.join('\n'));
    expect(() => makeOrchestrator().orch.importMission(file)).toThrow(/integrity/);
    writeFileSync(file, lines.slice(0, -1).join('\n'));
    expect(() => makeOrchestrator().orch.importMission(file)).toThrow(/truncated/);
  });
});

describe('delete and retention', () => {
  it('deletes rows, artifacts, worktrees and task branches; keeps an accepted branch', async () => {
    const root = sampleRepo();
    const h = makeOrchestrator();
    const id = await startMission(h, root);
    await h.orch.settle(id);
    const m = h.repo.mission(id)!;
    const arts = h.artifacts.list(id).map((a) => path.join(h.dataDir, 'artifacts', a.id));
    await h.orch.decide(id, 'accept');
    await h.orch.deleteMission(id);
    expect(h.repo.mission(id)).toBeNull();
    expect(h.repo.eventsSince(id, 0)).toEqual([]);
    expect(arts.some((f) => existsSync(f))).toBe(false);
    expect(sh(root, 'git', ['branch', '--list', 'atlas/*'])).toBe(m.integrationBranch);
  });

  it('refuses to delete a running mission and purges old decided missions', async () => {
    const root = sampleRepo();
    const h = makeOrchestrator();
    const id = await startMission(h, root);
    await expect(h.orch.deleteMission(id)).rejects.toThrow(/Cancel the mission/);
    await h.orch.settle(id);
    await h.orch.decide(id, 'reject');
    expect(await h.orch.purgeOlderThan(30)).toEqual([]);
    h.repo.db.prepare('UPDATE missions SET updated_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', id);
    expect(await h.orch.purgeOlderThan(30)).toEqual([id]);
    expect(h.repo.mission(id)).toBeNull();
  });
});
