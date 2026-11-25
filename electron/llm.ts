// 텍스트 AI 호출 — ChatGPT(구독 Codex / OpenAI API) 또는 Gemini(API 키 / Vertex).
// 모든 사전 제작 단계가 이 함수 하나로 AI를 부릅니다.
import { extractJson, LlmRequest, LlmResult, withAiDefaults } from '../src/core/ai';
import { getSecret, vertexAccessToken } from './ai';
import { codexAsk } from './codex';
import { getSettings } from './workspace';

const JSON_RULE = '\n\n반드시 JSON 객체 하나만 출력하세요. 코드 블록이나 설명 문장을 앞뒤에 붙이지 마세요.';

/** Codex는 대화 형식이 없어 한 개의 프롬프트로 합침 */
function flatten(req: LlmRequest) {
  const parts = [`[지침]\n${req.system}${req.json ? JSON_RULE : ''}`];
  for (const m of req.messages) parts.push(`[${m.role === 'user' ? '사용자' : 'AI'}]\n${m.content}`);
  parts.push('[AI]');
  return parts.join('\n\n');
}

async function callOpenAI(req: LlmRequest, model: string) {
  const key = getSecret('openai');
  if (!key) throw new Error('OpenAI API 키가 없습니다 (설정 › AI 연동)');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: req.system + (req.json ? JSON_RULE : '') }, ...req.messages],
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `OpenAI 오류 (${res.status})`);
  return {
    text: String(j.choices?.[0]?.message?.content || ''),
    usage: j.usage ? { input: j.usage.prompt_tokens || 0, output: j.usage.completion_tokens || 0 } : undefined,
  };
}

async function callGemini(req: LlmRequest, model: string) {
  const ai = withAiDefaults(getSettings().ai);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: req.system + (req.json ? JSON_RULE : '') }] },
    contents: req.messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
    ...(req.json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
  });
  let url: string;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ai.googleAuth === 'vertex') {
    if (!ai.vertexProject) throw new Error('Vertex 프로젝트 ID가 없습니다 (설정 › AI 연동)');
    const loc = ai.vertexLocation || 'us-central1';
    const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
    url = `https://${host}/v1/projects/${encodeURIComponent(ai.vertexProject)}/locations/${loc}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
    headers.Authorization = `Bearer ${await vertexAccessToken()}`;
  } else {
    const key = getSecret('gemini');
    if (!key) throw new Error('Gemini API 키가 없습니다 (설정 › AI 연동)');
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    headers['x-goog-api-key'] = key;
  }
  const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(5 * 60 * 1000) });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Gemini 오류 (${res.status})`);
  const text = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  if (!text) throw new Error(`Gemini 응답이 비어 있습니다${j.candidates?.[0]?.finishReason ? ` (${j.candidates[0].finishReason})` : ''}`);
  return {
    text,
    usage: j.usageMetadata ? { input: j.usageMetadata.promptTokenCount || 0, output: j.usageMetadata.candidatesTokenCount || 0 } : undefined,
  };
}

export async function llmChat(req: LlmRequest): Promise<LlmResult> {
  const ai = withAiDefaults(getSettings().ai);
  const t0 = Date.now();
  let provider = '';
  let model = '';
  try {
    let out: { text: string; usage?: { input: number; output: number } };
    if (ai.textProvider === 'chatgpt' && ai.chatgptMode === 'codex') {
      provider = 'ChatGPT 구독 (Codex)';
      model = ai.models.codex || 'Codex 기본';
      out = await codexAsk(flatten(req), ai.models.codex);
    } else if (ai.textProvider === 'chatgpt') {
      provider = 'OpenAI API';
      model = ai.models.openai;
      out = await callOpenAI(req, model);
    } else {
      provider = ai.googleAuth === 'vertex' ? 'Gemini (Vertex)' : 'Gemini API';
      model = ai.models.text;
      out = await callGemini(req, model);
    }
    const result: LlmResult = { ok: true, text: out.text, provider, model, ms: Date.now() - t0, usage: out.usage };
    if (req.json) result.data = extractJson(out.text);
    return result;
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e), provider, model, ms: Date.now() - t0 };
  }
}
