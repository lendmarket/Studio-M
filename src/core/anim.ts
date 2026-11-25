// 애니메이션/전환: 미리보기와 내보내기가 같은 정의를 사용합니다.
import type { AnimType, Clip, TransitionType } from './types';

export interface MotionDef {
  fade: boolean;
  dx: number; // 캔버스 너비 대비 비율 (들어올 때 시작 오프셋)
  dy: number;
}

export const ANIM_DEFS: Record<AnimType, MotionDef> = {
  none: { fade: false, dx: 0, dy: 0 },
  fade: { fade: true, dx: 0, dy: 0 },
  'slide-left': { fade: true, dx: 0.25, dy: 0 },
  'slide-right': { fade: true, dx: -0.25, dy: 0 },
  'slide-up': { fade: true, dx: 0, dy: 0.25 },
  'slide-down': { fade: true, dx: 0, dy: -0.25 },
};

export const TRANSITION_DEFS: Record<TransitionType, MotionDef> = {
  dissolve: { fade: true, dx: 0, dy: 0 },
  'push-left': { fade: false, dx: 1, dy: 0 },
  'push-right': { fade: false, dx: -1, dy: 0 },
  'push-up': { fade: false, dx: 0, dy: 1 },
  'push-down': { fade: false, dx: 0, dy: -1 },
};

export const ANIM_LABELS: { id: AnimType; name: string }[] = [
  { id: 'none', name: '없음' },
  { id: 'fade', name: '페이드' },
  { id: 'slide-left', name: '왼쪽으로' },
  { id: 'slide-right', name: '오른쪽으로' },
  { id: 'slide-up', name: '위로' },
  { id: 'slide-down', name: '아래로' },
];

export const TRANSITION_LABELS: { id: TransitionType; name: string; icon: string }[] = [
  { id: 'dissolve', name: '디졸브', icon: '◐' },
  { id: 'push-left', name: '왼쪽 밀기', icon: '⇠' },
  { id: 'push-right', name: '오른쪽 밀기', icon: '⇢' },
  { id: 'push-up', name: '위로 밀기', icon: '⇡' },
  { id: 'push-down', name: '아래로 밀기', icon: '⇣' },
];

export interface ResolvedMotion {
  inDef: MotionDef;
  inDur: number;
  outDef: MotionDef;
  outDur: number;
}

/** 클립에 적용될 들어오기/나가기 모션 (전환이 있으면 전환이 들어오기를 대체) */
export function resolveMotion(clip: Clip): ResolvedMotion {
  const half = clip.duration / 2;
  let inDef = ANIM_DEFS[clip.animIn.type];
  let inDur = clip.animIn.type === 'none' ? 0 : Math.min(clip.animIn.duration, half);
  if (clip.transition) {
    inDef = TRANSITION_DEFS[clip.transition.type];
    inDur = Math.min(clip.transition.duration, clip.duration);
  }
  const outDef = ANIM_DEFS[clip.animOut.type];
  const outDur = clip.animOut.type === 'none' ? 0 : Math.min(clip.animOut.duration, half);
  return { inDef, inDur, outDef, outDur };
}

/** 타임라인 시간 t에서 클립의 투명도 배수와 이동 오프셋(px) */
export function motionAt(clip: Clip, t: number, W: number, H: number) {
  const m = resolveMotion(clip);
  const local = t - clip.start;
  let alpha = 1;
  let dx = 0;
  let dy = 0;
  if (m.inDur > 0 && local < m.inDur) {
    const p = Math.max(0, Math.min(1, local / m.inDur));
    if (m.inDef.fade) alpha *= p;
    const f = (1 - p) * (1 - p);
    dx += m.inDef.dx * W * f;
    dy += m.inDef.dy * H * f;
  }
  const remain = clip.duration - local;
  if (m.outDur > 0 && remain < m.outDur) {
    const q = Math.max(0, Math.min(1, remain / m.outDur));
    if (m.outDef.fade) alpha *= q;
    const f = (1 - q) * (1 - q);
    dx -= m.outDef.dx * W * f;
    dy -= m.outDef.dy * H * f;
  }
  return { alpha, dx, dy };
}
