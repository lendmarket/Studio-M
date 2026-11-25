import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { Icon } from './Icons';
import { newProjectAction, openProjectFile, saveProject } from '../projectIO';
import { api } from '../api';

export function Logo({ size = 22 }: { size?: number }) {
  return <img src="./logo.svg" width={size} height={size} alt="Studio M" draggable={false} />;
}

export default function TopBar() {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const [menu, setMenu] = useState(false);
  const [version, setVersion] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.version().then(setVersion);
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
            {item('새 프로젝트', '', newProjectAction)}
            {item('프로젝트 열기', 'Ctrl+O', () => openProjectFile())}
            {item('저장', 'Ctrl+S', () => saveProject())}
            {item('다른 이름으로 저장', 'Ctrl+Shift+S', () => saveProject(true))}
            <div className="menu-sep" />
            {item('업데이트 확인', '', () => api.checkUpdate())}
            {item('단축키 안내', '', () => useStore.getState().showToast('Space 재생 · Ctrl+B 분할 · Q/W 왼쪽/오른쪽 삭제 · Del 삭제 · Ctrl+Z 실행취소'))}
            <div className="menu-sep" />
            <div className="menu-foot">Studio M v{version}</div>
          </div>
        )}
      </div>
      <div className="title">
        <input
          className="project-name no-drag"
          value={name}
          onChange={(e) => useStore.getState().mutate((p) => (p.name = e.target.value))}
          spellCheck={false}
        />
        {dirty && <span className="dirty-dot" title="저장되지 않음" />}
      </div>
      <div className="top-actions no-drag">
        <button className="btn-export" onClick={() => useStore.getState().set({ exportOpen: true, playing: false })}>
          <Icon name="export" size={16} /> 내보내기
        </button>
      </div>
    </div>
  );
}
