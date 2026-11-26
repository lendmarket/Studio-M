// S1 스토리 개발 — 단계형(기획 → 로그라인 → 줄거리 → 구성 → 연출) + 단계 안 자유 대화
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { Icon } from './Icons';
import { ASPECTS, EpisodeInfo, ProductionInfo, STAGES, Stages } from '../core/production';
import {
  buildStoryDoc, buildSystemPrompt, ChatMsg, emptySession, normalizeStep, SeriesContext, STORY_STEPS, StoryDraft, StoryInput, StorySession,
  StoryStepId, SUGGEST_PROMPT,
} from '../core/story';
import { TEXT_PROVIDER_LABEL, withAiDefaults } from '../core/ai';

const SESSION = 'session.json';
const STORY = 'story.json';
const rid = () => Math.random().toString(36).slice(2, 10);

interface Props {
  info: ProductionInfo;
  ep?: EpisodeInfo;
  unitDir: string;
  unitFile: string;
  stages: Stages;
  reload: () => Promise<void>;
}

export default function StoryStage({ info, ep, unitDir, unitFile, stages, reload }: Props) {
  const [session, setSession] = useState<StorySession | null>(null);
  const [step, setStep] = useState<StoryStepId>('plan');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [series, setSeries] = useState<SeriesContext | null>(null);
  const settings = useStore((s) => s.settings);
  const ai = withAiDefaults(settings?.ai);
  const providerLabel = ai.textProvider === 'chatgpt' ? `ChatGPT ${ai.chatgptMode === 'codex' ? '구독' : 'API'}` : TEXT_PROVIDER_LABEL.gemini;
  const locked = stages.story?.status === 'confirmed';
  const saveTimer = useRef<number>();
  const chatEnd = useRef<HTMLDivElement>(null);

  // 불러오기
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = (await api.prodReadStage(unitDir, 'story', SESSION)) as StorySession | null;
      if (!alive) return;
      const init = s && s.steps ? s : emptySession(info.meta.format.lengthSec, info.meta.format.aspect);
      setSession(init);
      setStep(STORY_STEPS.find((x) => !init.steps[x.id]?.confirmed)?.id || 'direction');
      if (info.meta.kind === 'series' && ep) setSeries(await api.prodSeriesContext(info.dir, ep.meta.no));
      else setSeries(null);
    })();
    return () => {
      alive = false;
    };
  }, [unitDir]);

  useEffect(() => chatEnd.current?.scrollIntoView({ block: 'end' }), [session?.steps[step]?.messages.length, step]);

  /** 세션 수정 + 저장(0.6초 뒤) */
  const update = (fn: (s: StorySession) => void) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next: StorySession = JSON.parse(JSON.stringify(prev));
      fn(next);
      next.updatedAt = Date.now();
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        await api.prodWriteStage(unitDir, 'story', SESSION, next);
        if ((stages.story?.status || 'empty') === 'empty') {
          await api.prodUpdateMeta(unitFile, { stage: { id: 'story', state: { status: 'draft' } } });
          reload();
        }
      }, 600);
      return next;
    });
  };

  const send = async (content: string) => {
    if (!session || busy || !content.trim()) return;
    const userMsg: ChatMsg = { role: 'user', content: content.trim(), at: Date.now() };
    const history = [...session.steps[step].messages, userMsg].slice(-14);
    update((s) => s.steps[step].messages.push(userMsg));
    setText('');
    setBusy(true);
    const system = buildSystemPrompt(step, {
      kind: info.meta.kind,
      episodeNo: ep?.meta.no,
      draft: session.draft,
      steps: session.steps,
      inputs: session.inputs,
      series,
    });
    const messages = history
      .filter((m) => !m.error)
      .map((m) => ({
        role: m.role,
        content: m.role === 'assistant' ? JSON.stringify({ message: m.content, ...(m.options ? { options: m.options } : {}), ...(m.draft ? { draft: m.draft } : {}) }) : m.content,
      }));
    const r = await api.llmChat({ system, messages, json: true, purpose: `story:${step}` });
    let reply: ChatMsg;
    if (r.ok) {
      const d = (r.data || {}) as any;
      reply = {
        role: 'assistant',
        content: String(d.message || (d.options ? '안을 제안합니다.' : d.draft ? '이렇게 고쳐 봤습니다.' : '')),
        at: Date.now(),
        provider: `${r.provider} · ${r.model}`,
      };
      if (Array.isArray(d.options) && d.options.length) reply.options = d.options.map((o: unknown) => normalizeStep(step, o, session.draft));
      if (d.draft) reply.draft = normalizeStep(step, d.draft, session.draft);
    } else {
      reply = { role: 'assistant', content: r.error || 'AI 호출에 실패했습니다', at: Date.now(), error: true, provider: r.provider };
    }
    update((s) => s.steps[step].messages.push(reply));
    setBusy(false);
  };

  /** 빈 안(문자 없음, 목록 비어 있음)은 확정하지 못하게 */
  const hasContent = (v: unknown): boolean =>
    typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.some(hasContent) : v && typeof v === 'object' ? Object.values(v).some(hasContent) : false;

  /** 지금 오른쪽 「현재 안」과 같은 안이면 '적용됨'으로 표시 (나중에 다른 안을 고르면 다시 고를 수 있음) */
  const isCurrent = (value: unknown) => !!session && JSON.stringify(value) === JSON.stringify((session.draft as any)[step]);

  const applyValue = (value: unknown, msgAt: number) =>
    update((s) => {
      if (s.steps[step].confirmed) return; // 확정된 단계는 확정을 풀어야 바꿀 수 있음
      (s.draft as any)[step] = value;
      const m = s.steps[step].messages.find((x) => x.at === msgAt);
      if (m) m.applied = true;
    });

  const confirmStory = async () => {
    if (!session) return;
    const version = (stages.story?.version || 0) + 1;
    const doc = buildStoryDoc(session, version, providerLabel);
    await api.prodWriteStage(unitDir, 'story', STORY, doc);
    await api.prodWriteStage(unitDir, 'story', `story-v${version}.json`, doc);
    await api.prodWriteStage(unitDir, 'story', SESSION, session);
    await api.prodUpdateMeta(unitFile, { stage: { id: 'story', state: { status: 'confirmed', version } } });
    // 뒤 단계에서 이미 작업한 것이 있으면 '업데이트 필요'
    for (const s of STAGES) {
      if (s.id === 'story') continue;
      const st = stages[s.id]?.status;
      if (st === 'draft' || st === 'confirmed') await api.prodUpdateMeta(unitFile, { stage: { id: s.id, state: { ...stages[s.id], status: 'stale' } } });
    }
    if (info.meta.kind === 'series') await api.prodRebuildArc(info.dir);
    if (ep && session.draft.logline.title) await api.prodUpdateMeta(unitFile, { title: session.draft.logline.title });
    useStore.getState().showToast(`스토리를 확정했습니다 (v${version})`);
    reload();
  };

  if (!session) return <div className="muted pad">불러오는 중...</div>;
  const st = session.steps[step];
  const allConfirmed = STORY_STEPS.every((s) => session.steps[s.id].confirmed);
  const def = STORY_STEPS.find((s) => s.id === step)!;

  return (
    <div className="story">
      <div className="story-top">
        <div className="story-steps">
          {STORY_STEPS.map((s) => (
            <button key={s.id} className={'story-step' + (step === s.id ? ' on' : '') + (session.steps[s.id].confirmed ? ' done' : '')} onClick={() => setStep(s.id)}>
              {session.steps[s.id].confirmed && <Icon name="check" size={13} />}
              <b>{s.label}</b>
              <small>{s.desc}</small>
            </button>
          ))}
        </div>
        <div className="story-actions">
          {locked ? (
            <>
              <span className="status-chip confirmed">확정 v{stages.story?.version}</span>
              <button
                className="btn ghost sm"
                onClick={async () => {
                  await api.prodUpdateMeta(unitFile, { stage: { id: 'story', state: { ...stages.story, status: 'draft' } } });
                  reload();
                }}
              >
                새 버전으로 수정
              </button>
            </>
          ) : (
            <button className="btn primary" disabled={!allConfirmed} onClick={confirmStory} title={allConfirmed ? '' : '다섯 단계를 모두 확정하면 누를 수 있습니다'}>
              <Icon name="check" size={15} /> 스토리 확정
            </button>
          )}
        </div>
      </div>

      {locked && <div className="notice">확정된 스토리입니다. 고치려면 「새 버전으로 수정」을 누르세요. 확정하면 뒤 단계에 「업데이트 필요」가 표시됩니다.</div>}

      <div className="story-body">
        <section className="story-chat">
          <div className="chat-head">
            <span>
              <b>{def.label}</b> <small className="muted">{def.goal}</small>
            </span>
            <span className="muted small">{providerLabel}</span>
          </div>
          <div className="chat-list">
            {st.messages.length === 0 && (
              <div className="chat-empty">
                「AI 제안 받기」로 서로 다른 안 3개를 받거나, 아래에 원하는 방향을 자유롭게 적어 보세요.
                {series && series.episodes.length > 0 && <div className="muted small">이전 화 {series.episodes.length}개의 요약과 미회수 복선 {series.openForeshadowing.length}개가 함께 전달됩니다.</div>}
              </div>
            )}
            {st.messages.map((m) => (
              <div key={m.at} className={`msg ${m.role}` + (m.error ? ' err' : '')}>
                <div className="msg-text">{m.content}</div>
                {m.options?.map((o, i) => (
                  <div key={i} className="opt-card">
                    <div className="opt-title">안 {i + 1}</div>
                    <StepPreview step={step} value={o} />
                    {!locked && !st.confirmed && (
                      <button className="btn ghost sm" onClick={() => applyValue(o, m.at)} disabled={isCurrent(o)}>
                        {isCurrent(o) ? '적용됨' : '이 안으로'}
                      </button>
                    )}
                  </div>
                ))}
                {m.draft != null && (
                  <div className="opt-card">
                    <div className="opt-title">고친 안</div>
                    <StepPreview step={step} value={m.draft} />
                    {!locked && !st.confirmed && (
                      <button className="btn ghost sm" onClick={() => applyValue(m.draft, m.at)} disabled={isCurrent(m.draft)}>
                        {isCurrent(m.draft) ? '적용됨' : '적용'}
                      </button>
                    )}
                  </div>
                )}
                {m.provider && <small className="msg-meta">{m.provider}</small>}
              </div>
            ))}
            {busy && <div className="msg assistant busy">AI가 생각하는 중...</div>}
            <div ref={chatEnd} />
          </div>
          {!locked && (
            <div className="chat-input">
              <button className="btn ghost sm" disabled={busy || st.confirmed} onClick={() => send(SUGGEST_PROMPT)}>
                <Icon name="sparkle" size={13} /> AI 제안 받기
              </button>
              <textarea
                className="text-area"
                rows={2}
                placeholder={st.confirmed ? '확정된 단계입니다. 고치려면 오른쪽에서 확정을 풀어 주세요.' : '예: 반전을 더 세게, 타깃은 30대 직장인으로'}
                value={text}
                disabled={st.confirmed}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(text);
                  }
                }}
              />
              <button className="btn primary sm" disabled={busy || !text.trim() || st.confirmed} onClick={() => send(text)}>
                보내기
              </button>
            </div>
          )}
        </section>

        <section className="story-form">
          <div className="form-head">
            <b>현재 안</b>
            {!locked &&
              (st.confirmed ? (
                <button className="btn ghost sm" onClick={() => update((s) => (s.steps[step].confirmed = false))}>
                  확정 풀기
                </button>
              ) : (
                <button
                  className="btn primary sm"
                  disabled={!hasContent((session.draft as any)[step])}
                  title={hasContent((session.draft as any)[step]) ? '' : '내용을 채운 뒤 확정할 수 있습니다'}
                  onClick={() => {
                    update((s) => (s.steps[step].confirmed = true));
                    const next = STORY_STEPS.find((x) => x.id !== step && !session.steps[x.id].confirmed);
                    if (next) setStep(next.id);
                  }}
                >
                  <Icon name="check" size={13} /> 이 단계 확정
                </button>
              ))}
          </div>
          <fieldset disabled={locked || st.confirmed}>
            <StepForm step={step} draft={session.draft} onChange={(v) => update((s) => ((s.draft as any)[step] = v))} />
          </fieldset>
          {step === 'plan' && <InputsPanel inputs={session.inputs} unitDir={unitDir} disabled={locked} onChange={(inputs) => update((s) => (s.inputs = inputs))} />}
        </section>
      </div>
    </div>
  );
}

// ---------------- 단계별 입력 폼 ----------------
function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={'f-field' + (wide ? ' wide' : '')}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const T = ({ v, on, ph }: { v: string; on: (x: string) => void; ph?: string }) => <input className="text-input" value={v} placeholder={ph} onChange={(e) => on(e.target.value)} />;
const A = ({ v, on, rows = 3, ph }: { v: string; on: (x: string) => void; rows?: number; ph?: string }) => (
  <textarea className="text-area" rows={rows} value={v} placeholder={ph} onChange={(e) => on(e.target.value)} />
);
const Tags = ({ v, on, ph }: { v: string[]; on: (x: string[]) => void; ph?: string }) => {
  const [raw, setRaw] = useState(v.join(', '));
  useEffect(() => setRaw(v.join(', ')), [v.join('|')]);
  return (
    <input
      className="text-input"
      value={raw}
      placeholder={ph || '쉼표로 구분'}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => on(raw.split(',').map((x) => x.trim()).filter(Boolean))}
    />
  );
};

function StepForm({ step, draft, onChange }: { step: StoryStepId; draft: StoryDraft; onChange: (v: any) => void }) {
  const v: any = (draft as any)[step];
  const set = (k: string) => (x: unknown) => onChange({ ...v, [k]: x });
  if (step === 'plan')
    return (
      <div className="f-grid">
        <Field label="장르"><T v={v.genre} on={set('genre')} ph="예: 반전 숏드라마, 정보형" /></Field>
        <Field label="톤·분위기"><T v={v.tone} on={set('tone')} ph="예: 긴장감, 따뜻한" /></Field>
        <Field label="타깃 시청자"><T v={v.target} on={set('target')} ph="예: 30~40대 직장인" /></Field>
        <Field label="길이(초)">
          <input className="text-input" type="number" min={5} value={v.lengthSec} onChange={(e) => set('lengthSec')(parseInt(e.target.value || '0', 10))} />
        </Field>
        <Field label="화면비">
          <select className="text-input" value={v.aspect} onChange={(e) => set('aspect')(e.target.value)}>
            {ASPECTS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </Field>
        <Field label="기획 방향" wide><A v={v.concept} on={set('concept')} ph="어떤 이야기를, 왜, 어떤 느낌으로" /></Field>
      </div>
    );
  if (step === 'logline')
    return (
      <div className="f-grid">
        <Field label="제목" wide><T v={v.title} on={set('title')} /></Field>
        <Field label="로그라인" wide><A v={v.logline} on={set('logline')} rows={2} /></Field>
      </div>
    );
  if (step === 'synopsis')
    return (
      <div className="f-grid">
        <Field label="기" wide><A v={v.ki} on={set('ki')} /></Field>
        <Field label="승" wide><A v={v.seung} on={set('seung')} /></Field>
        <Field label="전" wide><A v={v.jeon} on={set('jeon')} /></Field>
        <Field label="결" wide><A v={v.gyeol} on={set('gyeol')} /></Field>
      </div>
    );
  if (step === 'structure')
    return (
      <div className="f-stack">
        <Field label="이 편 요약" wide><A v={v.summary} on={set('summary')} rows={2} /></Field>
        <ListEditor
          title="씬"
          items={v.scenes}
          onChange={(x) => set('scenes')(x.map((s: any, i: number) => ({ ...s, no: i + 1 })))}
          blank={{ no: 0, title: '', location: '', time: '', characters: [] as string[], event: '' }}
          render={(s, up) => (
            <div className="f-grid">
              <Field label={`S#${s.no} 제목`}><T v={s.title} on={(x) => up({ ...s, title: x })} /></Field>
              <Field label="장소"><T v={s.location} on={(x) => up({ ...s, location: x })} /></Field>
              <Field label="시간대"><T v={s.time} on={(x) => up({ ...s, time: x })} ph="예: 밤, 비" /></Field>
              <Field label="등장 인물"><Tags v={s.characters} on={(x) => up({ ...s, characters: x })} /></Field>
              <Field label="핵심 사건" wide><A v={s.event} on={(x) => up({ ...s, event: x })} rows={2} /></Field>
            </div>
          )}
        />
        <ListEditor
          title="인물"
          items={v.characters}
          onChange={set('characters')}
          blank={{ name: '', role: '', description: '' }}
          render={(c, up) => (
            <div className="f-grid">
              <Field label="이름"><T v={c.name} on={(x) => up({ ...c, name: x })} /></Field>
              <Field label="역할"><T v={c.role} on={(x) => up({ ...c, role: x })} ph="주인공·상대역·조연·악역·내레이터" /></Field>
              <Field label="설명" wide><T v={c.description} on={(x) => up({ ...c, description: x })} ph="나이·성격·특징" /></Field>
            </div>
          )}
        />
        <ListEditor
          title="인물 관계"
          items={v.relations}
          onChange={set('relations')}
          blank={{ a: '', b: '', relation: '' }}
          render={(r, up) => (
            <div className="f-grid three">
              <Field label="인물"><T v={r.a} on={(x) => up({ ...r, a: x })} /></Field>
              <Field label="인물"><T v={r.b} on={(x) => up({ ...r, b: x })} /></Field>
              <Field label="관계"><T v={r.relation} on={(x) => up({ ...r, relation: x })} /></Field>
            </div>
          )}
        />
        <ListEditor
          title="복선"
          items={v.foreshadowing}
          onChange={set('foreshadowing')}
          blank={{ clue: '', plantAt: '', payoffAt: '', resolved: false }}
          render={(f, up) => (
            <div className="f-grid">
              <Field label="복선" wide><T v={f.clue} on={(x) => up({ ...f, clue: x })} /></Field>
              <Field label="심는 곳"><T v={f.plantAt} on={(x) => up({ ...f, plantAt: x })} ph="S#2 / EP01" /></Field>
              <Field label="회수하는 곳"><T v={f.payoffAt} on={(x) => up({ ...f, payoffAt: x })} ph="S#5 / EP03" /></Field>
              <label className="check">
                <input type="checkbox" checked={f.resolved} onChange={(e) => up({ ...f, resolved: e.target.checked })} /> 이 편에서 회수됨
              </label>
            </div>
          )}
        />
      </div>
    );
  // direction
  return (
    <div className="f-stack">
      <div className="f-grid">
        <Field label="평균 샷 길이(초)">
          <input className="text-input" type="number" step="0.5" min={0.5} value={v.avgShotSec} onChange={(e) => set('avgShotSec')(parseFloat(e.target.value || '0'))} />
        </Field>
        <Field label="편집 리듬" wide><A v={v.rhythm} on={set('rhythm')} rows={2} ph="예: 2~3초마다 장면 변화, 반전 직전 1초 정지" /></Field>
        <Field label="선호 촬영 기법" wide><Tags v={v.preferred} on={set('preferred')} ph="슬로우모션, 클로즈업, 돌리 인..." /></Field>
        <Field label="피할 기법" wide><Tags v={v.avoid} on={set('avoid')} ph="빠른 휩팬, 360도 회전..." /></Field>
      </div>
      <ListEditor
        title="씬별 연출 포인트"
        items={v.scenePoints}
        onChange={set('scenePoints')}
        blank={{ scene: '', point: '' }}
        render={(p, up) => (
          <div className="f-grid">
            <Field label="씬"><T v={p.scene} on={(x) => up({ ...p, scene: x })} ph="S#1" /></Field>
            <Field label="연출" wide><A v={p.point} on={(x) => up({ ...p, point: x })} rows={2} /></Field>
          </div>
        )}
      />
    </div>
  );
}

function ListEditor<TItem>({
  title, items, onChange, blank, render,
}: {
  title: string;
  items: TItem[];
  onChange: (x: TItem[]) => void;
  blank: TItem;
  render: (item: TItem, update: (x: TItem) => void) => ReactNode;
}) {
  return (
    <div className="list-ed">
      <div className="list-head">
        <b>{title}</b> <small className="muted">{items.length}개</small>
        <button type="button" className="link" onClick={() => onChange([...items, JSON.parse(JSON.stringify(blank))])}>
          + 추가
        </button>
      </div>
      {items.map((it, i) => (
        <div key={i} className="list-item">
          {render(it, (x) => onChange(items.map((y, j) => (j === i ? x : y))))}
          <button type="button" className="icon-btn list-del" title="삭제" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** 선택지 미리보기 (읽기 전용) */
function StepPreview({ step, value }: { step: StoryStepId; value: any }) {
  const v = value || {};
  const rows: [string, string][] = useMemo(() => {
    if (step === 'plan') return [['장르', v.genre], ['톤', v.tone], ['타깃', v.target], ['길이', `${v.lengthSec}초 · ${v.aspect}`], ['방향', v.concept]];
    if (step === 'logline') return [['제목', v.title], ['로그라인', v.logline]];
    if (step === 'synopsis') return [['기', v.ki], ['승', v.seung], ['전', v.jeon], ['결', v.gyeol]];
    if (step === 'structure')
      return [
        ['요약', v.summary],
        ['씬', (v.scenes || []).map((s: any) => `S#${s.no} ${s.title} (${s.location}·${s.time}) — ${s.event}`).join('\n')],
        ['인물', (v.characters || []).map((c: any) => `${c.name}(${c.role})`).join(', ')],
        ['복선', (v.foreshadowing || []).map((f: any) => `${f.clue} [${f.plantAt}→${f.payoffAt}]`).join('\n')],
      ];
    return [
      ['샷 길이', `평균 ${v.avgShotSec}초`],
      ['리듬', v.rhythm],
      ['선호', (v.preferred || []).join(', ')],
      ['피함', (v.avoid || []).join(', ')],
      ['씬별', (v.scenePoints || []).map((p: any) => `${p.scene}: ${p.point}`).join('\n')],
    ];
  }, [step, value]);
  return (
    <dl className="preview">
      {rows
        .filter(([, x]) => x)
        .map(([k, x]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{x}</dd>
          </div>
        ))}
    </dl>
  );
}

// ---------------- 입력 자료 ----------------
function InputsPanel({ inputs, unitDir, disabled, onChange }: { inputs: StoryInput[]; unitDir: string; disabled: boolean; onChange: (x: StoryInput[]) => void }) {
  const [mode, setMode] = useState<null | 'memo' | 'script' | 'channel'>(null);
  const [val, setVal] = useState('');
  const label = { memo: '아이디어 메모', script: '기존 대본', channel: '채널 성과 데이터', file: '참고 자료' };
  return (
    <div className="list-ed inputs">
      <div className="list-head">
        <b>입력 자료</b> <small className="muted">AI 대화에 함께 전달됩니다</small>
      </div>
      {inputs.map((i) => (
        <div key={i.id} className="input-row">
          <span className="kind-badge short">{label[i.kind]}</span>
          <span className="input-name">{i.name}</span>
          <small className="muted">{i.text.length.toLocaleString()}자</small>
          {!disabled && (
            <button className="icon-btn" title="빼기" onClick={() => onChange(inputs.filter((x) => x.id !== i.id))}>
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
      ))}
      {!disabled &&
        (mode ? (
          <div className="input-add">
            <textarea
              className="text-area"
              rows={mode === 'memo' ? 3 : 6}
              autoFocus
              placeholder={mode === 'channel' ? '잘된 영상 제목·조회수·시청 지속률 등을 붙여넣으세요' : mode === 'script' ? '다른 곳에서 쓴 대본을 붙여넣으세요' : '떠오른 아이디어를 자유롭게'}
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
            <div className="set-row">
              <button className="btn ghost sm" onClick={() => (setMode(null), setVal(''))}>
                취소
              </button>
              <button
                className="btn primary sm"
                disabled={!val.trim()}
                onClick={() => {
                  onChange([...inputs, { id: rid(), kind: mode, name: `${label[mode]} ${inputs.filter((x) => x.kind === mode).length + 1}`, text: val.trim() }]);
                  setMode(null);
                  setVal('');
                }}
              >
                추가
              </button>
            </div>
          </div>
        ) : (
          <div className="set-row">
            <button className="btn ghost sm" onClick={() => setMode('memo')}>+ 메모</button>
            <button className="btn ghost sm" onClick={() => setMode('script')}>+ 대본 붙여넣기</button>
            <button className="btn ghost sm" onClick={() => setMode('channel')}>+ 채널 성과</button>
            <button
              className="btn ghost sm"
              onClick={async () => {
                const files = await api.prodImportInputs(unitDir);
                const ok = files.filter((f) => !f.skipped);
                const bad = files.filter((f) => f.skipped);
                if (bad.length) useStore.getState().showToast(`${bad[0].name}: ${bad[0].skipped}`);
                if (ok.length)
                  onChange([...inputs, ...ok.map((f) => ({ id: rid(), kind: (/\.(csv|tsv)$/i.test(f.name) ? 'channel' : 'file') as StoryInput['kind'], name: f.name, text: f.text }))]);
              }}
            >
              + 파일 (txt·md·csv…)
            </button>
          </div>
        ))}
    </div>
  );
}
