// S1 스토리 개발: 단계형 + 자유 대화 → 항목별로 정리된 확정 스토리(story.json)
import type { Aspect } from './production';
import { ASPECTS } from './production';

export type StoryStepId = 'plan' | 'logline' | 'synopsis' | 'structure' | 'direction';

export interface StoryPlan {
  genre: string;
  tone: string;
  target: string;
  lengthSec: number;
  aspect: Aspect;
  /** 기획 방향 한두 줄 */
  concept: string;
}
export interface StoryLogline {
  title: string;
  logline: string;
}
export interface StorySynopsis {
  ki: string;
  seung: string;
  jeon: string;
  gyeol: string;
}
export interface StoryScene {
  no: number;
  title: string;
  location: string;
  time: string;
  characters: string[];
  event: string;
}
export interface StoryCharacter {
  name: string;
  role: string;
  description: string;
}
export interface StoryRelation {
  a: string;
  b: string;
  relation: string;
}
export interface Foreshadow {
  clue: string;
  /** 심는 위치 (예: S#2, EP01) */
  plantAt: string;
  /** 회수 위치 (예: S#5, EP03) */
  payoffAt: string;
  resolved: boolean;
}
export interface StoryStructure {
  /** 이 편(화) 요약 */
  summary: string;
  scenes: StoryScene[];
  characters: StoryCharacter[];
  relations: StoryRelation[];
  foreshadowing: Foreshadow[];
}
export interface ScenePoint {
  scene: string;
  point: string;
}
export interface StoryDirection {
  /** 평균 샷 길이(초) — 예: 2~3초마다 장면 변화 */
  avgShotSec: number;
  rhythm: string;
  preferred: string[];
  avoid: string[];
  scenePoints: ScenePoint[];
}

export interface StoryDraft {
  plan: StoryPlan;
  logline: StoryLogline;
  synopsis: StorySynopsis;
  structure: StoryStructure;
  direction: StoryDirection;
}

export interface StoryInput {
  id: string;
  kind: 'memo' | 'file' | 'script' | 'channel';
  name: string;
  text: string;
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  at: number;
  /** AI가 낸 선택지 (단계 필드 모양) */
  options?: unknown[];
  /** AI가 고친 안 (단계 필드 모양) — 적용 전 */
  draft?: unknown;
  applied?: boolean;
  provider?: string;
  error?: boolean;
}

export interface StepState {
  confirmed: boolean;
  messages: ChatMsg[];
}

export interface StorySession {
  version: 1;
  updatedAt: number;
  steps: Record<StoryStepId, StepState>;
  draft: StoryDraft;
  inputs: StoryInput[];
}

/** 확정 스토리 — 다음 단계(S2~S6)가 읽는 정형화된 값 */
export interface StoryDoc {
  version: number;
  confirmedAt: number;
  basic: { title: string; logline: string; synopsis: StorySynopsis };
  format: { genre: string; tone: string; target: string; lengthSec: number; aspect: Aspect; concept: string };
  structure: { summary: string; scenes: StoryScene[] };
  links: { characters: StoryCharacter[]; relations: StoryRelation[]; foreshadowing: Foreshadow[] };
  direction: StoryDirection;
  sources: { inputs: { kind: string; name: string }[]; provider?: string };
}

export const STORY_STEPS: { id: StoryStepId; label: string; desc: string; goal: string }[] = [
  {
    id: 'plan', label: '① 기획', desc: '장르·톤·타깃·길이·화면비와 기획 방향',
    goal: '형식(장르, 톤, 타깃 시청자, 길이, 화면비)과 기획 방향(concept)을 정합니다.',
  },
  {
    id: 'logline', label: '② 로그라인', desc: '제목과 한 줄 로그라인',
    goal: '시청자가 바로 이해하고 끝까지 보게 만드는 제목과 한 문장 로그라인을 정합니다.',
  },
  {
    id: 'synopsis', label: '③ 줄거리', desc: '기·승·전·결',
    goal: '로그라인을 기·승·전·결 줄거리로 풀어 갑니다. 각 부분은 2~4문장.',
  },
  {
    id: 'structure', label: '④ 구성', desc: '씬 개요 · 인물 관계 · 복선',
    goal: '줄거리를 씬으로 나누고(장소·시간대·등장 인물·핵심 사건), 주요 인물과 관계, 복선(심는 곳 → 회수하는 곳)을 정합니다.',
  },
  {
    id: 'direction', label: '⑤ 연출', desc: '편집 리듬 · 촬영 기법 · 씬별 포인트',
    goal: '편집 리듬(평균 샷 길이, 예: 2~3초마다 장면 변화), 선호·금지 촬영 기법(슬로우모션, 핸드헬드, 돌리 인 등), 씬별 핵심 연출 포인트를 정합니다. AI 영상은 3~15초 단위로 생성되므로 연결성을 해치지 않는 연출을 고릅니다.',
  },
];

export function emptyDraft(lengthSec = 60, aspect: Aspect = '9:16'): StoryDraft {
  return {
    plan: { genre: '', tone: '', target: '', lengthSec, aspect, concept: '' },
    logline: { title: '', logline: '' },
    synopsis: { ki: '', seung: '', jeon: '', gyeol: '' },
    structure: { summary: '', scenes: [], characters: [], relations: [], foreshadowing: [] },
    direction: { avgShotSec: 2.5, rhythm: '', preferred: [], avoid: [], scenePoints: [] },
  };
}

export function emptySession(lengthSec?: number, aspect?: Aspect): StorySession {
  const steps = Object.fromEntries(STORY_STEPS.map((s) => [s.id, { confirmed: false, messages: [] }])) as unknown as Record<StoryStepId, StepState>;
  return { version: 1, updatedAt: Date.now(), steps, draft: emptyDraft(lengthSec, aspect), inputs: [] };
}

// ---------- AI 답변 정리 (모양이 조금 달라도 받아들임) ----------
const str = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown, d: number) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
};
const strArr = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : typeof v === 'string' ? v.split(/[,·\n]/).map((x) => x.trim()).filter(Boolean) : []);
const arr = (v: unknown) => (Array.isArray(v) ? (v as any[]) : []);

export function normalizeStep(step: StoryStepId, v: any, base: StoryDraft): any {
  v = v || {};
  switch (step) {
    case 'plan': {
      const aspect = ASPECTS.some((a) => a.id === v.aspect) ? v.aspect : base.plan.aspect;
      return { genre: str(v.genre), tone: str(v.tone), target: str(v.target), lengthSec: num(v.lengthSec, base.plan.lengthSec), aspect, concept: str(v.concept) } as StoryPlan;
    }
    case 'logline':
      return { title: str(v.title), logline: str(v.logline) } as StoryLogline;
    case 'synopsis':
      return { ki: str(v.ki), seung: str(v.seung), jeon: str(v.jeon), gyeol: str(v.gyeol) } as StorySynopsis;
    case 'structure':
      return {
        summary: str(v.summary),
        scenes: arr(v.scenes).map((s, i) => ({
          no: num(s?.no, i + 1), title: str(s?.title), location: str(s?.location), time: str(s?.time), characters: strArr(s?.characters), event: str(s?.event),
        })),
        characters: arr(v.characters).map((c) => ({ name: str(c?.name), role: str(c?.role), description: str(c?.description) })),
        relations: arr(v.relations).map((r) => ({ a: str(r?.a), b: str(r?.b), relation: str(r?.relation) })),
        foreshadowing: arr(v.foreshadowing).map((f) => ({ clue: str(f?.clue), plantAt: str(f?.plantAt), payoffAt: str(f?.payoffAt), resolved: !!f?.resolved })),
      } as StoryStructure;
    case 'direction':
      return {
        avgShotSec: num(v.avgShotSec, 2.5),
        rhythm: str(v.rhythm),
        preferred: strArr(v.preferred),
        avoid: strArr(v.avoid),
        scenePoints: arr(v.scenePoints).map((p) => ({ scene: str(p?.scene), point: str(p?.point) })),
      } as StoryDirection;
  }
}

/** 단계별 JSON 모양 설명 (AI에게 알려 줌) */
const STEP_SCHEMA: Record<StoryStepId, string> = {
  plan: '{"genre":"장르","tone":"톤·분위기","target":"타깃 시청자","lengthSec":60,"aspect":"9:16|16:9|1:1|21:9","concept":"기획 방향 1~2문장"}',
  logline: '{"title":"제목","logline":"한 문장 로그라인"}',
  synopsis: '{"ki":"기","seung":"승","jeon":"전","gyeol":"결"}',
  structure:
    '{"summary":"이 편 요약","scenes":[{"no":1,"title":"씬 제목","location":"장소","time":"시간대","characters":["인물"],"event":"핵심 사건"}],' +
    '"characters":[{"name":"이름","role":"주인공|상대역|조연|악역|단역|내레이터","description":"나이·성격·특징"}],' +
    '"relations":[{"a":"인물","b":"인물","relation":"관계"}],"foreshadowing":[{"clue":"복선 내용","plantAt":"S#2","payoffAt":"S#5","resolved":false}]}',
  direction:
    '{"avgShotSec":2.5,"rhythm":"편집 리듬 설명","preferred":["선호 촬영 기법"],"avoid":["피할 기법"],"scenePoints":[{"scene":"S#1","point":"이 씬의 핵심 연출"}]}',
};

export interface SeriesContext {
  seriesTitle: string;
  episodes: { no: number; title: string; summary: string }[];
  openForeshadowing: (Foreshadow & { episode: number })[];
}

export interface PromptContext {
  kind: 'short' | 'series';
  episodeNo?: number;
  draft: StoryDraft;
  steps: Record<StoryStepId, StepState>;
  inputs: StoryInput[];
  series?: SeriesContext | null;
}

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n) + '\n…(이하 생략)' : t);

export function buildSystemPrompt(step: StoryStepId, ctx: PromptContext) {
  const def = STORY_STEPS.find((s) => s.id === step)!;
  const done = STORY_STEPS.filter((s) => s.id !== step && ctx.steps[s.id]?.confirmed).map((s) => `- ${s.label}: ${JSON.stringify((ctx.draft as any)[s.id])}`);
  const inputs = ctx.inputs.map((i) => `### ${i.name} (${i.kind})\n${clip(i.text, 6000)}`).join('\n\n');
  const len = ctx.draft.plan.lengthSec;
  const parts = [
    '당신은 숏폼·드라마 영상을 기획하는 작가 겸 프로듀서입니다. 사용자와 대화하며 스토리를 함께 다듬습니다.',
    '모든 답은 한국어로 씁니다. 영상은 AI로 3~15초 단위 컷을 생성해 편집하므로, 컷 사이 연결성(의상·자세·위치)을 지키기 쉬운 이야기와 연출을 선호합니다.',
    `작품 유형: ${ctx.kind === 'series' ? `시리즈 ${ctx.episodeNo ?? ''}화` : '단편'} · 목표 길이 약 ${len}초 · 화면비 ${ctx.draft.plan.aspect}`,
    `지금 단계: ${def.label} — ${def.goal}`,
  ];
  if (step === 'structure') parts.push(`씬 수는 길이에 맞게 정합니다 (대략 ${Math.max(2, Math.round(len / 15))}~${Math.max(3, Math.round(len / 8))}개).`);
  if (done.length) parts.push(`이미 확정된 내용 (바꾸지 말고 따르세요):\n${done.join('\n')}`);
  parts.push(`지금 단계의 현재 안:\n${JSON.stringify((ctx.draft as any)[step])}`);
  if (ctx.series) {
    parts.push(
      `시리즈 「${ctx.series.seriesTitle}」의 이전 화 요약:\n${ctx.series.episodes.map((e) => `- ${e.no}화 ${e.title}: ${e.summary}`).join('\n') || '(없음)'}`,
      `아직 회수하지 않은 복선:\n${ctx.series.openForeshadowing.map((f) => `- (${f.episode}화) ${f.clue} → ${f.payoffAt}`).join('\n') || '(없음)'}`,
    );
  }
  if (inputs) parts.push(`사용자가 준 자료:\n${inputs}`);
  parts.push(
    '답변 형식(JSON):',
    `- 선택지를 달라는 요청이면: {"message":"짧은 설명","options":[${STEP_SCHEMA[step]}, ...]} — 서로 방향이 다른 안 3개`,
    `- 고쳐 달라는 요청이면: {"message":"무엇을 바꿨는지","draft":${STEP_SCHEMA[step]}}`,
    '- 질문·의견만 나누는 경우: {"message":"답변"} (draft·options 없이)',
  );
  return parts.join('\n\n');
}

export const SUGGEST_PROMPT = '이 단계에 대해 서로 방향이 다른 안 3개를 제안해 주세요.';

/** 확정 스토리 만들기 */
export function buildStoryDoc(session: StorySession, version: number, provider?: string): StoryDoc {
  const d = session.draft;
  return {
    version,
    confirmedAt: Date.now(),
    basic: { title: d.logline.title, logline: d.logline.logline, synopsis: d.synopsis },
    format: { genre: d.plan.genre, tone: d.plan.tone, target: d.plan.target, lengthSec: d.plan.lengthSec, aspect: d.plan.aspect, concept: d.plan.concept },
    structure: { summary: d.structure.summary, scenes: d.structure.scenes },
    links: { characters: d.structure.characters, relations: d.structure.relations, foreshadowing: d.structure.foreshadowing },
    direction: d.direction,
    sources: { inputs: session.inputs.map((i) => ({ kind: i.kind, name: i.name })), provider },
  };
}
