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
import { projectDuration } from './core/project';

export default function App() {
  const toast = useStore((s) => s.toast);
  const exportOpen = useStore((s) => s.exportOpen);
  const view = useStore((s) => s.view);
  const [upperH, setUpperH] = useState<number | null>(null);

  const onSplit = (e: React.PointerEvent) => {
    const upper = (e.currentTarget.previousElementSibling as HTMLElement).getBoundingClientRect();
    const y0 = e.clientY;
    const h0 = upper.height;
    const move = (ev: PointerEvent) => setUpperH(Math.max(260, Math.min(window.innerHeight - 280, h0 + ev.clientY - y0)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
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
      ) : (
      <div className="workspace">
        <div className="upper" style={upperH ? { flex: `0 0 ${upperH}px` } : undefined}>
          <LeftPanel />
          <Player />
          <Inspector />
        </div>
        <div className="splitter" onPointerDown={onSplit} />
        <Timeline />
      </div>
      )}
      <NewProjectDialog />
      {exportOpen && <ExportDialog />}
      <UpdateBanner />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
