import { api } from './api';
import { useStore } from './store';
import { hydrateProject } from './media';
import { newProject } from './core/project';
import { platformById } from './core/platforms';
import type { Project } from './core/types';

const FILTERS = [{ name: 'Studio M 프로젝트', extensions: ['smproj'] }];

export const dirOf = (f: string) => f.replace(/[\\/][^\\/]*$/, '');
const sepOf = (f: string) => (f.includes('\\') ? '\\' : '/');

/** 프로젝트 폴더 안의 미디어는 상대 경로(media/...)로 저장 → 드라이브 문자가 바뀌어도 열림 */
export function serializeProject(p: Project, filePath: string | null): string {
  const dir = filePath ? dirOf(filePath) : null;
  const rel = (path: string) => {
    if (!dir) return path;
    const norm = (x: string) => x.replace(/\\/g, '/').toLowerCase();
    if (norm(path).startsWith(norm(dir) + '/')) return path.slice(dir.length + 1).replace(/\\/g, '/');
    return path;
  };
  const lite = {
    ...p,
    assets: p.assets.map(({ thumbs, thumbInterval, peaks, peaksPerSec, ...a }) => ({ ...a, path: rel(a.path) })),
  };
  return JSON.stringify(lite, null, 1);
}

export function resolveProject(p: Project, filePath: string): Project {
  const dir = dirOf(filePath);
  const sep = sepOf(filePath);
  p.assets.forEach((a) => {
    if (!/^([a-zA-Z]:[\\/]|[\\/])/.test(a.path)) a.path = dir + sep + a.path.replace(/\//g, sep);
    if (a.type === 'image') a.thumbs = [a.path];
  });
  return p;
}

let saving = false;
let pendingSave = false;

export async function saveProject(opts: { saveAs?: boolean; silent?: boolean } = {}): Promise<boolean> {
  const st = useStore.getState();
  let path = st.filePath;
  if (!path || opts.saveAs) {
    path = await api.saveDialog(`${st.project.name || '프로젝트'}.smproj`, FILTERS);
    if (!path) return false;
  }
  if (saving) {
    pendingSave = true;
    return true;
  }
  saving = true;
  try {
    const snapshot = st.project;
    await api.writeFile(path, serializeProject(snapshot, path));
    const thumb = (window as any).__studioThumb?.();
    if (thumb && snapshot.clips.length) await api.wsWriteDataUrl(dirOf(path) + sepOf(path) + 'thumb.jpg', thumb).catch(() => undefined);
    if (useStore.getState().project === snapshot) useStore.getState().markSaved(path);
    else useStore.setState({ filePath: path });
    if (!opts.silent) st.showToast('저장되었습니다');
  } catch (e) {
    st.showToast('저장 실패: ' + String((e as Error).message || e));
    return false;
  } finally {
    saving = false;
  }
  if (pendingSave) {
    pendingSave = false;
    saveProject({ silent: true });
  }
  return true;
}

/** 새 프로젝트: 작업 폴더에 프로젝트 폴더를 만들고 바로 편집 시작 */
export async function createProject(platformId: string, name: string) {
  const pf = platformById(platformId);
  const file = await api.wsCreateProject(name);
  const p = newProject();
  p.name = name;
  p.platform = pf.id;
  p.width = pf.w;
  p.height = pf.h;
  p.createdAt = Date.now();
  useStore.getState().setProject(p, file);
  await saveProject({ silent: true });
  useStore.getState().set({ view: 'editor', leftTab: 'media' });
}

export async function openProjectFile(path?: string | null) {
  const f = path || (await api.openProjectDialog());
  if (!f) return;
  const st = useStore.getState();
  if (st.view === 'editor' && st.dirty && st.filePath) await saveProject({ silent: true });
  try {
    const p = resolveProject(JSON.parse(await api.readFile(f)) as Project, f);
    if (!p || !Array.isArray(p.clips)) throw new Error('bad');
    useStore.getState().setProject(p, f);
    useStore.getState().set({ view: 'editor' });
    hydrateProject(p);
  } catch {
    useStore.getState().showToast('프로젝트 파일을 열 수 없습니다');
  }
}

export async function goHome() {
  const st = useStore.getState();
  if (st.filePath && st.dirty) await saveProject({ silent: true });
  useStore.getState().set({ view: 'home', playing: false, selectedId: null });
}

/** 편집 내용이 바뀌면 1.5초 뒤 자동 저장 */
let timer: number | undefined;
export function startAutosave() {
  useStore.subscribe((s, prev) => {
    if (s.project === prev.project || !s.filePath || s.view !== 'editor') return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const cur = useStore.getState();
      if (cur.dirty && cur.filePath && !cur.playing) saveProject({ silent: true });
    }, 1500);
  });
  useStore.subscribe((s, prev) => {
    if (prev.playing && !s.playing && s.dirty && s.filePath) saveProject({ silent: true });
  });
}

export async function handleStartupOpen() {
  const pending = await api.pendingOpen();
  if (pending) return openProjectFile(pending);
}
