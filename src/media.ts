import { api } from './api';
import { useStore } from './store';
import { uid } from './core/project';
import type { Asset, Project } from './core/types';

const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

export async function importFiles(paths: string[]): Promise<Asset[]> {
  const st = useStore.getState();
  const added: Asset[] = [];
  for (const path of paths) {
    const existing = useStore.getState().project.assets.find((a) => a.path === path);
    if (existing) {
      added.push(existing);
      continue;
    }
    try {
      const info = await api.probe(path);
      const asset: Asset = { id: uid('ast'), path, name: baseName(path), ...info };
      if (asset.type === 'image') asset.thumbs = [path];
      added.push(asset);
      st.addAssets([asset]);
      loadAssetExtras(asset);
    } catch (e: any) {
      st.showToast(`가져오기 실패: ${baseName(path)}`);
      console.error(e);
    }
  }
  return added;
}

/** 썸네일/파형을 백그라운드로 생성 */
export function loadAssetExtras(asset: Asset) {
  const st = useStore.getState();
  if (asset.type === 'video' && !asset.thumbs?.length) {
    api.thumbs(asset.path, asset.duration).then((r: any) => r && st.updateAsset(asset.id, { thumbs: r.files, thumbInterval: r.interval })).catch(() => undefined);
  }
  if (asset.hasAudio && !asset.peaks?.length) {
    api.waveform(asset.path).then((r: any) => r && st.updateAsset(asset.id, { peaks: r.peaks, peaksPerSec: r.perSec })).catch(() => undefined);
  }
}

/** 저장 시에는 캐시성 데이터(썸네일/파형)를 제외 */
export function serializeProject(p: Project): string {
  const lite = { ...p, assets: p.assets.map(({ thumbs, thumbInterval, peaks, peaksPerSec, ...a }) => (a.type === 'image' ? { ...a, thumbs } : a)) };
  return JSON.stringify(lite, null, 1);
}

export async function hydrateProject(p: Project) {
  const missing: string[] = [];
  for (const a of p.assets) {
    if (!(await api.exists(a.path))) missing.push(a.name);
    else loadAssetExtras(a);
  }
  if (missing.length) useStore.getState().showToast(`찾을 수 없는 파일 ${missing.length}개: ${missing.slice(0, 3).join(', ')}`);
}
