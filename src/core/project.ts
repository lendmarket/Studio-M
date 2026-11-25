import type { Asset, Clip, ClipKind, Project, Track, TrackType } from './types';
import { NEUTRAL_ADJUST } from './color';
import { DEFAULT_TEXT } from './text';

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

export const ASPECTS: { id: string; name: string; w: number; h: number }[] = [
  { id: '16:9', name: '16:9 (유튜브)', w: 1920, h: 1080 },
  { id: '9:16', name: '9:16 (쇼츠/릴스/틱톡)', w: 1080, h: 1920 },
  { id: '1:1', name: '1:1 (정사각형)', w: 1080, h: 1080 },
  { id: '4:3', name: '4:3', w: 1440, h: 1080 },
  { id: '3:4', name: '3:4', w: 1080, h: 1440 },
  { id: '4:5', name: '4:5 (인스타 피드)', w: 1080, h: 1350 },
  { id: '21:9', name: '21:9 (시네마)', w: 2520, h: 1080 },
];

export function newProject(): Project {
  return {
    version: 1,
    name: '새 프로젝트',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    assets: [],
    tracks: [{ id: uid('trk'), type: 'video', main: true, muted: false, hidden: false, locked: false }],
    clips: [],
  };
}

export function newTrack(type: TrackType): Track {
  return { id: uid('trk'), type, muted: false, hidden: false, locked: false };
}

export function trackTypeFor(kind: ClipKind): TrackType {
  return kind === 'audio' ? 'audio' : kind === 'text' ? 'text' : 'video';
}

export function baseClip(kind: ClipKind, trackId: string, start: number, duration: number, name: string): Clip {
  return {
    id: uid('clip'),
    trackId,
    kind,
    name,
    start,
    duration,
    inPoint: 0,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    adjust: { ...NEUTRAL_ADJUST },
    filter: null,
    animIn: { type: 'none', duration: 0.5 },
    animOut: { type: 'none', duration: 0.5 },
    transition: null,
  };
}

export function clipFromAsset(asset: Asset, trackId: string, start: number): Clip {
  const kind: ClipKind = asset.type === 'image' ? 'image' : asset.type === 'audio' ? 'audio' : 'video';
  const dur = asset.type === 'image' ? 5 : asset.duration || 5;
  const c = baseClip(kind, trackId, start, dur, asset.name);
  c.assetId = asset.id;
  return c;
}

export function textClip(trackId: string, start: number, style = {}, name = '텍스트'): Clip {
  const c = baseClip('text', trackId, start, 3, name);
  c.text = { ...DEFAULT_TEXT, ...style };
  return c;
}

export const clipEnd = (c: Clip) => c.start + c.duration;

export function projectDuration(p: Project): number {
  return p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0);
}

export function mainTrack(p: Project): Track {
  return p.tracks.find((t) => t.main)!;
}

/** 트랙 표시 순서: 텍스트 → 오버레이 영상 → 메인 → 오디오 */
export function sortTracks(tracks: Track[]): Track[] {
  const rank = (t: Track) => (t.type === 'text' ? 0 : t.type === 'video' && !t.main ? 1 : t.main ? 2 : 3);
  return tracks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i)
    .map((x) => x.t);
}

export function maxTransition(prev: Clip, cur: Clip) {
  return Math.max(0, Math.min(prev.duration, cur.duration) / 2 - 0.01);
}

/** 메인 트랙 자석 정렬, 빈 트랙 정리, 첫 클립 전환 제거 */
export function normalize(p: Project): Project {
  const main = mainTrack(p);
  const mainClips = p.clips.filter((c) => c.trackId === main.id).sort((a, b) => a.start - b.start);
  let t = 0;
  mainClips.forEach((c, i) => {
    if (i === 0) {
      c.transition = null;
      c.start = 0;
    } else {
      const prev = mainClips[i - 1];
      if (c.transition) c.transition.duration = Math.min(c.transition.duration, maxTransition(prev, c));
      c.start = Math.max(0, t - (c.transition ? c.transition.duration : 0));
    }
    t = c.start + c.duration;
  });
  p.clips.forEach((c) => {
    if (c.trackId !== main.id) c.transition = null;
    if (c.start < 0) c.start = 0;
  });
  const used = new Set(p.clips.map((c) => c.trackId));
  p.tracks = sortTracks(p.tracks.filter((tr) => tr.main || used.has(tr.id)));
  return p;
}

export function overlaps(p: Project, trackId: string, start: number, end: number, ignoreId?: string) {
  return p.clips.some((c) => c.trackId === trackId && c.id !== ignoreId && c.start < end - 1e-4 && clipEnd(c) > start + 1e-4);
}

/** 해당 유형의 트랙 중 [start,end) 구간이 비어있는 트랙을 찾고, 없으면 새로 만듦 */
export function findFreeTrack(p: Project, type: TrackType, start: number, end: number, ignoreId?: string): Track {
  const cands = p.tracks.filter((t) => t.type === type && !t.main && !t.locked);
  const order = type === 'audio' ? cands : [...cands].reverse(); // 메인/아래쪽부터
  const free = order.find((t) => !overlaps(p, t.id, start, end, ignoreId));
  if (free) return free;
  const nt = newTrack(type);
  p.tracks.push(nt);
  p.tracks = sortTracks(p.tracks);
  // 새 오버레이/텍스트 트랙은 같은 그룹의 맨 위에
  if (type !== 'audio') {
    const idx = p.tracks.indexOf(nt);
    p.tracks.splice(idx, 1);
    const first = p.tracks.findIndex((t) => t.type === type);
    p.tracks.splice(first < 0 ? (type === 'text' ? 0 : p.tracks.findIndex((t) => t.main)) : first, 0, nt);
  }
  return nt;
}

export function assetMap(p: Project) {
  const m = new Map<string, Asset>();
  p.assets.forEach((a) => m.set(a.id, a));
  return m;
}

export function formatTime(t: number, fps = 30, withFrames = true) {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t - Math.floor(t)) * fps + 1e-6);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${withFrames ? ':' + pad(f) : ''}`;
}
