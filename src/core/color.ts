// 색상 처리: 미리보기(SVG 필터)와 내보내기(FFmpeg)가 같은 수식을 쓰도록 3x3 행렬 + 대비로 표현합니다.
import type { Adjust, FilterRef } from './types';

export type Mat3 = number[]; // row-major 9개

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
}

/** 여러 행렬을 적용 순서대로 합성 (첫 번째가 먼저 적용) */
export function chain(...ms: Mat3[]): Mat3 {
  return ms.reduce((acc, m) => mul(m, acc), IDENTITY);
}

export function saturate(s: number): Mat3 {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
}

export function hueRotate(deg: number): Mat3 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

export function diag(r: number, g: number, b: number): Mat3 {
  return [r, 0, 0, 0, g, 0, 0, 0, b];
}

export const SEPIA: Mat3 = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];

export function lerp(a: Mat3, b: Mat3, t: number): Mat3 {
  return a.map((v, i) => v + (b[i] - v) * t);
}

export interface FilterPreset {
  id: string;
  name: string;
  matrix: Mat3;
  swatch: string; // 미리보기 색
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'mono', name: '흑백', matrix: saturate(0), swatch: 'linear-gradient(135deg,#111,#eee)' },
  { id: 'sepia', name: '세피아', matrix: SEPIA, swatch: 'linear-gradient(135deg,#5b4128,#e8c79a)' },
  { id: 'vintage', name: '빈티지', matrix: chain(saturate(0.7), diag(1.06, 1.0, 0.84)), swatch: 'linear-gradient(135deg,#6e5a3c,#d9c49a)' },
  { id: 'warm', name: '따뜻함', matrix: diag(1.12, 1.02, 0.85), swatch: 'linear-gradient(135deg,#ff9a3c,#ffd27a)' },
  { id: 'cool', name: '시원함', matrix: diag(0.88, 1.0, 1.15), swatch: 'linear-gradient(135deg,#2f7bff,#9fe3ff)' },
  { id: 'vivid', name: '비비드', matrix: saturate(1.55), swatch: 'linear-gradient(135deg,#ff2f7b,#28e07a)' },
  { id: 'film', name: '필름', matrix: chain(saturate(0.85), hueRotate(-8), diag(1.04, 1.0, 0.92)), swatch: 'linear-gradient(135deg,#3d4a3a,#d6c8a0)' },
  { id: 'teal', name: '틸&오렌지', matrix: [1.12, -0.02, -0.1, -0.04, 1.02, 0.02, -0.12, 0.08, 1.12], swatch: 'linear-gradient(135deg,#0d8f8f,#ff9447)' },
  { id: 'noir', name: '누아르', matrix: chain(saturate(0), diag(1.08, 1.08, 1.08)), swatch: 'linear-gradient(135deg,#000,#888)' },
  { id: 'rose', name: '로즈', matrix: diag(1.08, 0.94, 1.02), swatch: 'linear-gradient(135deg,#c2477a,#ffc2d6)' },
  { id: 'forest', name: '포레스트', matrix: chain(saturate(1.1), diag(0.92, 1.08, 0.92)), swatch: 'linear-gradient(135deg,#1f5f2e,#a8e08a)' },
  { id: 'dream', name: '몽환', matrix: chain(saturate(1.2), hueRotate(15), diag(1.03, 0.98, 1.08)), swatch: 'linear-gradient(135deg,#7c5cff,#ffb3e6)' },
  { id: 'faded', name: '페이드', matrix: chain(saturate(0.55), diag(0.96, 0.96, 1.0)), swatch: 'linear-gradient(135deg,#8a8f99,#e5e1da)' },
  { id: 'cyber', name: '사이버', matrix: chain(hueRotate(-25), saturate(1.4), diag(0.95, 0.9, 1.15)), swatch: 'linear-gradient(135deg,#00e5ff,#ff00c8)' },
];

export const NEUTRAL_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, hue: 0, temperature: 0, tint: 0 };

export interface ColorOps {
  contrast: number; // 1 = 변화 없음
  matrix: Mat3;
  identity: boolean;
}

export function colorOps(adj: Adjust, filter: FilterRef | null): ColorOps {
  const contrast = Math.max(0, 1 + adj.contrast / 100);
  const parts: Mat3[] = [];
  if (adj.brightness) {
    const b = Math.max(0, 1 + (adj.brightness / 100) * 0.6);
    parts.push(diag(b, b, b));
  }
  if (adj.saturation) parts.push(saturate(Math.max(0, 1 + adj.saturation / 100)));
  if (adj.hue) parts.push(hueRotate(adj.hue));
  if (adj.temperature || adj.tint) {
    const t = adj.temperature / 100;
    const g = adj.tint / 100;
    parts.push(diag(1 + t * 0.2, 1 - g * 0.2, 1 - t * 0.2));
  }
  if (filter && filter.intensity > 0) {
    const p = FILTER_PRESETS.find((f) => f.id === filter.id);
    if (p) parts.push(lerp(IDENTITY, p.matrix, filter.intensity / 100));
  }
  const matrix = chain(...parts);
  const identity = contrast === 1 && matrix.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-6);
  return { contrast, matrix, identity };
}

export function fmt(n: number): string {
  return (Math.round(n * 10000) / 10000).toString();
}

/** FFmpeg 필터 문자열 (format=rgba 이후에 적용) */
export function ffmpegColorFilters(ops: ColorOps): string[] {
  if (ops.identity) return [];
  const out: string[] = [];
  if (ops.contrast !== 1) {
    const c = fmt(ops.contrast);
    const e = `clip((val-127.5)*${c}+127.5,0,255)`;
    out.push(`lutrgb=r='${e}':g='${e}':b='${e}'`);
  }
  const m = ops.matrix;
  if (!m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-6)) {
    out.push(
      `colorchannelmixer=rr=${fmt(m[0])}:rg=${fmt(m[1])}:rb=${fmt(m[2])}:gr=${fmt(m[3])}:gg=${fmt(m[4])}:gb=${fmt(m[5])}:br=${fmt(m[6])}:bg=${fmt(m[7])}:bb=${fmt(m[8])}`,
    );
  }
  return out;
}
