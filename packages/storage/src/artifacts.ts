// Content-addressed-by-id artifact files (manual §39): atomic write then rename, checksummed.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, openSync, fsyncSync, closeSync } from 'node:fs';
import path from 'node:path';
import { newId, nowIso, redact, type Artifact, type ArtifactKind } from '@atlas/contracts';
import type { Db } from './db';

export class ArtifactStore {
  constructor(private readonly db: Db, private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  private file(id: string) {
    if (!/^art_[A-Za-z0-9]+$/.test(id)) throw new Error('malformed artifact id');
    return path.join(this.dir, id);
  }

  /** Persist text content (redacted) as an immutable artifact. */
  put(input: { missionId: string; taskId: string | null; kind: ArtifactKind; name: string; content: string }): Artifact {
    const id = newId('art');
    const body = Buffer.from(redact(input.content), 'utf8');
    const sha256 = createHash('sha256').update(body).digest('hex');
    const target = this.file(id);
    const tmp = `${target}.tmp-${process.pid}`;
    writeFileSync(tmp, body, { flag: 'wx' });
    const fd = openSync(tmp, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, target);
    const a: Artifact = { id, missionId: input.missionId, taskId: input.taskId, kind: input.kind, name: input.name, size: body.length, sha256, createdAt: nowIso() };
    this.db.prepare('INSERT INTO artifacts (id, mission_id, task_id, kind, name, size, sha256, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(a.id, a.missionId, a.taskId, a.kind, a.name, a.size, a.sha256, a.createdAt);
    return a;
  }

  get(id: string): Artifact | null {
    const r = this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as Record<string, any> | undefined;
    return r ? rowToArtifact(r) : null;
  }

  list(missionId: string): Artifact[] {
    return (this.db.prepare('SELECT * FROM artifacts WHERE mission_id = ? ORDER BY created_at').all(missionId) as Record<string, any>[]).map(rowToArtifact);
  }

  /** Read and verify an artifact. A missing or tampered file is reported, never silently returned. */
  read(id: string): { artifact: Artifact; text: string; intact: boolean } {
    const artifact = this.get(id);
    if (!artifact) throw new Error(`artifact not found: ${id}`);
    const f = this.file(id);
    if (!existsSync(f)) return { artifact, text: '', intact: false };
    const body = readFileSync(f);
    const intact = createHash('sha256').update(body).digest('hex') === artifact.sha256;
    return { artifact, text: body.toString('utf8'), intact };
  }
}

function rowToArtifact(r: Record<string, any>): Artifact {
  return { id: r.id, missionId: r.mission_id, taskId: r.task_id, kind: r.kind, name: r.name, size: r.size, sha256: r.sha256, createdAt: r.created_at };
}
