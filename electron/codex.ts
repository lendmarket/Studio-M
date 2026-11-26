// ChatGPT 구독 연결: PC에 설치된 Codex CLI(`codex`)를 불러 씁니다.
// 설치: npm i -g @openai/codex  /  로그인: codex login (ChatGPT 계정)
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { CodexStatus } from '../src/core/ai';

/** Windows 사용자 PATH(레지스트리) — 앱이 업데이트 후 다시 켜질 때 환경 변수가 덜 넘어오는 경우 대비 */
function userPathDirs(): string[] {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', 'Path'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    const m = /Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i.exec(out);
    if (!m) return [];
    return m[1].split(';').map((d) => d.trim().replace(/%([^%]+)%/g, (_, v) => process.env[v] || `%${v}%`)).filter(Boolean);
  } catch {
    return [];
  }
}

/** npm 전역 폴더 후보 (APPDATA가 비어 있어도 홈 폴더로 찾음) */
function npmDirs(): string[] {
  const dirs = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    ...(process.env.PATH || process.env.Path || '').split(';'),
    ...userPathDirs(),
  ].filter((d): d is string => !!d && !!d.trim());
  return [...new Set(dirs.map((d) => path.normalize(d.trim())))];
}

type Launch = { file: string; pre: string[]; shell: boolean; env?: NodeJS.ProcessEnv };

/**
 * Codex 실행 방법을 찾음.
 * Windows: npm으로 설치된 codex.js를 Studio M(Electron)에 내장된 Node로 직접 실행 → 셸·PATH·Node 설치 여부와 무관.
 * 못 찾으면 codex.exe, 마지막으로 셸의 codex.cmd.
 */
function codexLaunch(): Launch {
  if (process.platform !== 'win32') return { file: 'codex', pre: [], shell: false };
  const dirs = npmDirs();
  for (const d of dirs) {
    const js = path.join(d, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (fs.existsSync(js)) return { file: process.execPath, pre: [js], shell: false, env: { ELECTRON_RUN_AS_NODE: '1' } };
  }
  const exes = [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'codex', 'codex.exe'), ...dirs.map((d) => path.join(d, 'codex.exe'))];
  for (const e of exes) if (e && fs.existsSync(e)) return { file: e, pre: [], shell: false };
  return { file: 'codex.cmd', pre: [], shell: true };
}

/** 출력 해석: UTF-8이 아니면(한글 Windows 오류 메시지) CP949로 읽음 */
function decode(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('euc-kr').decode(buf);
    } catch {
      return buf.toString('utf8');
    }
  }
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** codex.cmd는 node가 PATH에 있어야 실행됨 → Node 설치 폴더와 npm 전역 폴더를 PATH 앞에 붙임 */
function codexEnv() {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
  if (process.platform === 'win32') {
    const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path';
    const extra = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs'),
      process.env.APPDATA && path.join(process.env.APPDATA, 'npm'),
    ].filter((p): p is string => !!p && fs.existsSync(p));
    env[key] = [...extra, env[key] || ''].join(';');
  }
  return env;
}

function run(args: string[], opts: { input?: string; cwd?: string; timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const l = codexLaunch();
    // 셸을 거치는 마지막 대안에서도 인자는 고정 문자열만 쓰고 프롬프트는 표준 입력으로 보냄
    const p = spawn(l.file, [...l.pre, ...args], {
      cwd: opts.cwd || os.tmpdir(),
      shell: l.shell,
      windowsHide: true,
      env: { ...codexEnv(), ...l.env },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => p.kill(), opts.timeoutMs ?? 30000);
    p.stdout.on('data', (d: Buffer) => out.push(d));
    p.stderr.on('data', (d: Buffer) => err.push(d));
    p.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: decode(Buffer.concat(out)), stderr: decode(Buffer.concat(err)) + String(e.message) });
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: decode(Buffer.concat(out)), stderr: decode(Buffer.concat(err)) });
    });
    if (opts.input !== undefined) p.stdin.end(opts.input, 'utf8');
    else p.stdin.end();
  });
}

export async function codexStatus(): Promise<CodexStatus> {
  const v = await run(['--version'], { timeoutMs: 15000 });
  if (v.code !== 0) {
    return { installed: false, loggedIn: false, detail: 'Codex CLI가 설치되어 있지 않습니다 (npm i -g @openai/codex)' };
  }
  const version = v.stdout.trim().split(/\s+/).pop();
  const s = await run(['login', 'status'], { timeoutMs: 15000 });
  const out = (s.stdout + s.stderr).trim();
  const loggedIn = s.code === 0 && !/not logged in/i.test(out);
  return { installed: true, version, loggedIn, detail: loggedIn ? out.split('\n')[0] || '로그인됨' : '로그인이 필요합니다' };
}

/** 브라우저에서 ChatGPT 로그인 창을 엽니다 (사용자가 직접 로그인) */
export function codexLogin(): Promise<RunResult> {
  return run(['login'], { timeoutMs: 5 * 60 * 1000 });
}

/** 한 번의 질문-답변. 파일을 고치지 않도록 읽기 전용 샌드박스, 빈 임시 폴더에서 실행 */
export async function codexAsk(prompt: string, model: string): Promise<{ text: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-m-codex-'));
  const outFile = path.join(dir, 'answer.txt');
  const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--color', 'never', '--output-last-message', outFile];
  // 셸을 거치므로 모델 이름은 안전한 문자만 허용
  const m = model.trim();
  if (m) {
    if (!/^[\w.:-]+$/.test(m)) throw new Error('Codex 모델 이름에 쓸 수 없는 문자가 있습니다');
    args.push('--model', m);
  }
  args.push('-'); // 프롬프트는 표준 입력으로
  try {
    const r = await run(args, { input: prompt, cwd: dir, timeoutMs: 5 * 60 * 1000 });
    const text = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
    if (!text.trim()) {
      const all = r.stderr + '\n' + r.stdout;
      const limit = /usage limit[\s\S]*?try again at ([^\n.]+)/i.exec(all);
      if (limit || /usage limit/i.test(all)) {
        throw new Error(`ChatGPT 구독 사용 한도에 도달했습니다.${limit ? ` ${limit[1].trim()} 이후에 다시 쓸 수 있습니다.` : ''} 설정에서 OpenAI API 키나 Gemini로 바꿔 쓸 수 있습니다.`);
      }
      if (/not logged in|login/i.test(all) && !/Logged in/i.test(all)) throw new Error('ChatGPT 로그인이 필요합니다 (설정 › AI 연동 › ChatGPT로 로그인)');
      const tail = all.trim().split('\n').filter((l) => l.trim()).slice(-6).join('\n');
      throw new Error(`Codex 응답이 없습니다${r.code !== 0 ? ` (종료 코드 ${r.code})` : ''}\n${tail}`);
    }
    return { text };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
