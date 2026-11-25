import { app, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { AiSettings, withAiDefaults } from '../src/core/ai';

export interface Settings {
  workspace: string;
  copyMedia: boolean;
  limits: Record<string, number | null>;
  /** AI 연동 설정 (키 제외 — 키는 ai.ts에서 암호화 저장) */
  ai: AiSettings;
}

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

/** Google Drive 데스크톱 앱의 '내 드라이브' 폴더 찾기 */
export function detectGoogleDrive(): string | null {
  const names = ['내 드라이브', 'My Drive'];
  if (process.platform === 'win32') {
    for (const L of 'GHIJKLMNOPQRSTUVWXYZDEF') {
      for (const n of names) {
        const p = `${L}:\\${n}`;
        try {
          if (fs.existsSync(p)) return p;
        } catch {
          /* ignore */
        }
      }
    }
  }
  const home = app.getPath('home');
  for (const p of [path.join(home, 'Google Drive', '내 드라이브'), path.join(home, 'Google Drive', 'My Drive'), path.join(home, 'Google Drive')]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function defaultWorkspace() {
  const g = detectGoogleDrive();
  return path.join(g || app.getPath('documents'), 'Studio M');
}

let cached: Settings | null = null;
export function getSettings(): Settings {
  if (cached) return cached;
  let s: Partial<Settings> = {};
  try {
    s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    /* 첫 실행 */
  }
  cached = { workspace: s.workspace || defaultWorkspace(), copyMedia: s.copyMedia ?? true, limits: s.limits || {}, ai: withAiDefaults(s.ai) };
  if (!s.workspace) saveSettings(cached);
  return cached;
}

export function saveSettings(patch: Partial<Settings>) {
  const cur = getSettings();
  cached = { ...cur, ...patch, ai: patch.ai ? withAiDefaults({ ...cur.ai, ...patch.ai }) : cur.ai };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(cached, null, 2));
  return cached;
}

export function isOnGoogleDrive(p: string) {
  const g = detectGoogleDrive();
  return !!g && path.resolve(p).toLowerCase().startsWith(path.resolve(g).toLowerCase());
}

export const safeName = (n: string) => n.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+$/, '').slice(0, 80) || '프로젝트';

export function uniquePath(dir: string, base: string, ext = '') {
  let p = path.join(dir, base + ext);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}

/** 새 프로젝트 폴더 만들기 → .smproj 경로 반환 */
export function createProjectFolder(name: string) {
  const ws = getSettings().workspace;
  fs.mkdirSync(ws, { recursive: true });
  const dir = uniquePath(ws, safeName(name));
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'exports'), { recursive: true });
  return path.join(dir, path.basename(dir) + '.smproj');
}

/** 미디어를 프로젝트 media 폴더로 복사 (이미 안에 있으면 그대로) */
export async function copyMedia(projectFile: string, src: string) {
  const mediaDir = path.join(path.dirname(projectFile), 'media');
  if (path.resolve(path.dirname(src)).toLowerCase() === path.resolve(mediaDir).toLowerCase()) return src;
  fs.mkdirSync(mediaDir, { recursive: true });
  const ext = path.extname(src);
  const base = path.basename(src, ext);
  // 같은 파일(이름+크기)이 이미 있으면 재사용
  const same = path.join(mediaDir, base + ext);
  try {
    if (fs.existsSync(same) && fs.statSync(same).size === fs.statSync(src).size) return same;
  } catch {
    /* ignore */
  }
  const dst = uniquePath(mediaDir, base, ext);
  await fs.promises.copyFile(src, dst);
  return dst;
}

export interface ProjectInfo {
  file: string;
  dir: string;
  name: string;
  platform: string;
  width: number;
  height: number;
  duration: number;
  clips: number;
  updatedAt: number;
  createdAt: number;
  thumb: string | null;
}

export interface ExportInfo {
  file: string;
  name: string;
  project: string;
  size: number;
  createdAt: number;
}

function* projectFiles(ws: string) {
  if (!fs.existsSync(ws)) return;
  for (const d of fs.readdirSync(ws, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = path.join(ws, d.name);
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.smproj'));
    } catch {
      continue;
    }
    for (const f of files) yield path.join(dir, f);
  }
}

export function listProjects(): ProjectInfo[] {
  const out: ProjectInfo[] = [];
  for (const file of projectFiles(getSettings().workspace)) {
    try {
      const st = fs.statSync(file);
      const p = JSON.parse(fs.readFileSync(file, 'utf8'));
      const dir = path.dirname(file);
      const thumb = path.join(dir, 'thumb.jpg');
      const duration = (p.clips || []).reduce((m: number, c: any) => Math.max(m, c.start + c.duration), 0);
      out.push({
        file, dir, name: p.name || path.basename(file, '.smproj'), platform: p.platform || 'custom',
        width: p.width, height: p.height, duration, clips: (p.clips || []).length,
        updatedAt: st.mtimeMs, createdAt: p.createdAt || st.birthtimeMs || st.mtimeMs,
        thumb: fs.existsSync(thumb) ? thumb : null,
      });
    } catch {
      /* 손상된 파일은 건너뜀 */
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function listExports(): ExportInfo[] {
  const out: ExportInfo[] = [];
  for (const file of projectFiles(getSettings().workspace)) {
    const ex = path.join(path.dirname(file), 'exports');
    try {
      for (const f of fs.readdirSync(ex)) {
        if (!/\.(mp4|mov|webm)$/i.test(f)) continue;
        const fp = path.join(ex, f);
        const st = fs.statSync(fp);
        out.push({ file: fp, name: f, project: path.basename(path.dirname(file)), size: st.size, createdAt: st.mtimeMs });
      }
    } catch {
      /* 없음 */
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function trashProject(file: string) {
  const dir = path.dirname(file);
  const ws = path.resolve(getSettings().workspace).toLowerCase();
  // 작업 폴더 안의 프로젝트 폴더만 삭제(휴지통)
  if (!path.resolve(dir).toLowerCase().startsWith(ws + path.sep.toLowerCase())) throw new Error('작업 폴더 밖의 프로젝트는 삭제할 수 없습니다');
  await shell.trashItem(dir);
}

export function writeDataUrl(file: string, dataUrl: string) {
  const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}
