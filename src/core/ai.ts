// AI 연동 설정 (키 제외). 키는 메인 프로세스에서 암호화해 따로 저장합니다.

export type GoogleAuth = 'gemini' | 'vertex';

export interface AiModels {
  /** 스토리 대화·바이블 추출·프롬프트·검수 */
  text: string;
  /** 기준 시트·씬 마스터·컷 이미지 */
  image: string;
  /** 컷 영상 */
  video: string;
  /** 대사·내레이션 */
  tts: string;
}

export type PriceUnit = 'sec' | 'image' | 'mtok' | 'kchar';
export const PRICE_UNIT_LABEL: Record<PriceUnit, string> = {
  sec: '1초',
  image: '1장',
  mtok: '100만 토큰',
  kchar: '1,000자',
};

export interface PriceRow {
  id: string;
  label: string;
  kind: 'text' | 'image' | 'video' | 'tts';
  unit: PriceUnit;
  /** USD. null = 모름(예상 비용 계산에서 빠짐) */
  usd: number | null;
}

export interface AiSettings {
  googleAuth: GoogleAuth;
  vertexProject: string;
  vertexLocation: string;
  models: AiModels;
  prices: PriceRow[];
  /** 새 작품 기본 예산 (USD) */
  defaultBudgetUsd: number | null;
}

// 모델 이름은 자주 바뀌므로 설정에서 '모델 목록 불러오기'로 확인 후 고르게 합니다.
export const DEFAULT_AI: AiSettings = {
  googleAuth: 'gemini',
  vertexProject: '',
  vertexLocation: 'us-central1',
  models: {
    text: 'gemini-2.5-pro',
    image: 'gemini-2.5-flash-image',
    video: 'veo-3.1-fast-generate-preview',
    tts: 'gemini-2.5-flash-preview-tts',
  },
  // 참고값(TB Drama 화면 표기·공개 자료 기준). 실제 단가는 Google 요금 페이지에서 확인해 고치세요.
  prices: [
    { id: 'veo-omni', label: 'Omni (Gemini Omni Flash)', kind: 'video', unit: 'sec', usd: 0.07 },
    { id: 'veo-fast', label: 'Veo 3.1 Fast', kind: 'video', unit: 'sec', usd: 0.1 },
    { id: 'veo-std', label: 'Veo 3.1', kind: 'video', unit: 'sec', usd: 0.4 },
    { id: 'img-flash', label: '나노바나나 (Flash Image)', kind: 'image', unit: 'image', usd: 0.02 },
    { id: 'img-pro', label: '나노바나나 프로', kind: 'image', unit: 'image', usd: null },
    { id: 'text-in', label: 'Gemini 텍스트 입력', kind: 'text', unit: 'mtok', usd: null },
    { id: 'text-out', label: 'Gemini 텍스트 출력', kind: 'text', unit: 'mtok', usd: null },
    { id: 'tts-gemini', label: 'Gemini TTS', kind: 'tts', unit: 'mtok', usd: null },
    { id: 'tts-typecast', label: '타입캐스트 (구독 크레딧)', kind: 'tts', unit: 'kchar', usd: null },
  ],
  defaultBudgetUsd: 20,
};

export function withAiDefaults(a?: Partial<AiSettings> | null): AiSettings {
  return {
    ...DEFAULT_AI,
    ...(a || {}),
    models: { ...DEFAULT_AI.models, ...(a?.models || {}) },
    prices: a?.prices?.length ? a.prices : DEFAULT_AI.prices,
  };
}

/** 키 이름 — 값은 화면으로 보내지 않고 저장 여부만 보냅니다 */
export type SecretName = 'gemini' | 'vertex' | 'typecast' | 'fish';

export interface SecretStatus {
  encryption: boolean;
  gemini: boolean;
  vertex: { set: boolean; clientEmail?: string; projectId?: string };
  typecast: boolean;
  fish: boolean;
}

export interface TestResult {
  ok: boolean;
  message: string;
  models?: string[];
}
