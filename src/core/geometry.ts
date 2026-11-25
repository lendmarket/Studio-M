import type { Asset, Clip, Project } from './types';
import { measureText } from './text';

export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

/** 화면 맞춤 크기 (scale=1일 때) */
export function fitSize(aw: number, ah: number, W: number, H: number) {
  const s = Math.min(W / aw, H / ah);
  return { w: aw * s, h: ah * s };
}

/** 프로젝트 좌표계에서 클립의 표시 영역 */
export function clipBox(project: Project, clip: Clip, asset: Asset | undefined): Box | null {
  const W = project.width;
  const H = project.height;
  const t = clip.transform;
  if (clip.kind === 'text' && clip.text) {
    const m = measureText(clip.text, clip.text.fontSize * t.scale);
    return { cx: W / 2 + t.x, cy: H / 2 + t.y, w: m.boxW, h: m.boxH, rotation: t.rotation };
  }
  if ((clip.kind === 'video' || clip.kind === 'image') && asset && asset.width && asset.height) {
    const f = fitSize(asset.width, asset.height, W, H);
    return { cx: W / 2 + t.x, cy: H / 2 + t.y, w: f.w * t.scale, h: f.h * t.scale, rotation: t.rotation };
  }
  return null;
}

export function pointInBox(b: Box, px: number, py: number): boolean {
  const a = (-b.rotation * Math.PI) / 180;
  const dx = px - b.cx;
  const dy = py - b.cy;
  const rx = dx * Math.cos(a) - dy * Math.sin(a);
  const ry = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(rx) <= b.w / 2 && Math.abs(ry) <= b.h / 2;
}
