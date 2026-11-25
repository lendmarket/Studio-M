import type { Api } from '../electron/preload';

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
    installUpdate: noop,
    onUpdateStatus: off,
    pathForFile: () => '',
    platform: 'browser',
  };
}

export const api = window.api;
