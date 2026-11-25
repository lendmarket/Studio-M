import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { Icon } from './Icons';
import {
  AiSettings, CodexStatus, DEFAULT_AI, PRICE_UNIT_LABEL, SecretName, SecretStatus, TestResult, TEXT_PROVIDER_LABEL, withAiDefaults,
} from '../core/ai';

const MODEL_ROWS: { key: keyof AiSettings['models']; label: string; hint: string }[] = [
  { key: 'codex', label: 'ChatGPT 구독', hint: 'Codex 모델 이름 · 비우면 Codex 기본 모델' },
  { key: 'openai', label: 'OpenAI API', hint: 'API 키 방식일 때 텍스트 모델' },
  { key: 'text', label: 'Gemini 텍스트', hint: 'Gemini를 텍스트 AI로 쓸 때' },
  { key: 'image', label: '이미지', hint: '기준 시트 · 씬 마스터 · 컷 시작 이미지' },
  { key: 'video', label: '영상', hint: '컷 영상 (Veo · Omni)' },
  { key: 'tts', label: '음성', hint: 'Gemini TTS (타입캐스트는 인물별로 지정)' },
];

export default function AiSettingsCards() {
  const s = useStore((x) => x.settings);
  const [st, setSt] = useState<SecretStatus | null>(null);
  const [models, setModels] = useState<string[]>([]);
  useEffect(() => {
    api.aiStatus().then(setSt);
  }, []);
  if (!s) return null;
  const ai = withAiDefaults(s.ai);
  const saveAi = async (patch: Partial<AiSettings>) => useStore.getState().set({ settings: await api.wsSaveSettings({ ai: { ...ai, ...patch } }) });

  return (
    <>
      <div className="set-card">
        <h3>AI 연동</h3>
        <p className="muted">
          키는 이 PC에만 Windows 암호화로 저장되고 화면에는 저장 여부만 표시됩니다. 연결 테스트는 생성 요청이 아니라 요금이 나가지 않는 확인 요청만 보냅니다.
        </p>
        {st && !st.encryption && <div className="notice warn">이 PC에서 암호화 저장을 쓸 수 없어 키를 저장할 수 없습니다.</div>}

        <div className="key-row">
          <span className="key-label">텍스트 AI</span>
          <div className="seg">
            {(['chatgpt', 'gemini'] as const).map((m) => (
              <button key={m} className={ai.textProvider === m ? 'on' : ''} onClick={() => saveAi({ textProvider: m })}>
                {TEXT_PROVIDER_LABEL[m]}
              </button>
            ))}
          </div>
          <small className="muted">스토리 대화 · 바이블 추출 · 프롬프트 생성 · 검수에 씁니다</small>
        </div>

        <div className="ai-block">
          <div className="ai-head">
            <b>ChatGPT {ai.textProvider === 'chatgpt' && <span className="key-state ok">사용 중</span>}</b>
            <div className="seg">
              {(['codex', 'api'] as const).map((m) => (
                <button key={m} className={ai.chatgptMode === m ? 'on' : ''} onClick={() => saveAi({ chatgptMode: m })}>
                  {m === 'codex' ? '구독 (Codex 로그인)' : 'OpenAI API 키'}
                </button>
              ))}
            </div>
          </div>
          {ai.chatgptMode === 'codex' ? (
            <CodexRow />
          ) : (
            <KeyRow
              name="openai"
              label="OpenAI API 키"
              set={!!st?.openai}
              placeholder="platform.openai.com에서 만든 API 키"
              onStatus={setSt}
              onTest={(r) => r.models && setModels(r.models)}
              help="ChatGPT 구독과 별도로, 쓴 만큼 청구됩니다"
            />
          )}
        </div>

        <div className="ai-block">
          <div className="ai-head">
            <b>Google (Gemini · 나노바나나 · Veo · Gemini TTS)</b>
            <div className="seg">
              {(['gemini', 'vertex'] as const).map((m) => (
                <button key={m} className={ai.googleAuth === m ? 'on' : ''} onClick={() => saveAi({ googleAuth: m })}>
                  {m === 'gemini' ? 'Gemini API 키' : 'Vertex (서비스 계정)'}
                </button>
              ))}
            </div>
          </div>
          {ai.googleAuth === 'gemini' ? (
            <KeyRow
              name="gemini"
              label="Gemini API 키"
              set={!!st?.gemini}
              placeholder="Google AI Studio에서 만든 API 키"
              onStatus={setSt}
              onTest={(r) => r.models && setModels(r.models)}
              help="aistudio.google.com → Get API key"
            />
          ) : (
            <>
              <div className="key-row">
                <span className="key-label">서비스 계정 키</span>
                <span className={'key-state' + (st?.vertex.set ? ' ok' : '')}>{st?.vertex.set ? `저장됨 · ${st.vertex.clientEmail || ''}` : '없음'}</span>
                <button
                  className="btn ghost sm"
                  onClick={async () => {
                    try {
                      const r = await api.aiPickVertexKey();
                      if (r) {
                        setSt(r);
                        useStore.getState().set({ settings: await api.wsSettings() });
                        useStore.getState().showToast('서비스 계정 키를 저장했습니다');
                      }
                    } catch (e) {
                      useStore.getState().showToast(String((e as Error).message || e));
                    }
                  }}
                >
                  키 파일(JSON) 선택
                </button>
                {st?.vertex.set && <ClearBtn name="vertex" onStatus={setSt} />}
                <TestBtn name="vertex" />
              </div>
              <div className="key-row">
                <span className="key-label">프로젝트 ID</span>
                <input className="text-input" defaultValue={ai.vertexProject} key={ai.vertexProject} onBlur={(e) => saveAi({ vertexProject: e.target.value.trim() })} />
                <span className="key-label">리전</span>
                <input className="text-input short" defaultValue={ai.vertexLocation} onBlur={(e) => saveAi({ vertexLocation: e.target.value.trim() || 'us-central1' })} />
              </div>
            </>
          )}
        </div>

        <div className="ai-block">
          <div className="ai-head">
            <b>타입캐스트 (대사·내레이션)</b>
          </div>
          <KeyRow name="typecast" label="API 키" set={!!st?.typecast} placeholder="타입캐스트 API 키" onStatus={setSt} help="연결 확인은 음성 생성(F단계)에서 추가됩니다" />
        </div>

        <div className="ai-block dim">
          <div className="ai-head">
            <b>Fish Audio</b>
            <small className="muted">나중에 연동할 수 있도록 자리만 둡니다</small>
          </div>
          <KeyRow name="fish" label="API 키" set={!!st?.fish} placeholder="Fish Audio API 키" onStatus={setSt} />
        </div>
      </div>

      <div className="set-card">
        <h3>단계별 모델</h3>
        <p className="muted">모델 이름은 자주 바뀝니다. Gemini 「연결 테스트」를 누르면 쓸 수 있는 모델 목록이 아래 입력칸 추천으로 나타납니다.</p>
        <datalist id="ai-models">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {MODEL_ROWS.map((r) => (
          <div key={r.key} className="key-row">
            <span className="key-label">{r.label}</span>
            <input
              className="text-input"
              list="ai-models"
              placeholder={r.key === 'codex' ? 'Codex 기본 모델' : ''}
              defaultValue={ai.models[r.key]}
              key={ai.models[r.key]}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === ai.models[r.key] || (!v && r.key !== 'codex')) return;
                saveAi({ models: { ...ai.models, [r.key]: v } });
              }}
            />
            <small className="muted">{r.hint}</small>
          </div>
        ))}
      </div>

      <div className="set-card">
        <h3>비용</h3>
        <p className="muted">일괄 생성 전에 이 단가로 예상 비용을 계산합니다. 단가는 참고값이니 Google·타입캐스트 요금 페이지에서 확인해 고치세요. 비워 두면 계산에서 빠집니다.</p>
        <div className="key-row">
          <span className="key-label">새 작품 기본 예산</span>
          <input
            className="text-input num"
            type="number"
            min={0}
            placeholder="한도 없음"
            defaultValue={ai.defaultBudgetUsd ?? ''}
            onBlur={(e) => saveAi({ defaultBudgetUsd: e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value)) })}
          />
          <small className="muted">USD · 작품(시리즈는 화)마다</small>
        </div>
        <table className="price-table">
          <thead>
            <tr>
              <th>항목</th>
              <th>단위</th>
              <th>단가 (USD)</th>
            </tr>
          </thead>
          <tbody>
            {ai.prices.map((p, i) => (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td className="muted">{PRICE_UNIT_LABEL[p.unit]}</td>
                <td>
                  <input
                    className="text-input num"
                    type="number"
                    min={0}
                    step="0.001"
                    placeholder="모름"
                    defaultValue={p.usd ?? ''}
                    key={`${p.id}-${p.usd}`}
                    onBlur={(e) => {
                      const v = e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value));
                      if (v === p.usd) return;
                      const prices = ai.prices.map((x, j) => (j === i ? { ...x, usd: v } : x));
                      saveAi({ prices });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="set-row">
          <button className="btn ghost sm" onClick={() => saveAi({ prices: DEFAULT_AI.prices })}>
            단가 기본값으로
          </button>
        </div>
      </div>
    </>
  );
}

function KeyRow({
  name, label, set, placeholder, onStatus, onTest, help,
}: {
  name: SecretName;
  label: string;
  set: boolean;
  placeholder: string;
  onStatus: (s: SecretStatus) => void;
  onTest?: (r: TestResult) => void;
  help?: string;
}) {
  const [v, setV] = useState('');
  const save = async () => {
    try {
      onStatus(await api.aiSetSecret(name, v));
      setV('');
      useStore.getState().showToast(`${label}를 저장했습니다`);
    } catch (e) {
      useStore.getState().showToast(String((e as Error).message || e));
    }
  };
  return (
    <div className="key-row">
      <span className="key-label">{label}</span>
      <span className={'key-state' + (set ? ' ok' : '')}>{set ? '저장됨' : '없음'}</span>
      <input
        className="text-input"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={set ? '새 키로 바꾸려면 입력' : placeholder}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && v.trim() && save()}
      />
      <button className="btn primary sm" disabled={!v.trim()} onClick={save}>
        저장
      </button>
      {set && <ClearBtn name={name} onStatus={onStatus} />}
      {set && <TestBtn name={name} onResult={onTest} />}
      {help && <small className="muted key-help">{help}</small>}
    </div>
  );
}

function CodexRow() {
  const [cs, setCs] = useState<CodexStatus | null>(null);
  const [busy, setBusy] = useState('');
  const check = async () => {
    setBusy('확인 중...');
    setCs(await api.codexStatus());
    setBusy('');
  };
  useEffect(() => {
    check();
  }, []);
  return (
    <div className="key-row">
      <span className="key-label">ChatGPT 구독</span>
      <span className={'key-state' + (cs?.loggedIn ? ' ok' : '')}>
        {busy || (!cs ? '…' : cs.loggedIn ? `로그인됨${cs.version ? ` · Codex ${cs.version}` : ''}` : cs.installed ? '로그인 필요' : 'Codex 미설치')}
      </span>
      {cs?.installed && !cs.loggedIn && (
        <button
          className="btn primary sm"
          disabled={!!busy}
          onClick={async () => {
            setBusy('브라우저에서 로그인하세요...');
            const r = await api.codexLogin();
            if (!r.ok) useStore.getState().showToast('로그인하지 못했습니다: ' + r.message);
            await check();
          }}
        >
          ChatGPT로 로그인
        </button>
      )}
      <button className="btn ghost sm" disabled={!!busy} onClick={check}>
        다시 확인
      </button>
      <small className="muted key-help">
        {cs && !cs.installed
          ? 'PC에 Codex CLI를 설치해야 합니다: 터미널에서 npm i -g @openai/codex 실행 후 「다시 확인」'
          : '지금 쓰는 ChatGPT Plus·Pro 구독 안에서 추가 요금 없이 씁니다 (구독 사용 한도 적용)'}
      </small>
    </div>
  );
}

function ClearBtn({ name, onStatus }: { name: SecretName; onStatus: (s: SecretStatus) => void }) {
  return (
    <button
      className="btn ghost sm"
      onClick={async () => {
        const r = await api.confirm('저장된 키를 지울까요?', ['지우기', '취소']);
        if (r === 0) onStatus(await api.aiClearSecret(name));
      }}
    >
      삭제
    </button>
  );
}

function TestBtn({ name, onResult }: { name: SecretName; onResult?: (r: TestResult) => void }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<TestResult | null>(null);
  return (
    <>
      <button
        className="btn ghost sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await api.aiTest(name);
          setRes(r);
          onResult?.(r);
          setBusy(false);
        }}
      >
        <Icon name="check" size={13} /> {busy ? '확인 중...' : '연결 테스트'}
      </button>
      {res && <span className={'test-res' + (res.ok ? ' ok' : ' bad')}>{res.message}</span>}
    </>
  );
}
