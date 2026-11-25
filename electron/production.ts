// 사전 제작(작품) 폴더 관리: 작업 폴더/단편, 작업 폴더/시리즈, 작업 폴더/라이브러리
import { shell } from 'electron';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getSettings, safeName, uniquePath } from './workspace';
import {
  emptyStages, EpisodeInfo, EpisodeMeta, episodeDirName, LIBRARY_DIRS, NewProductionInput, ProductionInfo, ProductionMeta,
  SERIES_DIRS, STAGES, StageId, StageState, WS_DIRS,
} from '../src/core/production';

const PROD_FILE = 'production.json';
const SERIES_FILE = 'series.json';
const EPISODE_FILE = 'episode.json';

const ws = () => getSettings().workspace;
const readJson = <T,>(f: string): T => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f: string, v: unknown) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2), 'utf8');
  fs.renameSync(tmp, f);
};

/** 작업 폴더 안의 단편/시리즈/라이브러리 폴더 준비 */
export function ensureProductionDirs() {
  const root = ws();
  fs.mkdirSync(path.join(root, WS_DIRS.short), { recursive: true });
  fs.mkdirSync(path.join(root, WS_DIRS.series), { recursive: true });
  for (const d of LIBRARY_DIRS) fs.mkdirSync(path.join(root, WS_DIRS.library, d), { recursive: true });
}

/** 경로가 작업 폴더 안인지 확인 (작업 폴더 밖 파일은 건드리지 않음) */
function assertInWorkspace(p: string) {
  const root = path.resolve(ws()).toLowerCase() + path.sep;
  if (!path.resolve(p).toLowerCase().startsWith(root)) throw new Error('작업 폴더 밖의 경로입니다');
}

function makeStageDirs(dir: string) {
  for (const s of STAGES) fs.mkdirSync(path.join(dir, s.dir), { recursive: true });
}

export function createProduction(input: NewProductionInput): ProductionInfo {
  ensureProductionDirs();
  const now = Date.now();
  const title = input.title.trim() || (input.kind === 'series' ? '새 시리즈' : '새 단편');
  const parent = path.join(ws(), input.kind === 'series' ? WS_DIRS.series : WS_DIRS.short);
  const dir = uniquePath(parent, safeName(title));
  fs.mkdirSync(dir, { recursive: true });
  const meta: ProductionMeta = {
    version: 1,
    id: randomUUID(),
    kind: input.kind,
    title,
    createdAt: now,
    updatedAt: now,
    format: input.format,
    budgetUsd: input.budgetUsd,
  };
  if (input.kind === 'short') {
    meta.stages = emptyStages();
    makeStageDirs(dir);
    const file = path.join(dir, PROD_FILE);
    writeJson(file, meta);
    return { dir, file, meta };
  }
  fs.mkdirSync(path.join(dir, SERIES_DIRS.bible), { recursive: true });
  fs.mkdirSync(path.join(dir, SERIES_DIRS.arc), { recursive: true });
  const file = path.join(dir, SERIES_FILE);
  writeJson(file, meta);
  const ep = addEpisode(dir);
  return { dir, file, meta: readJson<ProductionMeta>(file), episodes: [ep] };
}

function readEpisodes(seriesDir: string): EpisodeInfo[] {
  const out: EpisodeInfo[] = [];
  for (const d of fs.readdirSync(seriesDir, { withFileTypes: true })) {
    if (!d.isDirectory() || !/^EP\d+$/i.test(d.name)) continue;
    const file = path.join(seriesDir, d.name, EPISODE_FILE);
    try {
      out.push({ dir: path.dirname(file), file, meta: readJson<EpisodeMeta>(file) });
    } catch {
      /* 손상된 화는 건너뜀 */
    }
  }
  return out.sort((a, b) => a.meta.no - b.meta.no);
}

export function addEpisode(seriesDir: string): EpisodeInfo {
  assertInWorkspace(seriesDir);
  const series = readJson<ProductionMeta>(path.join(seriesDir, SERIES_FILE));
  const eps = readEpisodes(seriesDir);
  const no = eps.reduce((m, e) => Math.max(m, e.meta.no), 0) + 1;
  const dir = path.join(seriesDir, episodeDirName(no));
  makeStageDirs(dir);
  const now = Date.now();
  const meta: EpisodeMeta = {
    version: 1,
    id: randomUUID(),
    no,
    title: `${no}화`,
    createdAt: now,
    updatedAt: now,
    budgetUsd: series.budgetUsd,
    stages: emptyStages(),
  };
  const file = path.join(dir, EPISODE_FILE);
  writeJson(file, meta);
  touch(path.join(seriesDir, SERIES_FILE));
  return { dir, file, meta };
}

function touch(metaFile: string) {
  try {
    const m = readJson<{ updatedAt: number }>(metaFile);
    m.updatedAt = Date.now();
    writeJson(metaFile, m);
  } catch {
    /* ignore */
  }
}

function readProduction(dir: string, kind: 'short' | 'series'): ProductionInfo | null {
  const file = path.join(dir, kind === 'series' ? SERIES_FILE : PROD_FILE);
  try {
    const meta = readJson<ProductionMeta>(file);
    if (kind === 'series') {
      const episodes = readEpisodes(dir);
      const latest = episodes.reduce((m, e) => Math.max(m, e.meta.updatedAt), meta.updatedAt);
      return { dir, file, meta: { ...meta, updatedAt: latest }, episodes };
    }
    return { dir, file, meta };
  } catch {
    return null;
  }
}

export function listProductions(): ProductionInfo[] {
  const out: ProductionInfo[] = [];
  for (const kind of ['short', 'series'] as const) {
    const parent = path.join(ws(), kind === 'series' ? WS_DIRS.series : WS_DIRS.short);
    if (!fs.existsSync(parent)) continue;
    for (const d of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const info = readProduction(path.join(parent, d.name), kind);
      if (info) out.push(info);
    }
  }
  return out.sort((a, b) => b.meta.updatedAt - a.meta.updatedAt);
}

export function getProduction(dir: string): ProductionInfo | null {
  assertInWorkspace(dir);
  if (fs.existsSync(path.join(dir, SERIES_FILE))) return readProduction(dir, 'series');
  return readProduction(dir, 'short');
}

/** 작품(또는 화) 메타 일부 수정: 제목, 예산, 단계 상태 */
export function updateMeta(file: string, patch: { title?: string; budgetUsd?: number | null; stage?: { id: StageId; state: StageState } }) {
  assertInWorkspace(file);
  const m = readJson<ProductionMeta & EpisodeMeta>(file);
  if (patch.title !== undefined) m.title = patch.title.trim() || m.title;
  if (patch.budgetUsd !== undefined) m.budgetUsd = patch.budgetUsd;
  if (patch.stage) m.stages = { ...(m.stages || emptyStages()), [patch.stage.id]: { ...patch.stage.state, updatedAt: Date.now() } };
  m.updatedAt = Date.now();
  writeJson(file, m);
  return m;
}

/** 단계 산출물 읽기/쓰기 (예: 01_story/story.json) */
export function readStageFile(unitDir: string, stage: StageId, name: string): unknown | null {
  assertInWorkspace(unitDir);
  const def = STAGES.find((s) => s.id === stage)!;
  const f = path.join(unitDir, def.dir, path.basename(name));
  return fs.existsSync(f) ? readJson(f) : null;
}

export function writeStageFile(unitDir: string, stage: StageId, name: string, data: unknown) {
  assertInWorkspace(unitDir);
  const def = STAGES.find((s) => s.id === stage)!;
  writeJson(path.join(unitDir, def.dir, path.basename(name)), data);
}

// ---------- 시리즈: 이전 화 요약 · 미회수 복선 ----------
interface StoryDocLite {
  basic?: { title?: string };
  structure?: { summary?: string };
  links?: { foreshadowing?: { clue: string; plantAt: string; payoffAt: string; resolved: boolean }[] };
}

function readStory(epDir: string): StoryDocLite | null {
  const f = path.join(epDir, '01_story', 'story.json');
  try {
    return fs.existsSync(f) ? readJson<StoryDocLite>(f) : null;
  } catch {
    return null;
  }
}

/** uptoNo 화 이전의 확정 스토리 요약과 아직 회수하지 않은 복선 */
export function seriesContext(seriesDir: string, uptoNo: number) {
  assertInWorkspace(seriesDir);
  const series = readJson<ProductionMeta>(path.join(seriesDir, SERIES_FILE));
  const episodes: { no: number; title: string; summary: string }[] = [];
  const open: { clue: string; plantAt: string; payoffAt: string; resolved: boolean; episode: number }[] = [];
  for (const e of readEpisodes(seriesDir)) {
    if (e.meta.no >= uptoNo) continue;
    const s = readStory(e.dir);
    if (!s) continue;
    episodes.push({ no: e.meta.no, title: s.basic?.title || e.meta.title, summary: s.structure?.summary || '' });
    for (const f of s.links?.foreshadowing || []) if (!f.resolved) open.push({ ...f, episode: e.meta.no });
  }
  return { seriesTitle: series.title, episodes, openForeshadowing: open };
}

/** 시리즈 줄거리·복선 모음(story_arc/arc.json)을 화별 확정 스토리로 다시 만듦 */
export function rebuildArc(seriesDir: string) {
  assertInWorkspace(seriesDir);
  const eps = readEpisodes(seriesDir).map((e) => {
    const s = readStory(e.dir);
    return {
      no: e.meta.no,
      title: s?.basic?.title || e.meta.title,
      confirmed: !!s,
      summary: s?.structure?.summary || '',
      foreshadowing: s?.links?.foreshadowing || [],
    };
  });
  writeJson(path.join(seriesDir, SERIES_DIRS.arc, 'arc.json'), { updatedAt: Date.now(), episodes: eps });
}

// ---------- S1 입력 자료: 텍스트 파일 가져오기 ----------
const TEXT_EXT = /\.(txt|md|csv|tsv|json|srt|vtt|html?)$/i;

export function importInputFiles(unitDir: string, files: string[]) {
  assertInWorkspace(unitDir);
  const dir = path.join(unitDir, '01_story', 'inputs');
  fs.mkdirSync(dir, { recursive: true });
  const out: { name: string; text: string; skipped?: string }[] = [];
  for (const f of files) {
    const name = path.basename(f);
    if (!TEXT_EXT.test(name)) {
      out.push({ name, text: '', skipped: '텍스트 파일(txt·md·csv·json·srt 등)만 넣을 수 있습니다' });
      continue;
    }
    const st = fs.statSync(f);
    if (st.size > 2 * 1024 * 1024) {
      out.push({ name, text: '', skipped: '2MB보다 큰 파일은 넣을 수 없습니다' });
      continue;
    }
    const text = fs.readFileSync(f, 'utf8');
    const dst = uniquePath(dir, path.basename(name, path.extname(name)), path.extname(name));
    fs.copyFileSync(f, dst);
    out.push({ name: path.basename(dst), text });
  }
  return out;
}

export async function trashProduction(dir: string) {
  assertInWorkspace(dir);
  const isProd = fs.existsSync(path.join(dir, PROD_FILE)) || fs.existsSync(path.join(dir, SERIES_FILE));
  if (!isProd) throw new Error('작품 폴더가 아닙니다');
  await shell.trashItem(dir);
}
