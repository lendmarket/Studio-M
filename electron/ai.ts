// AI 키 보관(Windows 암호화)과 연결 테스트. 키 값은 화면(렌더러)으로 보내지 않습니다.
import { app, safeStorage } from 'electron';
import { createSign } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { SecretName, SecretStatus, TestResult } from '../src/core/ai';
import { getSettings } from './workspace';
import { withAiDefaults } from '../src/core/ai';

const secretsFile = () => path.join(app.getPath('userData'), 'secrets.json');

type Store = Partial<Record<SecretName, string>>; // base64(암호문)

function readStore(): Store {
  try {
    return JSON.parse(fs.readFileSync(secretsFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(s: Store) {
  fs.mkdirSync(path.dirname(secretsFile()), { recursive: true });
  fs.writeFileSync(secretsFile(), JSON.stringify(s, null, 2), { encoding: 'utf8', mode: 0o600 });
}

/** 메인 프로세스 안에서만 쓰는 복호화 */
export function getSecret(name: SecretName): string | null {
  const v = readStore()[name];
  if (!v || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(v, 'base64'));
  } catch {
    return null;
  }
}

export function setSecret(name: SecretName, value: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('이 PC에서 암호화 저장을 쓸 수 없어 키를 저장하지 않았습니다');
  const v = value.trim();
  if (!v) throw new Error('값이 비어 있습니다');
  if (name === 'vertex') parseServiceAccount(v); // 형식 확인
  const s = readStore();
  s[name] = safeStorage.encryptString(v).toString('base64');
  writeStore(s);
}

export function clearSecret(name: SecretName) {
  const s = readStore();
  delete s[name];
  writeStore(s);
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function parseServiceAccount(json: string): ServiceAccount {
  let o: any;
  try {
    o = JSON.parse(json);
  } catch {
    throw new Error('서비스 계정 키(JSON) 형식이 아닙니다');
  }
  if (o?.type !== 'service_account' || !o.client_email || !o.private_key || !o.project_id) {
    throw new Error('서비스 계정 키(JSON)에 필요한 항목이 없습니다 (type, client_email, private_key, project_id)');
  }
  return o;
}

export function secretStatus(): SecretStatus {
  const s = readStore();
  let vertex: SecretStatus['vertex'] = { set: !!s.vertex };
  if (s.vertex) {
    const raw = getSecret('vertex');
    if (raw) {
      try {
        const sa = parseServiceAccount(raw);
        vertex = { set: true, clientEmail: sa.client_email, projectId: sa.project_id };
      } catch {
        /* 손상 */
      }
    }
  }
  return {
    encryption: safeStorage.isEncryptionAvailable(),
    gemini: !!s.gemini,
    openai: !!s.openai,
    vertex,
    typecast: !!s.typecast,
    fish: !!s.fish,
  };
}

/** Vertex용 액세스 토큰 (서비스 계정 JWT) */
export async function vertexAccessToken(): Promise<string> {
  const raw = getSecret('vertex');
  if (!raw) throw new Error('Vertex 서비스 계정 키가 없습니다');
  const sa = parseServiceAccount(raw);
  const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64(sig)}` }),
    signal: AbortSignal.timeout(20000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(j.error_description || j.error || `토큰 발급 실패 (${res.status})`);
  return j.access_token;
}

/** 연결 테스트 — 생성 요청이 아니라 요금이 나가지 않는 확인 요청만 보냅니다 */
export async function testConnection(name: SecretName): Promise<TestResult> {
  try {
    if (name === 'gemini') {
      const key = getSecret('gemini');
      if (!key) return { ok: false, message: 'Gemini API 키가 없습니다' };
      const models: string[] = [];
      let pageToken = '';
      for (let i = 0; i < 5; i++) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const res = await fetch(url, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(20000) });
        const j: any = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, message: j?.error?.message || `연결 실패 (${res.status})` };
        for (const m of j.models || []) models.push(String(m.name || '').replace(/^models\//, ''));
        pageToken = j.nextPageToken || '';
        if (!pageToken) break;
      }
      return { ok: true, message: `연결됨 · 쓸 수 있는 모델 ${models.length}개`, models: models.sort() };
    }
    if (name === 'openai') {
      const key = getSecret('openai');
      if (!key) return { ok: false, message: 'OpenAI API 키가 없습니다' };
      const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: j?.error?.message || `연결 실패 (${res.status})` };
      const models = (j.data || []).map((m: any) => String(m.id)).filter((id: string) => /^(gpt|o\d|chatgpt)/i.test(id)).sort();
      return { ok: true, message: `연결됨 · 텍스트 모델 ${models.length}개`, models };
    }
    if (name === 'vertex') {
      await vertexAccessToken();
      const ai = withAiDefaults(getSettings().ai);
      return { ok: true, message: `토큰 발급 성공 · 프로젝트 ${ai.vertexProject || '(미지정)'} · 리전 ${ai.vertexLocation}` };
    }
    if (name === 'typecast') {
      return { ok: !!getSecret('typecast'), message: getSecret('typecast') ? '저장됨 (연결 확인은 음성 생성 단계에서 추가됩니다)' : '키가 없습니다' };
    }
    return { ok: !!getSecret(name), message: getSecret(name) ? '저장됨' : '키가 없습니다' };
  } catch (e) {
    return { ok: false, message: String((e as Error).message || e) };
  }
}
