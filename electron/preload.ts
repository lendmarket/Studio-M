import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ExportInfo, ProjectInfo, Settings } from './workspace';
import type { EpisodeInfo, NewProductionInput, ProductionInfo, StageId, StageState, EpisodeMeta, ProductionMeta } from '../src/core/production';
import type { SecretName, SecretStatus, TestResult } from '../src/core/ai';

export type { ExportInfo, ProjectInfo };
export type WsSettings = Settings & { googleDrive: string | null; onDrive: boolean };

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
  wsSettings: (): Promise<WsSettings> => ipcRenderer.invoke('ws:settings'),
  wsSaveSettings: (patch: Partial<WsSettings>): Promise<WsSettings> => ipcRenderer.invoke('ws:saveSettings', patch),
  wsChooseFolder: (): Promise<string | null> => ipcRenderer.invoke('ws:chooseFolder'),
  wsCreateProject: (name: string): Promise<string> => ipcRenderer.invoke('ws:createProject', name),
  wsCopyMedia: (projectFile: string, src: string): Promise<string> => ipcRenderer.invoke('ws:copyMedia', projectFile, src),
  wsProjects: (): Promise<ProjectInfo[]> => ipcRenderer.invoke('ws:projects'),
  wsExports: (): Promise<ExportInfo[]> => ipcRenderer.invoke('ws:exports'),
  wsTrash: (file: string): Promise<void> => ipcRenderer.invoke('ws:trash', file),
  wsWriteDataUrl: (file: string, data: string): Promise<void> => ipcRenderer.invoke('ws:writeDataUrl', file, data),
  openPath: (p: string) => ipcRenderer.invoke('ws:openPath', p),
  openLogs: () => ipcRenderer.invoke('app:openLogs'),
  isSafeMode: (): Promise<boolean> => ipcRenderer.invoke('app:safeMode'),
  setSafeMode: (on: boolean) => ipcRenderer.invoke('app:setSafeMode', on),
  platform: process.platform,

  // 사전 제작(작품)
  prodList: (): Promise<ProductionInfo[]> => ipcRenderer.invoke('prod:list'),
  prodGet: (dir: string): Promise<ProductionInfo | null> => ipcRenderer.invoke('prod:get', dir),
  prodCreate: (input: NewProductionInput): Promise<ProductionInfo> => ipcRenderer.invoke('prod:create', input),
  prodAddEpisode: (seriesDir: string): Promise<EpisodeInfo> => ipcRenderer.invoke('prod:addEpisode', seriesDir),
  prodUpdateMeta: (
    file: string,
    patch: { title?: string; budgetUsd?: number | null; stage?: { id: StageId; state: StageState } },
  ): Promise<ProductionMeta & EpisodeMeta> => ipcRenderer.invoke('prod:updateMeta', file, patch),
  prodReadStage: (unitDir: string, stage: StageId, name: string): Promise<unknown | null> => ipcRenderer.invoke('prod:readStage', unitDir, stage, name),
  prodWriteStage: (unitDir: string, stage: StageId, name: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('prod:writeStage', unitDir, stage, name, data),
  prodTrash: (dir: string): Promise<void> => ipcRenderer.invoke('prod:trash', dir),

  // AI 연동 — 키 값은 보내기만 하고 다시 읽어 오지 않습니다
  aiStatus: (): Promise<SecretStatus> => ipcRenderer.invoke('ai:status'),
  aiSetSecret: (name: SecretName, value: string): Promise<SecretStatus> => ipcRenderer.invoke('ai:setSecret', name, value),
  aiClearSecret: (name: SecretName): Promise<SecretStatus> => ipcRenderer.invoke('ai:clearSecret', name),
  aiPickVertexKey: (): Promise<SecretStatus | null> => ipcRenderer.invoke('ai:pickVertexKey'),
  aiTest: (name: SecretName): Promise<TestResult> => ipcRenderer.invoke('ai:test', name),
};

contextBridge.exposeInMainWorld('api', api);
export type Api = typeof api;
