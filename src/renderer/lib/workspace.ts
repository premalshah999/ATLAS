import { actions } from './store';
import { bridge } from './runtime';

/** Pick a local folder through the desktop bridge and make it the active workspace. Resolves true if one was opened. */
export async function openRepository(): Promise<boolean> {
  const A = actions();
  if (!bridge) {
    A.toast({ tone: 'info', title: 'Opening a folder needs the desktop app', body: 'The browser build runs on sample data only.' });
    return false;
  }
  const r = await bridge.openWorkspace();
  if (!r) return false;
  A.set({ repo: r });
  A.toast(r.isGit
    ? { tone: 'info', title: `Opened ${r.name}`, body: `${r.branch} · ${r.head}${r.dirty ? ` · ${r.dirty} changed files` : ' · clean'}` }
    : { tone: 'warning', title: `Opened ${r.name}`, body: 'Not a git repository. Agents need a git worktree to run.' });
  return true;
}
