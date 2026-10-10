import { describe, expect, it } from 'vitest';
import { cpSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_BUDGET, newId, nowIso } from '@atlas/contracts';
import { ArtifactStore, openDb, Repo, schemaVersion } from '../src';
import { tmpDir } from '../../../tests/helpers';

function setup(dir = tmpDir()) {
  const db = openDb(path.join(dir, 'atlas.db'));
  return { dir, db, repo: new Repo(db), artifacts: new ArtifactStore(db, path.join(dir, 'artifacts')) };
}
function seed(repo: Repo) {
  const now = nowIso();
  const ws = repo.upsertWorkspace({ id: newId('ws'), name: 'w', root: '/tmp/w-' + Math.random(), isGit: true, branch: 'main', head: 'abc', dirty: 0, createdAt: now, updatedAt: now });
  const id = newId('msn');
  repo.insertMission({ id, workspaceId: ws.id, title: 't', goal: 'g', constraints: '', approvalMode: 'ask_risky', runtime: 'fake', baseCommit: null, state: 'draft', planVersion: 0, policyId: 'p', outcome: null, decision: null, budget: DEFAULT_BUDGET, integrationBranch: null, integrationCommit: null, archived: false, createdAt: now, updatedAt: now });
  return id;
}

describe('storage', () => {
  it('applies migrations once with WAL and foreign keys', () => {
    const { db } = setup();
    expect(schemaVersion(db)).toBe(3);
    expect((db.prepare('PRAGMA journal_mode').get() as any).journal_mode).toBe('wal');
    expect((db.prepare('PRAGMA foreign_keys').get() as any).foreign_keys).toBe(1);
  });

  it('assigns monotonic per-mission sequence numbers and redacts payloads', () => {
    const { repo } = setup();
    const m = seed(repo);
    const a = repo.append({ missionId: m, type: 'mission.created', actor: { kind: 'operator' }, taskId: null, attemptId: null, payload: { note: 'key sk-ant-abcdefghijklmnop' }, artifactIds: [] });
    const b = repo.append({ missionId: m, type: 'mission.state', actor: { kind: 'operator' }, taskId: null, attemptId: null, payload: { to: 'planning' }, artifactIds: [] });
    expect([a.seq, b.seq]).toEqual([1, 2]);
    expect(JSON.stringify(repo.eventsSince(m, 0))).not.toContain('sk-ant-abcdefghijklmnop');
    expect(repo.eventsSince(m, 1).map((e) => e.seq)).toEqual([2]);
  });

  it('enforces foreign keys', () => {
    const { repo } = setup();
    expect(() => repo.insertTask({ id: newId('tsk'), missionId: newId('msn'), key: 'k', title: 't', role: 'coder', dependencies: [], state: 'queued', retries: 0, acceptance: [], resultRef: null, worktree: null, branch: null, checkpoint: null, parentTaskId: null, depth: 0 })).toThrow();
  });

  it('approval decisions are single-use', () => {
    const { repo } = setup();
    const m = seed(repo);
    const id = newId('apr');
    repo.insertApproval({ id, missionId: m, taskId: null, agentRole: 'coder', tool: 'shell_exec', capability: 'shell.privileged', action: 'npm install', environment: 'e', resources: [], reason: 'r', risk: 'elevated', scope: 'once', status: 'pending', requestedAt: nowIso(), expiresAt: nowIso(), decidedAt: null, decidedBy: null });
    expect(repo.decideApproval(id, 'approved', 'operator')).toBe(true);
    expect(repo.decideApproval(id, 'denied', 'operator')).toBe(false);
  });

  it('artifacts are checksummed, redacted and tamper-evident; backup/restore keeps evidence links', () => {
    const { dir, repo, artifacts } = setup();
    const m = seed(repo);
    const a = artifacts.put({ missionId: m, taskId: null, kind: 'log', name: 'log', content: 'ok\nTOKEN=supersecretvalue\n' });
    const r = artifacts.read(a.id);
    expect(r.intact).toBe(true);
    expect(r.text).not.toContain('supersecretvalue');
    repo.append({ missionId: m, type: 'artifact.created', actor: { kind: 'operator' }, taskId: null, attemptId: null, payload: {}, artifactIds: [a.id] });

    // Backup: checkpoint WAL, copy the data directory, reopen from the copy.
    (repo.db as any).exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const copy = tmpDir();
    cpSync(dir, copy, { recursive: true });
    const restored = setup(copy);
    const ev = restored.repo.eventsSince(m, 0).find((e) => e.type === 'artifact.created')!;
    expect(restored.artifacts.read(ev.artifactIds[0]).intact).toBe(true);

    writeFileSync(path.join(dir, 'artifacts', a.id), 'tampered');
    expect(artifacts.read(a.id).intact).toBe(false);
  });
});
