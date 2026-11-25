// 사전 제작(작품) 데이터 모델 — 메인 프로세스와 화면이 함께 씁니다.
// 설계: docs/preproduction-design.md

export type ProductionKind = 'short' | 'series';

/** 사전 제작 6단계 */
export type StageId = 'story' | 'bible' | 'script' | 'prompts' | 'media' | 'edit';

export interface StageDef {
  id: StageId;
  no: string; // S1..S6
  dir: string; // 작품 폴더 안의 단계 폴더
  label: string;
  desc: string;
  output: string;
  /** 구현 예정 단계 (B~G) */
  phase: string;
}

export const STAGES: StageDef[] = [
  {
    id: 'story', no: 'S1', dir: '01_story', label: '스토리 개발', phase: 'B',
    desc: 'AI와 단계별로 대화하며 로그라인 → 줄거리 → 화·씬 구성 → 연출 방향을 확정합니다. 확정한 값이 다음 단계에 자동으로 세팅됩니다.',
    output: '확정 스토리 (story.json)',
  },
  {
    id: 'bible', no: 'S2', dir: '02_bible', label: '제작 바이블', phase: 'C',
    desc: '확정 스토리에서 캐릭터·의상·소품·장소를 뽑아 외형 고정 문구, 연기 톤·목소리, 기준 시트를 정합니다.',
    output: '제작 바이블 (bible.json)',
  },
  {
    id: 'script', no: 'S3', dir: '03_script', label: '대본·씬·컷', phase: 'D',
    desc: '화 → 씬 → 컷(3~15초) → 샷(2~3초)으로 나누고, 대사·촬영 기법·연속성(상태 인계, 배치도, 씬 룩)을 정합니다.',
    output: '대본 (script.json)',
  },
  {
    id: 'prompts', no: 'S4', dir: '04_prompts', label: '프롬프트·통합 검수', phase: 'E',
    desc: '이미지·영상·음성 프롬프트를 일괄 생성하고 일관성·연속성·스토리·엔진 적합성을 한 번에 검수합니다.',
    output: '프롬프트 + 검수 리포트 (prompts.json)',
  },
  {
    id: 'media', no: 'S5', dir: '05_media', label: '생성', phase: 'F',
    desc: '기준 시트 → 씬 마스터 → 컷 이미지 → 영상 → 음성 순서로 일괄 생성하고, 마음에 안 드는 컷만 다시 만듭니다.',
    output: '미디어 파일 (버전별)',
  },
  {
    id: 'edit', no: 'S6', dir: '06_edit', label: '프로젝트로 넘기기', phase: 'G',
    desc: '컷 순서대로 편집 프로젝트에 러프컷을 자동 조립하고 업로드 정보 초안과 제작 기록을 만듭니다.',
    output: '편집 프로젝트 (.smproj)',
  },
];

export type StageStatus = 'empty' | 'draft' | 'confirmed' | 'stale';

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  empty: '시작 전',
  draft: '작업 중',
  confirmed: '확정',
  stale: '업데이트 필요',
};

export interface StageState {
  status: StageStatus;
  updatedAt?: number;
  version?: number;
}

export type Stages = Record<StageId, StageState>;

export const emptyStages = (): Stages =>
  Object.fromEntries(STAGES.map((s) => [s.id, { status: 'empty' } as StageState])) as Stages;

export type Aspect = '9:16' | '16:9' | '1:1' | '21:9';

export const ASPECTS: { id: Aspect; label: string; desc: string; w: number; h: number }[] = [
  { id: '9:16', label: '세로 9:16', desc: '쇼츠 · 릴스 · 틱톡', w: 1080, h: 1920 },
  { id: '16:9', label: '가로 16:9', desc: '유튜브 일반 영상', w: 1920, h: 1080 },
  { id: '1:1', label: '정사각 1:1', desc: '피드 게시물', w: 1080, h: 1080 },
  { id: '21:9', label: '영화 21:9', desc: '시네마 와이드', w: 2560, h: 1080 },
];

export const aspectById = (id: string) => ASPECTS.find((a) => a.id === id) || ASPECTS[0];

export const LENGTH_PRESETS = [30, 60, 90, 120, 180];

export interface ProductionFormat {
  aspect: Aspect;
  /** 한 편(화) 목표 길이 (초) */
  lengthSec: number;
}

/** 단편: production.json / 시리즈: series.json */
export interface ProductionMeta {
  version: 1;
  id: string;
  kind: ProductionKind;
  title: string;
  createdAt: number;
  updatedAt: number;
  format: ProductionFormat;
  /** 작품(시리즈는 화) 기본 예산 (USD). null = 한도 없음 */
  budgetUsd: number | null;
  /** 단편만 사용. 시리즈는 화마다 episode.json에 있음 */
  stages?: Stages;
}

/** 시리즈의 화: EPxx/episode.json */
export interface EpisodeMeta {
  version: 1;
  id: string;
  no: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  budgetUsd: number | null;
  stages: Stages;
}

export interface EpisodeInfo {
  dir: string;
  file: string;
  meta: EpisodeMeta;
}

export interface ProductionInfo {
  dir: string;
  file: string;
  meta: ProductionMeta;
  /** 시리즈만 */
  episodes?: EpisodeInfo[];
}

export interface NewProductionInput {
  kind: ProductionKind;
  title: string;
  format: ProductionFormat;
  budgetUsd: number | null;
}

/** 작업 폴더 안 사전 제작 폴더 이름 */
export const WS_DIRS = { short: '단편', series: '시리즈', library: '라이브러리' } as const;
export const LIBRARY_DIRS = ['캐릭터', '소품', '장소', '목소리'];
export const SERIES_DIRS = { bible: 'series_bible', arc: 'story_arc' } as const;

export const episodeDirName = (no: number) => `EP${String(no).padStart(2, '0')}`;

/** 화(시리즈) 또는 단편의 진행률 0..1 */
export function progressOf(stages: Stages | undefined) {
  if (!stages) return 0;
  const done = STAGES.filter((s) => stages[s.id]?.status === 'confirmed').length;
  return done / STAGES.length;
}
