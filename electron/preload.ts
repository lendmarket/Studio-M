import { contextBridge, ipcRenderer, webUtils } from 'electron';

const on = (ch: string) => (cb: (...a: any[]) => void) => {
  const h = (_e: unknown, ...a: any[]) => cb(...a);
  ipcRenderer.on(ch, h);
  return () => {
    ipcRenderer.removeListener(ch, h);
  };
};

const api = {
  openMedia: (kind: 'media' | 'audio' = 'media'): Promise<string[]> => ipcRenderer.invoke('dialog:openMedia', kind),
  openProjectDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openProject'),
  saveDialog: (defaultPath: string, filters: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save', { defaultPath, filters }),
  confirm: (message: string, buttons: string[], detail?: string): Promise<number> => ipcRenderer.invoke('dialog:confirm', { message, buttons, detail }),
  probe: (f: string) => ipcRenderer.invoke('media:probe', f),
  thumbs: (f: string, d: number) => ipcRenderer.invoke('media:thumbs', f, d),
  waveform: (f: string) => ipcRenderer.invoke('media:waveform', f),
  readFile: (f: string): Promise<string> => ipcRenderer.invoke('fs:read', f),
  writeFile: (f: string, d: string): Promise<void> => ipcRenderer.invoke('fs:write', f, d),
  exists: (f: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', f),
  autosave: (d: string) => ipcRenderer.invoke('app:autosave', d),
  loadAutosave: (): Promise<string | null> => ipcRenderer.invoke('app:loadAutosave'),
  pendingOpen: (): Promise<string | null> => ipcRenderer.invoke('app:pendingOpen'),
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  reveal: (f: string) => ipcRenderer.invoke('app:reveal', f),
  openExternal: (u: string) => ipcRenderer.invoke('app:openExternal', u),
  closeConfirmed: () => ipcRenderer.send('app:close-confirmed'),
  onBeforeClose: on('app:before-close'),
  onOpenProject: on('app:open-project'),
  exportStart: (job: unknown): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('export:start', job),
  exportCancel: () => ipcRenderer.invoke('export:cancel'),
  onExportProgress: on('export:progress'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: on('update:status'),
  pathForFile: (f: File): string => webUtils.getPathForFile(f),
  ready: () => ipcRenderer.send('app:ready'),
  openLogs: () => ipcRenderer.invoke('app:openLogs'),
  isSafeMode: (): Promise<boolean> => ipcRenderer.invoke('app:safeMode'),
  setSafeMode: (on: boolean) => ipcRenderer.invoke('app:setSafeMode', on),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('api', api);
export type Api = typeof api;
