import React, { useEffect, useState } from 'react';
import { useStore } from './store';
import { api } from './api';
import TopBar from './components/TopBar';
import LeftPanel from './components/LeftPanel';
import Player from './components/Player';
import Inspector from './components/Inspector';
import Timeline from './components/Timeline';
import ExportDialog from './components/ExportDialog';
import UpdateBanner from './components/UpdateBanner';
import { goHome, handleStartupOpen, openProjectFile, saveProject, startAutosave } from './projectIO';
import Home, { NewProjectDialog } from './components/Home';
import { NewProductionDialog, ProductionView } from './components/Productions';
import { projectDuration } from './core/project';

/** 편집 화면 창 최소 크기(px) */
const MIN = { side: 260, player: 360, upper: 260, timeline: 280 };
const clamp = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(Math.max(lo, hi), v)));
const readSize = (k: string): number | null => {
  const v = Number(localStorage.getItem('studiom.layout.' + k));
  return Number.isFinite(v) && v > 0 ? v : null;
};
const saveSize = (k: string, v: number) => {
  localStorage.setItem('studiom.layout.' + k, String(v));
  return v;
};

export default function App() {
  const toast = useStore((s) => s.toast);
  const exportOpen = useStore((s) => s.exportOpen);
  const view = useStore((s) => s.view);
  // 편집 화면 창 크기 (조절값은 다음에 켤 때도 유지)
  const [upperH, setUpperH] = useState<number | null>(() => readSize('upperH'));
  const [leftW, setLeftW] = useState<number>(() => readSize('leftW') ?? 400);
  const [rightW, setRightW] = useState<number>(() => readSize('rightW') ?? 340);

  const drag = (e: React.PointerEvent, onMove: (dx: number, dy: number) => void) => {
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    document.body.classList.add('resizing');
    const move = (ev: PointerEvent) => onMove(ev.clientX - x0, ev.clientY - y0);
    const up = () => {
      document.body.classList.remove('resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** 위(미리보기 줄) ↔ 타임라인 높이 */
  const onSplit = (e: React.PointerEvent) => {
    const h0 = (e.currentTarget.previousElementSibling as HTMLElement).getBoundingClientRect().height;
    drag(e, (_dx, dy) => setUpperH(saveSize('upperH', clamp(h0 + dy, MIN.upper, window.innerHeight - MIN.timeline))));
  };
  /** 왼쪽 패널 ↔ 플레이어 ↔ 오른쪽 패널 너비. 플레이어가 나머지를 채우고, 모두 최소 너비 유지 */
  const onSplitX = (side: 'left' | 'right') => (e: React.PointerEvent) => {
    const upper = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width;
    const l0 = leftW;
    const r0 = rightW;
    drag(e, (dx) => {
      if (side === 'left') setLeftW(saveSize('leftW', clamp(l0 + dx, MIN.side, upper - r0 - MIN.player - 24)));
      else setRightW(saveSize('rightW', clamp(r0 - dx, MIN.side, upper - l0 - MIN.player - 24)));
    });
  };

  useEffect(() => {
    api.wsSettings().then((settings) => useStore.getState().set({ settings }));
    handleStartupOpen();
    startAutosave();
    const offClose = api.onBeforeClose(async () => {
      const st = useStore.getState();
      if (st.filePath && st.dirty) await saveProject({ silent: true });
      api.closeConfirmed();
    });
    const offOpen = api.onOpenProject((f: string) => openProjectFile(f));
    return () => {
      offClose();
      offOpen();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useStore.getState();
      if (st.view !== 'editor' || st.exportOpen || st.newProjectOpen) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const fps = st.project.fps;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!st.playing && st.currentTime >= projectDuration(st.project) - 0.01) st.seek(0);
        st.setPlaying(!st.playing);
      } else if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        st.undo();
      } else if (ctrl && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        st.redo();
      } else if (ctrl && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        st.splitAtPlayhead();
      } else if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject({ saveAs: e.shiftKey });
      } else if (ctrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openProjectFile();
      } else if (ctrl && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        st.set({ exportOpen: true, playing: false });
      } else if (ctrl && e.key.toLowerCase() === 'c') st.copy();
      else if (ctrl && e.key.toLowerCase() === 'v') st.paste();
      else if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        st.duplicateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') st.deleteSelected();
      else if (e.key.toLowerCase() === 'q' && !ctrl) st.trimSide('left');
      else if (e.key.toLowerCase() === 'w' && !ctrl) st.trimSide('right');
      else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        st.seek(st.currentTime - (e.shiftKey ? 1 : 1 / fps));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        st.seek(st.currentTime + (e.shiftKey ? 1 : 1 / fps));
      } else if (e.key === 'Home') st.seek(0);
      else if (e.key === 'End') st.seek(projectDuration(st.project));
      else if (e.key === 'Escape') st.select(null);
      else if (e.key === 'Home' && ctrl) goHome();
      else if ((e.key === '=' || e.key === '+') && ctrl) {
        e.preventDefault();
        st.setZoom(st.zoom * 1.25);
      } else if (e.key === '-' && ctrl) {
        e.preventDefault();
        st.setZoom(st.zoom / 1.25);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      {view === 'home' ? (
        <Home />
      ) : view === 'production' ? (
        <ProductionView />
      ) : (
      <div className="workspace">
        <div className="upper" style={upperH ? { flex: `0 0 ${upperH}px` } : undefined}>
          <div className="side-wrap" style={{ flex: `0 1 ${leftW}px`, minWidth: MIN.side }}>
            <LeftPanel />
          </div>
          <div className="vsplit" title="끌어서 너비 조절" onPointerDown={onSplitX('left')} onDoubleClick={() => setLeftW(saveSize('leftW', 400))} />
          <Player />
          <div className="vsplit" title="끌어서 너비 조절" onPointerDown={onSplitX('right')} onDoubleClick={() => setRightW(saveSize('rightW', 340))} />
          <div className="side-wrap" style={{ flex: `0 1 ${rightW}px`, minWidth: MIN.side }}>
            <Inspector />
          </div>
        </div>
        <div className="splitter" onPointerDown={onSplit} />
        <Timeline />
      </div>
      )}
      <NewProjectDialog />
      <NewProductionDialog />
      {exportOpen && <ExportDialog />}
      <UpdateBanner />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
