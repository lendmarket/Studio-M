import React from 'react';
import { createRoot } from 'react-dom/client';
import './api';
import './styles.css';
import App from './App';

function showFatal(msg: string) {
  const el = document.getElementById('fatal') || document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'fatal' }));
  el.setAttribute('style', 'position:fixed;inset:20px;z-index:9999;background:#1b1b21;color:#f3a5b0;padding:20px;border:1px solid #444;border-radius:10px;white-space:pre-wrap;overflow:auto;font:12px Consolas,monospace;user-select:text');
  el.textContent = 'Studio M 오류가 발생했습니다. 이 화면을 캡처해서 보내주세요.\n\n' + msg;
}
window.addEventListener('error', (e) => showFatal(String(e.error?.stack || e.message)));
window.addEventListener('unhandledrejection', (e) => console.error('unhandled', e.reason));

class Boundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { err: String(e.stack || e) };
  }
  componentDidCatch(e: Error) {
    console.error('render error', e.stack);
  }
  render() {
    if (this.state.err) {
      showFatal(this.state.err);
      return null;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <Boundary>
    <App />
  </Boundary>,
);
requestAnimationFrame(() => requestAnimationFrame(() => (window as any).api?.ready?.()));

// 자동화 테스트/디버그용 훅
import { useStore } from './store';
import { importFiles } from './media';
import { renderTextPng } from './core/text';
import { createProject, goHome } from './projectIO';
(window as any).__studio = { store: useStore, importFiles, renderTextPng, createProject, goHome };
