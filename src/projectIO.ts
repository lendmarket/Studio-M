import { api } from './api';
import { useStore } from './store';
import { hydrateProject, serializeProject } from './media';
import { newProject } from './core/project';
import type { Project } from './core/types';

const FILTERS = [{ name: 'Studio M 프로젝트', extensions: ['smproj'] }];

export async function saveProject(saveAs = false): Promise<boolean> {
  const st = useStore.getState();
  let path = st.filePath;
  if (!path || saveAs) {
    path = await api.saveDialog(`${st.project.name || '프로젝트'}.smproj`, FILTERS);
    if (!path) return false;
  }
  await api.writeFile(path, serializeProject(st.project));
  st.markSaved(path);
  st.showToast('저장되었습니다');
  return true;
}

/** 저장되지 않은 변경이 있으면 확인. 계속 진행해도 되면 true */
export async function confirmDiscard(): Promise<boolean> {
  const st = useStore.getState();
  if (!st.dirty || st.project.clips.length === 0) return true;
  const r = await api.confirm('저장하지 않은 변경 사항이 있습니다.', ['저장', '저장 안 함', '취소'], '변경 사항을 저장하시겠습니까?');
  if (r === 0) return saveProject();
  return r === 1;
}

export async function openProjectFile(path?: string | null) {
  if (!(await confirmDiscard())) return;
  const f = path || (await api.openProjectDialog());
  if (!f) return;
  try {
    const p = JSON.parse(await api.readFile(f)) as Project;
    if (!p || !Array.isArray(p.clips)) throw new Error('bad');
    useStore.getState().setProject(p, f);
    hydrateProject(p);
  } catch {
    useStore.getState().showToast('프로젝트 파일을 열 수 없습니다');
  }
}

export async function newProjectAction() {
  if (!(await confirmDiscard())) return;
  useStore.getState().setProject(newProject());
}

let timer: number | undefined;
export function startAutosave() {
  window.clearInterval(timer);
  timer = window.setInterval(() => {
    const st = useStore.getState();
    if (st.dirty) api.autosave(JSON.stringify({ filePath: st.filePath, project: JSON.parse(serializeProject(st.project)) }));
  }, 20000);
}

export async function restoreAutosave() {
  const pending = await api.pendingOpen();
  if (pending) return openProjectFile(pending);
  const raw = await api.loadAutosave();
  if (!raw) return;
  try {
    const { filePath, project } = JSON.parse(raw);
    if (!project?.clips?.length) return;
    useStore.getState().setProject(project, filePath);
    useStore.setState({ dirty: true });
    hydrateProject(project);
    useStore.getState().showToast('마지막 작업을 복구했습니다');
  } catch {
    /* ignore */
  }
}
