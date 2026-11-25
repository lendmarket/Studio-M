// 플랫폼 규격, 세이프존(대략적인 UI 가림 영역), 길이 제한
export interface SafeZone {
  top: number; // 높이 대비 비율
  bottom: number;
  left: number;
  right: number;
  labels?: { top?: string; bottom?: string; right?: string };
}

export interface Platform {
  id: string;
  name: string;
  short: string;
  group: 'vertical' | 'horizontal' | 'square';
  w: number;
  h: number;
  maxSec: number | null; // 기본 최대 길이 (설정에서 변경 가능)
  color: string;
  glyph: string;
  safe: SafeZone | null;
  desc: string;
}

export const PLATFORMS: Platform[] = [
  {
    id: 'shorts', name: '유튜브 쇼츠', short: '쇼츠', group: 'vertical', w: 1080, h: 1920, maxSec: 180,
    color: '#ff3b5c', glyph: '▶', desc: '9:16 · 최대 3분',
    safe: { top: 0.12, bottom: 0.24, left: 0.04, right: 0.16, labels: { top: '상단 메뉴', bottom: '제목 · 채널', right: '버튼' } },
  },
  {
    id: 'reels', name: '인스타 릴스', short: '릴스', group: 'vertical', w: 1080, h: 1920, maxSec: 180,
    color: '#e1306c', glyph: '◎', desc: '9:16 · 최대 3분',
    safe: { top: 0.13, bottom: 0.3, left: 0.04, right: 0.15, labels: { top: '상단 메뉴', bottom: '캡션 · 계정', right: '버튼' } },
  },
  {
    id: 'tiktok', name: '틱톡', short: '틱톡', group: 'vertical', w: 1080, h: 1920, maxSec: 600,
    color: '#25f4ee', glyph: '♪', desc: '9:16 · 최대 10분',
    safe: { top: 0.11, bottom: 0.26, left: 0.05, right: 0.16, labels: { top: '상단 탭', bottom: '캡션 · 음악', right: '버튼' } },
  },
  {
    id: 'youtube', name: '유튜브 롱폼', short: '유튜브', group: 'horizontal', w: 1920, h: 1080, maxSec: null,
    color: '#ff4b4b', glyph: '▶', desc: '16:9 · 길이 제한 없음',
    safe: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
  },
  {
    id: 'brand', name: '브랜드 광고', short: '광고', group: 'horizontal', w: 1920, h: 1080, maxSec: null,
    color: '#ffb020', glyph: '★', desc: '16:9 · 롱폼 광고',
    safe: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
  },
  {
    id: 'feed', name: '인스타 피드', short: '피드', group: 'vertical', w: 1080, h: 1350, maxSec: null,
    color: '#a35cff', glyph: '▦', desc: '4:5 · 피드 게시물',
    safe: { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 },
  },
  {
    id: 'square', name: '정사각형', short: '1:1', group: 'square', w: 1080, h: 1080, maxSec: null,
    color: '#3ccf8e', glyph: '■', desc: '1:1 · 피드/광고',
    safe: { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 },
  },
];

export const CUSTOM_PLATFORM: Platform = {
  id: 'custom', name: '사용자 지정', short: '사용자', group: 'horizontal', w: 1920, h: 1080, maxSec: null,
  color: '#8b8b96', glyph: '◇', desc: '', safe: null,
};

export function platformById(id?: string): Platform {
  return PLATFORMS.find((p) => p.id === id) || CUSTOM_PLATFORM;
}

export function limitFor(id: string | undefined, overrides: Record<string, number | null> = {}): number | null {
  if (id && id in overrides) return overrides[id];
  return platformById(id).maxSec;
}
