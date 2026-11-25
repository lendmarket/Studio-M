import { create } from 'zustand';
import type { Asset, Clip, Project } from './core/types';
import {
  clipEnd,
  clipFromAsset,
  findFreeTrack,
  mainTrack,
  newProject,
  normalize,
  overlaps,
  projectDuration,
  textClip,
  trackTypeFor,
  uid,
} from './core/project';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export type LeftTab = 'media' | 'audio' | 'text' | 'sticker' | 'transition' | 'filter';

interface State {
  project: Project;
  filePath: string | null;
  dirty: boolean;
  past: Project[];
  future: Project[];
  selectedId: string | null;
  currentTime: number;
  playing: boolean;
  zoom: number; // px / 초
  snap: boolean;
  leftTab: LeftTab;
  clipboard: Clip | null;
  toast: string | null;
  exportOpen: boolean;

  /** 변경 전 스냅샷 저장 (드래그 시작 시 1회) */
  checkpoint: () => void;
  /** 히스토리 없이 수정 (드래그 중) */
  mutate: (fn: (p: Project) => void, normalizeAfter?: boolean) => void;
  /** 히스토리 포함 수정 */
  apply: (fn: (p: Project) => void) => void;
  undo: () => void;
  redo: () => void;

  setProject: (p: Project, filePath?: string | null) => void;
  markSaved: (filePath: string) => void;
  select: (id: string | null) => void;
  seek: (t: number) => void;
  setPlaying: (v: boolean) => void;
  setZoom: (z: number) => void;
  set: (s: Partial<State>) => void;
  showToast: (msg: string) => void;

  addAssets: (assets: Asset[]) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  removeAsset: (id: string) => void;
  addAssetToTimeline: (assetId: string, opts?: { trackId?: string; start?: number }) => void;
  addText: (style: object, name: string, yFrac?: number) => void;
  updateClip: (id: string, patch: Partial<Clip> | ((c: Clip) => void)) => void;
  splitAtPlayhead: () => void;
  deleteSelected: () => void;
  trimSide: (side: 'left' | 'right') => void;
  duplicateSelected: () => void;
  copy: () => void;
  paste: () => void;
  detachAudio: () => void;
}

export const useStore = create<State>((set, get) => ({
  project: newProject(),
  filePath: null,
  dirty: false,
  past: [],
  future: [],
  selectedId: null,
  currentTime: 0,
  playing: false,
  zoom: 60,
  snap: true,
  leftTab: 'media',
  clipboard: null,
  toast: null,
  exportOpen: false,

  checkpoint: () => {
    const { project, past } = get();
    set({ past: [...past.slice(-99), clone(project)], future: [], dirty: true });
  },
  mutate: (fn, normalizeAfter = false) => {
    const p = clone(get().project);
    fn(p);
    if (normalizeAfter) normalize(p);
    set({ project: p, dirty: true });
  },
  apply: (fn) => {
    get().checkpoint();
    get().mutate(fn, true);
  },
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [clone(project), ...future], dirty: true });
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], future: future.slice(1), past: [...past, clone(project)], dirty: true });
  },

  setProject: (p, filePath = null) =>
    set({ project: normalize(p), filePath, past: [], future: [], selectedId: null, currentTime: 0, playing: false, dirty: false }),
  markSaved: (filePath) => set({ filePath, dirty: false }),
  select: (id) => set({ selectedId: id }),
  seek: (t) => set({ currentTime: Math.max(0, t) }),
  setPlaying: (v) => set({ playing: v }),
  setZoom: (z) => set({ zoom: Math.max(4, Math.min(600, z)) }),
  set: (s) => set(s),
  showToast: (msg) => {
    set({ toast: msg });
    setTimeout(() => get().toast === msg && set({ toast: null }), 2600);
  },

  addAssets: (assets) => get().mutate((p) => p.assets.push(...assets)),
  updateAsset: (id, patch) =>
    set((s) => ({ project: { ...s.project, assets: s.project.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) } })),
  removeAsset: (id) =>
    get().apply((p) => {
      p.assets = p.assets.filter((a) => a.id !== id);
      p.clips = p.clips.filter((c) => c.assetId !== id);
    }),

  addAssetToTimeline: (assetId, opts = {}) => {
    const { project, currentTime } = get();
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    let newId = '';
    get().apply((p) => {
      const main = mainTrack(p);
      const type = asset.type === 'audio' ? 'audio' : 'video';
      const forceNew = opts.trackId?.startsWith('new-');
      let trackId = forceNew ? undefined : opts.trackId;
      const target = trackId ? p.tracks.find((t) => t.id === trackId) : undefined;
      if (target && target.type !== type) trackId = undefined;
      if (!trackId && !forceNew) trackId = type === 'video' ? main.id : undefined;
      const c = clipFromAsset(asset, trackId || main.id, 0);
      if (trackId === main.id && !forceNew) {
        // 메인 트랙: 지정 위치(또는 끝)에 삽입
        const mains = p.clips.filter((x) => x.trackId === main.id).sort((a, b) => a.start - b.start);
        if (opts.start === undefined) c.start = mains.length ? clipEnd(mains[mains.length - 1]) + 0.001 : 0;
        else {
          const before = mains.filter((x) => x.start + x.duration / 2 < opts.start!);
          const at = before.length ? clipEnd(before[before.length - 1]) : 0;
          mains.slice(before.length).forEach((x) => (x.start += c.duration + 0.002));
          c.start = at + 0.001;
        }
      } else {
        const start = opts.start ?? currentTime;
        c.start = start;
        let tr = trackId ? p.tracks.find((t) => t.id === trackId) : undefined;
        if (!tr || tr.locked || overlaps(p, tr.id, start, start + c.duration)) tr = findFreeTrack(p, type, start, start + c.duration);
        c.trackId = tr.id;
      }
      p.clips.push(c);
      newId = c.id;
    });
    set({ selectedId: newId });
  },

  addText: (style, name, yFrac) => {
    const { currentTime } = get();
    let newId = '';
    get().apply((p) => {
      const tr = findFreeTrack(p, 'text', currentTime, currentTime + 3);
      const c = textClip(tr.id, currentTime, style, name);
      if (yFrac) c.transform.y = yFrac * p.height;
      p.clips.push(c);
      newId = c.id;
    });
    set({ selectedId: newId });
  },

  updateClip: (id, patch) =>
    get().apply((p) => {
      const c = p.clips.find((x) => x.id === id);
      if (!c) return;
      if (typeof patch === 'function') patch(c);
      else Object.assign(c, patch);
    }),

  splitAtPlayhead: () => {
    const { project, currentTime: t, selectedId } = get();
    const locked = new Set(project.tracks.filter((x) => x.locked).map((x) => x.id));
    let targets = project.clips.filter((c) => c.start + 0.03 < t && clipEnd(c) - 0.03 > t && !locked.has(c.trackId));
    const sel = targets.find((c) => c.id === selectedId);
    if (sel) targets = [sel];
    else {
      const mainId = mainTrack(project).id;
      const m = targets.filter((c) => c.trackId === mainId);
      if (m.length) targets = m;
    }
    if (!targets.length) return get().showToast('재생헤드 위치에 분할할 클립이 없습니다');
    get().apply((p) => {
      for (const tc of targets) {
        const c = p.clips.find((x) => x.id === tc.id)!;
        const local = t - c.start;
        const right: Clip = clone(c);
        right.id = uid('clip');
        right.start = t;
        right.duration = c.duration - local;
        right.inPoint = c.inPoint + local * c.speed;
        right.transition = null;
        right.animIn = { ...right.animIn, type: 'none' };
        right.fadeIn = 0;
        c.duration = local;
        c.animOut = { ...c.animOut, type: 'none' };
        c.fadeOut = 0;
        p.clips.push(right);
      }
    });
  },

  deleteSelected: () => {
    const { selectedId, project } = get();
    const c = project.clips.find((x) => x.id === selectedId);
    if (!c) return;
    if (project.tracks.find((t) => t.id === c.trackId)?.locked) return get().showToast('잠긴 트랙입니다');
    get().apply((p) => {
      p.clips = p.clips.filter((x) => x.id !== selectedId);
    });
    set({ selectedId: null });
  },

  trimSide: (side) => {
    const { selectedId, project, currentTime: t } = get();
    const c = project.clips.find((x) => x.id === selectedId) || project.clips.find((x) => x.trackId === mainTrack(project).id && x.start < t && clipEnd(x) > t);
    if (!c || !(c.start < t && clipEnd(c) > t)) return get().showToast('재생헤드가 클립 위에 있어야 합니다');
    get().apply((p) => {
      const x = p.clips.find((y) => y.id === c.id)!;
      const local = t - x.start;
      if (side === 'left') {
        x.inPoint += local * x.speed;
        x.duration -= local;
        x.start = t;
      } else x.duration = local;
    });
    if (side === 'left') {
      const nc = get().project.clips.find((x) => x.id === c.id);
      if (nc) set({ currentTime: nc.start });
    }
  },

  duplicateSelected: () => {
    const { selectedId } = get();
    get().copy();
    if (selectedId) get().paste();
  },
  copy: () => {
    const c = get().project.clips.find((x) => x.id === get().selectedId);
    if (c) set({ clipboard: clone(c) });
  },
  paste: () => {
    const cb = get().clipboard;
    if (!cb) return;
    let newId = '';
    get().apply((p) => {
      const c: Clip = clone(cb);
      c.id = uid('clip');
      const main = mainTrack(p);
      if (c.trackId === main.id && p.tracks.some((t) => t.id === c.trackId)) {
        c.start = get().currentTime;
        // 메인 트랙: 재생헤드 위치에 삽입
        const mains = p.clips.filter((x) => x.trackId === main.id && x.start >= c.start - 0.001);
        mains.forEach((x) => (x.start += c.duration + 0.002));
      } else {
        c.start = get().currentTime;
        c.trackId = findFreeTrack(p, trackTypeFor(c.kind), c.start, c.start + c.duration).id;
      }
      p.clips.push(c);
      newId = c.id;
    });
    set({ selectedId: newId });
  },

  detachAudio: () => {
    const { selectedId, project } = get();
    const c = project.clips.find((x) => x.id === selectedId);
    const a = c && project.assets.find((x) => x.id === c.assetId);
    if (!c || c.kind !== 'video' || !a?.hasAudio) return get().showToast('오디오가 있는 동영상 클립을 선택하세요');
    get().apply((p) => {
      const v = p.clips.find((x) => x.id === c.id)!;
      const au: Clip = clone(v);
      au.id = uid('clip');
      au.kind = 'audio';
      au.name = v.name + ' (오디오)';
      au.transition = null;
      au.trackId = findFreeTrack(p, 'audio', v.start, clipEnd(v)).id;
      v.muted = true;
      p.clips.push(au);
    });
  },
}));

export const getDuration = () => projectDuration(useStore.getState().project);
