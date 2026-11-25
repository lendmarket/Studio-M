// ChatGPT 구독 연결: PC에 설치된 Codex CLI(`codex`)를 불러 씁니다.
// 설치: npm i -g @openai/codex  /  로그인: codex login (ChatGPT 계정)
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { CodexStatus } from '../src/core/ai';

/** Electron을 바로가기로 켜면 PATH에 npm 전역 폴더가 없을 수 있어 직접 찾음 */
function codexCommand(): string {
  if (process.platform === 'win32') {
    const cands = [
      process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'codex.cmd'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'codex', 'codex.exe'),
    ].filter(Boolean) as string[];
    for (const c of cands) if (fs.existsSync(c)) return c;
    return 'codex.cmd';
  }
  return 'codex';
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], opts: { input?: string; cwd?: string; timeoutMs?: number } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const cmd = codexCommand();
    // .cmd 파일은 셸을 거쳐야 실행됨. 인자는 고정 문자열만 쓰고 프롬프트는 표준 입력으로 보냄
    const p = spawn(cmd.includes(' ') ? `"${cmd}"` : cmd, args, {
      cwd: opts.cwd || os.tmpdir(),
      shell: process.platform === 'win32',
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => p.kill(), opts.timeoutMs ?? 30000);
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(e.message) });
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
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
      const tail = (r.stderr || r.stdout).trim().split('\n').slice(-6).join('\n');
      throw new Error(`Codex 응답이 없습니다${r.code !== 0 ? ` (종료 코드 ${r.code})` : ''}\n${tail}`);
    }
    return { text };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
