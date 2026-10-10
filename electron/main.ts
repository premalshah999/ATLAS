// ATLAS main process. Privileged work (filesystem, git, dialogs) lives here behind IPC;
// the renderer never runs commands itself.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';

const isMac = process.platform === 'darwin';
const devUrl = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#08090c',
    title: 'ATLAS',
    titleBarStyle: 'hidden',
    // Native window controls: traffic lights at left on macOS, an overlay at right elsewhere.
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : { titleBarOverlay: { color: '#08090c', symbolColor: '#9299a7', height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // External links open in the system browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function git(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 5000 }, (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

export interface RepoInfo {
  path: string;
  name: string;
  isGit: boolean;
  branch?: string;
  head?: string;
  dirty?: number;
  ahead?: number;
  behind?: number;
}

async function readRepo(dir: string): Promise<RepoInfo> {
  const name = path.basename(dir);
  const top = await git(dir, ['rev-parse', '--show-toplevel']);
  if (!top) return { path: dir, name, isGit: false };
  const [branch, head, status, counts] = await Promise.all([
    git(top, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(top, ['rev-parse', '--short', 'HEAD']),
    git(top, ['status', '--porcelain']),
    git(top, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']),
  ]);
  const [behind, ahead] = counts ? counts.split(/\s+/).map(Number) : [undefined, undefined];
  return {
    path: top,
    name: path.basename(top),
    isGit: true,
    branch: branch ?? undefined,
    head: head ?? undefined,
    dirty: status ? status.split('\n').filter(Boolean).length : 0,
    ahead,
    behind,
  };
}

ipcMain.handle('atlas:info', () => ({
  platform: process.platform,
  versions: { app: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
}));

ipcMain.handle('atlas:workspace:open', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const opts = { title: 'Open repository', properties: ['openDirectory' as const] };
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (res.canceled || !res.filePaths[0]) return null;
  return readRepo(res.filePaths[0]);
});

ipcMain.handle('atlas:workspace:refresh', (_e, dir: unknown) => {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('Expected an absolute path');
  return readRepo(dir);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (!isMac) app.quit(); });
