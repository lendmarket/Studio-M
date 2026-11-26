import type { Api } from '../electron/preload';
import { DEFAULT_AI } from './core/ai';

declare global {
  interface Window {
    api: Api;
  }
}

// 브라우저에서 UI만 열어볼 때를 위한 대체 구현
if (!(window as any).api) {
  const noop = async () => null as any;
  const off = () => () => undefined;
  (window as any).api = {
    openMedia: async () => [],
    openProjectDialog: noop,
    saveDialog: noop,
    confirm: async () => 0,
    probe: noop,
    thumbs: async () => ({ files: [], interval: 1 }),
    waveform: async () => ({ peaks: [], perSec: 40 }),
    readFile: async () => '',
    writeFile: noop,
    exists: async () => false,
    autosave: noop,
    loadAutosave: noop,
    pendingOpen: noop,
    version: async () => 'dev',
    reveal: noop,
    openExternal: noop,
    closeConfirmed: () => undefined,
    onBeforeClose: off,
    onOpenProject: off,
    exportStart: async () => ({ ok: false, error: '브라우저 미리보기에서는 내보낼 수 없습니다' }),
    exportCancel: noop,
    onExportProgress: off,
    checkUpdate: noop,
    updateState: async () => ({ current: 'dev', state: 'dev' }),
    downloadUpdate: noop,
    installUpdate: noop,
    onUpdateStatus: off,
    pathForFile: () => '',
    ready: () => undefined,
    wsSettings: async () => ({ workspace: 'C:\\Users\\me\\Documents\\Studio M', copyMedia: true, limits: {}, ai: DEFAULT_AI, googleDrive: null, onDrive: false }),
    wsSaveSettings: async (p: any) => ({ workspace: '', copyMedia: true, limits: {}, ai: DEFAULT_AI, googleDrive: null, onDrive: false, ...p }),
    wsChooseFolder: noop,
    wsCreateProject: async (n: string) => `C:\\Studio M\\${n}\\${n}.smproj`,
    wsCopyMedia: async (_f: string, s: string) => s,
    wsProjects: async () => [],
    wsExports: async () => [],
    wsTrash: noop,
    wsWriteDataUrl: noop,
    openPath: noop,
    openLogs: noop,
    isSafeMode: async () => false,
    setSafeMode: noop,
    platform: 'browser',
    prodList: async () => [],
    prodGet: noop,
    prodCreate: async () => {
      throw new Error('브라우저 미리보기에서는 작품을 만들 수 없습니다');
    },
    prodAddEpisode: noop,
    prodUpdateMeta: noop,
    prodReadStage: noop,
    prodWriteStage: noop,
    prodTrash: noop,
    prodSeriesContext: async () => ({ seriesTitle: '', episodes: [], openForeshadowing: [] }),
    prodRebuildArc: noop,
    prodImportInputs: async () => [],
    llmChat: async () => ({ ok: false, error: '브라우저 미리보기에서는 AI를 부를 수 없습니다', provider: '', model: '', ms: 0 }),
    codexStatus: async () => ({ installed: false, loggedIn: false, detail: '브라우저 미리보기' }),
    codexLogin: async () => ({ ok: false, message: '브라우저 미리보기' }),
    aiStatus: async () => ({ encryption: false, gemini: false, openai: false, vertex: { set: false }, typecast: false, fish: false }),
    aiSetSecret: async () => {
      throw new Error('브라우저 미리보기에서는 키를 저장할 수 없습니다');
    },
    aiClearSecret: async () => ({ encryption: false, gemini: false, openai: false, vertex: { set: false }, typecast: false, fish: false }),
    aiPickVertexKey: noop,
    aiTest: async () => ({ ok: false, message: '브라우저 미리보기' }),
  };
}

export const api = window.api;
