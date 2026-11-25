import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { Icon } from './Icons';
import { goHome, openProjectFile, saveProject } from '../projectIO';
import { platformById } from '../core/platforms';
import { api } from '../api';

export function Logo({ size = 22 }: { size?: number }) {
  return <img src="./logo.svg" width={size} height={size} alt="Studio M" draggable={false} />;
}

export default function TopBar() {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const view = useStore((s) => s.view);
  const platform = useStore((s) => s.project.platform);
  const pf = platformById(platform);
  const [menu, setMenu] = useState(false);
  const [version, setVersion] = useState('');
  const [safe, setSafe] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.version().then(setVersion);
    api.isSafeMode().then(setSafe);
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  const item = (label: string, keys: string, fn: () => void) => (
    <button
      className="menu-item"
      onClick={() => {
        setMenu(false);
        fn();
      }}
    >
      <span>{label}</span>
      <kbd>{keys}</kbd>
    </button>
  );

  return (
    <div className="topbar">
      <div className="brand no-drag" ref={ref}>
        <button className="brand-btn" onClick={() => setMenu(!menu)}>
          <Logo />
          <span className="brand-name">
            Studio <b>M</b>
          </span>
          <span className="caret">▾</span>
        </button>
        {menu && (
          <div className="menu">
            {item('홈', '', () => goHome())}
            {item('새 프로젝트', '', () => useStore.getState().set({ newProjectOpen: 'shorts' }))}
            {item('프로젝트 열기', 'Ctrl+O', () => openProjectFile())}
            {view === 'editor' && item('저장', 'Ctrl+S', () => saveProject())}
            {view === 'editor' && item('다른 이름으로 저장', 'Ctrl+Shift+S', () => saveProject({ saveAs: true }))}
            <div className="menu-sep" />
            {item('업데이트 확인', '', () => api.checkUpdate())}
            {item('로그 폴더 열기', '', () => api.openLogs())}
            {item(safe ? 'GPU 가속 다시 켜기 (재시작)' : '안전 모드로 재시작 (GPU 끔)', '', () => api.setSafeMode(!safe))}
            {item('단축키 안내', '', () => useStore.getState().showToast('Space 재생 · Ctrl+B 분할 · Q/W 왼쪽/오른쪽 삭제 · Del 삭제 · Ctrl+Z 실행취소'))}
            <div className="menu-sep" />
            <div className="menu-foot">Studio M v{version}{safe ? ' · 안전 모드' : ''}</div>
          </div>
        )}
        {view === 'editor' && (
          <button className="home-btn" onClick={() => goHome()} title="홈으로">
            <Icon name="home" size={15} /> 홈
          </button>
        )}
      </div>
      {view === 'home' ? (
        <div className="title">
          <span className="home-title">대시보드</span>
        </div>
      ) : (
      <div className="title">
        <span className="pf-badge top" style={{ background: pf.color }}>
          {pf.short}
        </span>
        <input
          className="project-name no-drag"
          value={name}
          onChange={(e) => useStore.getState().mutate((p) => (p.name = e.target.value))}
          spellCheck={false}
        />
        <span className={'save-state' + (dirty ? ' dirty' : '')}>{dirty ? '저장 중...' : '저장됨'}</span>
      </div>
      )}
      <div className="top-actions no-drag">
        {view === 'home' ? (
          <button className="btn-export" onClick={() => useStore.getState().set({ newProjectOpen: 'shorts' })}>
            <Icon name="plus" size={16} /> 새 프로젝트
          </button>
        ) : (
        <button className="btn-export" onClick={() => useStore.getState().set({ exportOpen: true, playing: false })}>
          <Icon name="export" size={16} /> 내보내기
        </button>
        )}
      </div>
    </div>
  );
}
