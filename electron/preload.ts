// The only bridge between the renderer and the main process.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('atlas', {
  platform: process.platform,
  info: () => ipcRenderer.invoke('atlas:info'),
  openWorkspace: () => ipcRenderer.invoke('atlas:workspace:open'),
  refreshWorkspace: (dir: string) => ipcRenderer.invoke('atlas:workspace:refresh', dir),
});
