export type AssetType = 'video' | 'audio' | 'image';

export interface Asset {
  id: string;
  type: AssetType;
  path: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  thumbs?: string[];
  thumbInterval?: number;
  peaks?: number[];
  peaksPerSec?: number;
}

export type TrackType = 'video' | 'audio' | 'text';

export interface Track {
  id: string;
  type: TrackType;
  main?: boolean;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
}

export type ClipKind = 'video' | 'image' | 'audio' | 'text';

export interface Transform {
  x: number; // 캔버스 중심 기준 픽셀 오프셋 (프로젝트 해상도 기준)
  y: number;
  scale: number; // 1 = 화면에 맞춤
  rotation: number; // 도(degree)
  opacity: number; // 0..1
}

export interface Adjust {
  brightness: number; // -100..100
  contrast: number;
  saturation: number;
  hue: number; // -180..180
  temperature: number;
  tint: number;
}

export interface FilterRef {
  id: string;
  intensity: number; // 0..100
}

export type AnimType = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down';

export interface Anim {
  type: AnimType;
  duration: number;
}

export type TransitionType = 'dissolve' | 'push-left' | 'push-right' | 'push-up' | 'push-down';

export interface Transition {
  type: TransitionType;
  duration: number;
}

export interface TextStyle {
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  strokeColor: string;
  strokeWidth: number;
  bgColor: string;
  bgOpacity: number; // 0..1
  shadow: boolean;
  lineHeight: number;
  letterSpacing: number;
}

export interface Clip {
  id: string;
  trackId: string;
  kind: ClipKind;
  assetId?: string;
  name: string;
  start: number; // 타임라인 시작 (초)
  duration: number; // 타임라인상 길이 (초)
  inPoint: number; // 원본 시작 위치 (초)
  speed: number;
  volume: number; // 0..2
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  transform: Transform;
  adjust: Adjust;
  filter: FilterRef | null;
  text?: TextStyle;
  animIn: Anim;
  animOut: Anim;
  transition: Transition | null; // 메인 트랙: 이전 클립에서 이 클립으로 넘어가는 전환
}

export interface Project {
  version: 1;
  name: string;
  platform?: string; // platforms.ts의 id
  createdAt?: number;
  width: number;
  height: number;
  fps: number;
  background: string;
  assets: Asset[];
  tracks: Track[];
  clips: Clip[];
}

export interface ExportSettings {
  outPath: string;
  width: number;
  height: number;
  fps: number;
  crf: number;
}
