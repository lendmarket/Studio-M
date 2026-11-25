// 텍스트 그리기: 미리보기 캔버스와 내보내기용 PNG가 같은 함수를 사용합니다.
import type { Clip, TextStyle } from './types';

let measureCtx: CanvasRenderingContext2D | null = null;
function mctx() {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export function fontString(s: TextStyle, size: number) {
  return `${s.italic ? 'italic ' : ''}${s.bold ? '700' : '400'} ${size}px "${s.fontFamily}", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
}

export function measureText(s: TextStyle, size: number) {
  const ctx = mctx();
  ctx.font = fontString(s, size);
  (ctx as any).letterSpacing = `${s.letterSpacing * (size / 100)}px`;
  const lines = (s.content || ' ').split('\n');
  const widths = lines.map((l) => ctx.measureText(l || ' ').width);
  const maxW = Math.max(...widths, size * 0.5);
  const lh = size * s.lineHeight;
  const totalH = lh * lines.length;
  const pad = s.bgOpacity > 0 ? size * 0.3 : size * 0.1;
  return { lines, widths, maxW, lh, totalH, pad, boxW: maxW + pad * 2, boxH: totalH + pad * 1.2 };
}

function hexToRgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * 텍스트 클립 그리기.
 * k: 프로젝트 좌표 → 출력 좌표 배율, W/H: 출력 캔버스 크기
 */
export function drawTextClip(ctx: CanvasRenderingContext2D, clip: Clip, k: number, W: number, H: number, dx = 0, dy = 0) {
  const s = clip.text;
  if (!s) return;
  const t = clip.transform;
  const size = s.fontSize * t.scale * k;
  if (size <= 0) return;
  const m = measureText(s, size);
  ctx.save();
  ctx.translate(W / 2 + t.x * k + dx, H / 2 + t.y * k + dy);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.font = fontString(s, size);
  (ctx as any).letterSpacing = `${s.letterSpacing * (size / 100)}px`;

  if (s.bgOpacity > 0) {
    ctx.fillStyle = hexToRgba(s.bgColor, s.bgOpacity);
    const x = -m.boxW / 2;
    const y = -m.boxH / 2;
    const r = size * 0.18;
    ctx.beginPath();
    if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, m.boxW, m.boxH, r);
    else ctx.rect(x, y, m.boxW, m.boxH);
    ctx.fill();
  }

  ctx.textBaseline = 'middle';
  ctx.textAlign = s.align;
  const ax = s.align === 'left' ? -m.maxW / 2 : s.align === 'right' ? m.maxW / 2 : 0;
  m.lines.forEach((line, i) => {
    const y = -m.totalH / 2 + m.lh * (i + 0.5);
    if (s.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = size * 0.12;
      ctx.shadowOffsetX = size * 0.04;
      ctx.shadowOffsetY = size * 0.04;
    }
    if (s.strokeWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.lineWidth = s.strokeWidth * (size / 50);
      ctx.strokeStyle = s.strokeColor;
      ctx.strokeText(line, ax, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = s.color;
    ctx.fillText(line, ax, y);
    ctx.shadowColor = 'transparent';
  });
  ctx.restore();
}

/** 내보내기용: 텍스트 클립을 전체 화면 크기의 투명 PNG로 렌더링 */
export function renderTextPng(clip: Clip, projectW: number, W: number, H: number): string {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  drawTextClip(ctx, clip, W / projectW, W, H);
  return c.toDataURL('image/png');
}

export const FONT_LIST = [
  'Malgun Gothic',
  '맑은 고딕',
  'Gulim',
  'Dotum',
  'Batang',
  'Gungsuh',
  'Segoe UI',
  'Arial',
  'Arial Black',
  'Impact',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Comic Sans MS',
  'Courier New',
];

export const DEFAULT_TEXT: TextStyle = {
  content: '텍스트를 입력하세요',
  fontFamily: 'Malgun Gothic',
  fontSize: 80,
  color: '#ffffff',
  bold: true,
  italic: false,
  align: 'center',
  strokeColor: '#000000',
  strokeWidth: 0,
  bgColor: '#000000',
  bgOpacity: 0,
  shadow: false,
  lineHeight: 1.2,
  letterSpacing: 0,
};

export interface TextPreset {
  id: string;
  name: string;
  style: Partial<TextStyle>;
  y?: number; // 프로젝트 높이 대비 위치 (-0.5..0.5)
}

export const TEXT_PRESETS: TextPreset[] = [
  { id: 'default', name: '기본 텍스트', style: {} },
  { id: 'title', name: '제목', style: { content: '제목', fontSize: 140, bold: true, shadow: true } },
  { id: 'subtitle', name: '자막', style: { content: '자막을 입력하세요', fontSize: 56, bold: true, strokeWidth: 6, strokeColor: '#000000' }, y: 0.38 },
  { id: 'box', name: '박스 자막', style: { content: '박스 자막', fontSize: 56, bold: true, bgColor: '#000000', bgOpacity: 0.65 }, y: 0.38 },
  { id: 'yellow', name: '예능 자막', style: { content: '예능 자막!', fontSize: 90, bold: true, color: '#ffe14d', strokeWidth: 10, strokeColor: '#1a1a1a', shadow: true } },
  { id: 'neon', name: '네온', style: { content: 'NEON', fontSize: 130, bold: true, color: '#ff5ad6', strokeWidth: 4, strokeColor: '#ffffff', shadow: true } },
  { id: 'outline', name: '외곽선', style: { content: '외곽선', fontSize: 110, bold: true, color: '#ffffff', strokeWidth: 10, strokeColor: '#7c5cff' } },
  { id: 'pink', name: '핑크 박스', style: { content: '포인트', fontSize: 70, bold: true, color: '#ffffff', bgColor: '#ff4fa3', bgOpacity: 1 } },
  { id: 'serif', name: '감성 명조', style: { content: '감성 문구', fontSize: 80, bold: false, fontFamily: 'Batang', color: '#fff7e6', shadow: true } },
  { id: 'news', name: '뉴스 하단', style: { content: '속보 | 뉴스 하단 자막', fontSize: 50, bold: true, color: '#ffffff', bgColor: '#c4161c', bgOpacity: 1, align: 'left' }, y: 0.4 },
];

export const STICKERS = ['😀', '😂', '🥰', '😎', '🤔', '😭', '😡', '👍', '👏', '🙏', '🔥', '✨', '💯', '❤️', '💖', '⭐', '🎉', '🎁', '🎬', '🎵', '📢', '💡', '✅', '❌', '⚠️', '➡️', '⬅️', '⬆️', '⬇️', '👉', '👀', '💥', '💤', '💬', '🍀', '☀️', '🌙', '⚡', '🌈', '🐶'];
