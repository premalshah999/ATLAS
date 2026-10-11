// Evolution P0-4 at the daemon level: start() reaps journaled survivors of a crashed predecessor.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { expect, it } from 'vitest';
import { openDb, Repo } from '@atlas/storage';
import { isAlive, processIdentity } from '@atlas/terminal';
import { tmpDir } from '../../../tests/helpers';
import { DaemonService } from '../src/service';

it.skipIf(process.platform === 'win32')('daemon start kills processes journaled by a crashed predecessor', async () => {
  const dataDir = tmpDir('atlas-reap-');
  const orphan = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
  orphan.unref();
  const pid = orphan.pid!;
  await new Promise((r) => setTimeout(r, 200));
  const db = openDb(path.join(dataDir, 'atlas.db'));
  new Repo(db).processJournal().add({ pid, identity: processIdentity(pid)!, kind: 'command', command: 'node -e …', startedAt: new Date().toISOString() });
  db.close();
  const svc = new DaemonService({ dataDir, version: 'test' });
  await svc.start();
  for (let i = 0; i < 40 && isAlive(pid); i++) await new Promise((r) => setTimeout(r, 50));
  expect(isAlive(pid)).toBe(false);
  expect(svc.repo.processJournal().list()).toEqual([]);
  await svc.stop();
}, 30_000);
