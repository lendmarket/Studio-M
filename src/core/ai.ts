// AI 연동 설정 (키 제외). 키는 메인 프로세스에서 암호화해 따로 저장합니다.

export type GoogleAuth = 'gemini' | 'vertex';

/** 텍스트(스토리 대화·바이블 추출·프롬프트·검수)에 쓸 AI */
export type TextProvider = 'chatgpt' | 'gemini';
/** ChatGPT 연결 방식: 구독(Codex CLI 로그인) 또는 OpenAI API 키 */
export type ChatgptMode = 'codex' | 'api';

export const TEXT_PROVIDER_LABEL: Record<TextProvider, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini' };

export interface AiModels {
  /** Gemini 텍스트 모델 */
  text: string;
  /** OpenAI API 텍스트 모델 */
  openai: string;
  /** Codex(구독) 모델. 비우면 Codex 기본값 */
  codex: string;
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
  textProvider: TextProvider;
  chatgptMode: ChatgptMode;
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
  textProvider: 'chatgpt',
  chatgptMode: 'codex',
  googleAuth: 'gemini',
  vertexProject: '',
  vertexLocation: 'us-central1',
  models: {
    text: 'gemini-2.5-pro',
    openai: 'gpt-5',
    codex: '',
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
    { id: 'openai-in', label: 'OpenAI API 텍스트 입력', kind: 'text', unit: 'mtok', usd: null },
    { id: 'openai-out', label: 'OpenAI API 텍스트 출력', kind: 'text', unit: 'mtok', usd: null },
    { id: 'tts-gemini', label: 'Gemini TTS', kind: 'tts', unit: 'mtok', usd: null },
    { id: 'tts-typecast', label: '타입캐스트 (구독 크레딧)', kind: 'tts', unit: 'kchar', usd: null },
  ],
  defaultBudgetUsd: null, // 예산 한도는 쓰지 않음 (생성 직전 예상 비용 확인 방식)
};

export function withAiDefaults(a?: Partial<AiSettings> | null): AiSettings {
  return {
    ...DEFAULT_AI,
    ...(a || {}),
    models: { ...DEFAULT_AI.models, ...(a?.models || {}) },
    // 새로 추가된 단가 행은 기존 설정에도 붙여 줌
    prices: a?.prices?.length ? [...a.prices, ...DEFAULT_AI.prices.filter((d) => !a.prices!.some((p) => p.id === d.id))] : DEFAULT_AI.prices,
  };
}

/** 키 이름 — 값은 화면으로 보내지 않고 저장 여부만 보냅니다 */
export type SecretName = 'gemini' | 'vertex' | 'openai' | 'typecast' | 'fish';

export interface SecretStatus {
  encryption: boolean;
  gemini: boolean;
  openai: boolean;
  vertex: { set: boolean; clientEmail?: string; projectId?: string };
  typecast: boolean;
  fish: boolean;
}

export interface TestResult {
  ok: boolean;
  message: string;
  models?: string[];
}

/** ChatGPT 구독 연결(Codex CLI) 상태 */
export interface CodexStatus {
  installed: boolean;
  version?: string;
  loggedIn: boolean;
  detail: string;
}

// ---------- 텍스트 AI 호출 (모든 단계 공통) ----------
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  /** JSON 객체로만 답하게 함 */
  json?: boolean;
  /** 기록용 (예: story:logline) */
  purpose?: string;
}

export interface LlmResult {
  ok: boolean;
  text?: string;
  /** json 요청일 때 파싱된 객체 */
  data?: unknown;
  error?: string;
  provider: string;
  model: string;
  ms: number;
  usage?: { input: number; output: number };
}

/** 답변 문자열에서 JSON 객체 꺼내기 (코드 블록·앞뒤 설명이 섞여도) */
export function extractJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* 아래에서 다시 시도 */
  }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* 계속 */
    }
  }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('AI 답변에서 JSON을 찾지 못했습니다');
}
