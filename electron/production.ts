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

export async function trashProduction(dir: string) {
  assertInWorkspace(dir);
  const isProd = fs.existsSync(path.join(dir, PROD_FILE)) || fs.existsSync(path.join(dir, SERIES_FILE));
  if (!isProd) throw new Error('작품 폴더가 아닙니다');
  await shell.trashItem(dir);
}
