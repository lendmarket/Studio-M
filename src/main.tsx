import React from 'react';
import { createRoot } from 'react-dom/client';
import './api';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);

// 자동화 테스트/디버그용 훅
import { useStore } from './store';
import { importFiles } from './media';
import { renderTextPng } from './core/text';
(window as any).__studio = { store: useStore, importFiles, renderTextPng };
