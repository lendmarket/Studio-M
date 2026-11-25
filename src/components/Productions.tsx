import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { Icon } from './Icons';
import {
  ASPECTS, aspectById, EpisodeInfo, LENGTH_PRESETS, ProductionInfo, ProductionKind, progressOf, SERIES_DIRS, STAGE_STATUS_LABEL, STAGES,
  StageId, Stages,
} from '../core/production';

const KIND_LABEL: Record<ProductionKind, string> = { short: '단편', series: '시리즈' };
const sepOf = (p: string) => (p.includes('\\') ? '\\' : '/');
const join = (dir: string, ...parts: string[]) => [dir, ...parts].join(sepOf(dir));

const ago = (ms: number) => {
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return '방금 전';
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}일 전`;
  return new Date(ms).toLocaleDateString('ko-KR');
};
const lengthLabel = (s: number) => (s % 60 === 0 ? `${s / 60}분` : s > 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`);

export async function openProduction(dir: string, unit?: string) {
  const info = await api.prodGet(dir);
  if (!info) return useStore.getState().showToast('작품을 열 수 없습니다');
  const first = info.meta.kind === 'series' ? info.episodes?.[0]?.dir || null : info.dir;
  useStore.getState().set({ view: 'production', prodDir: dir, prodUnit: unit || first });
}

// ---------------- 작품 목록 (홈 › 제작) ----------------
export function ProductionsPage() {
  const [list, setList] = useState<ProductionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<'all' | ProductionKind>('all');
  const [q, setQ] = useState('');
  const settings = useStore((s) => s.settings);
  const newOpen = useStore((s) => s.newProductionOpen);

  const reload = async () => {
    setLoading(true);
    setList(await api.prodList().catch(() => []));
    setLoading(false);
  };
  useEffect(() => {
    reload();
  }, [settings?.workspace, newOpen]);

  const shown = useMemo(
    () => list.filter((p) => (kind === 'all' || p.meta.kind === kind) && p.meta.title.toLowerCase().includes(q.toLowerCase())),
    [list, kind, q],
  );
  const count = (k: ProductionKind) => list.filter((p) => p.meta.kind === k).length;

  return (
    <div className="dash">
      <section className="page-head">
        <div>
          <h1>제작</h1>
          <p className="muted small">스토리 확정 → 바이블 → 대본 → 프롬프트·검수 → 생성 → 편집 프로젝트로 넘기기</p>
        </div>
        <div className="set-row">
          <button className="btn-sub" onClick={() => useStore.getState().set({ newProductionOpen: 'series' })}>
            <Icon name="folder" size={16} /> 새 시리즈
          </button>
          <button className="btn-hero sm" onClick={() => useStore.getState().set({ newProductionOpen: 'short' })}>
            <Icon name="plus" size={16} /> 새 단편
          </button>
        </div>
      </section>

      <div className="filter-bar">
        <input className="search" placeholder="작품 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          <button className={'chip' + (kind === 'all' ? ' active' : '')} onClick={() => setKind('all')}>
            전체 {list.length}
          </button>
          <button className={'chip' + (kind === 'short' ? ' active' : '')} onClick={() => setKind('short')}>
            단편 {count('short')}
          </button>
          <button className={'chip' + (kind === 'series' ? ' active' : '')} onClick={() => setKind('series')}>
            시리즈 {count('series')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="muted pad">불러오는 중...</div>
      ) : shown.length === 0 ? (
        <div className="empty-card big">
          <Icon name="sparkle" size={34} />
          <p>
            {list.length === 0
              ? '아직 작품이 없어요. 한 편으로 끝나는 영상은 「새 단편」, 여러 화로 이어지는 영상은 「새 시리즈」로 시작하세요.'
              : '조건에 맞는 작품이 없습니다.'}
          </p>
        </div>
      ) : (
        <div className="prod-grid">
          {shown.map((p) => (
            <ProductionCard key={p.dir} p={p} reload={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductionCard({ p, reload }: { p: ProductionInfo; reload: () => void }) {
  const [menu, setMenu] = useState(false);
  const a = aspectById(p.meta.format.aspect);
  const eps = p.episodes || [];
  const progress = p.meta.kind === 'series' ? (eps.length ? eps.reduce((s, e) => s + progressOf(e.meta.stages), 0) / eps.length : 0) : progressOf(p.meta.stages);
  return (
    <div className="prod-card" onClick={() => openProduction(p.dir)} onMouseLeave={() => setMenu(false)}>
      <div className="prod-card-head">
        <span className={'kind-badge ' + p.meta.kind}>{KIND_LABEL[p.meta.kind]}</span>
        <button
          className="proj-more show"
          onClick={(e) => {
            e.stopPropagation();
            setMenu(!menu);
          }}
        >
          ⋯
        </button>
        {menu && (
          <div className="proj-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => openProduction(p.dir)}>열기</button>
            <button onClick={() => api.openPath(p.dir)}>폴더 열기</button>
            <button
              className="danger"
              onClick={async () => {
                const r = await api.confirm(
                  `'${p.meta.title}' 작품을 삭제할까요?`,
                  ['휴지통으로 이동', '취소'],
                  '작품 폴더(단계별 파일, 생성한 미디어 포함)가 휴지통으로 이동합니다.',
                );
                if (r === 0) {
                  await api.prodTrash(p.dir).catch((e: Error) => useStore.getState().showToast(e.message));
                  reload();
                }
              }}
            >
              삭제
            </button>
          </div>
        )}
      </div>
      <b className="prod-title">{p.meta.title}</b>
      <small className="muted">
        {a.label} · 한 편 {lengthLabel(p.meta.format.lengthSec)}
        {p.meta.kind === 'series' && ` · ${eps.length}화`}
      </small>
      <div className="prog">
        <div style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <small className="muted">
        확정 {Math.round(progress * 6)}/6 단계{p.meta.kind === 'series' ? ' (화 평균)' : ''} · {ago(p.meta.updatedAt)}
      </small>
    </div>
  );
}

// ---------------- 새 작품 창 ----------------
export function NewProductionDialog() {
  const open = useStore((s) => s.newProductionOpen);
  const settings = useStore((s) => s.settings);
  const [kind, setKind] = useState<ProductionKind>('short');
  const [title, setTitle] = useState('');
  const [aspect, setAspect] = useState(ASPECTS[0].id);
  const [lengthSec, setLengthSec] = useState(60);
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(open);
    setTitle('');
    const b = settings?.ai?.defaultBudgetUsd;
    setBudget(b == null ? '' : String(b));
  }, [open]);
  if (!open) return null;

  const close = () => !busy && useStore.getState().set({ newProductionOpen: null });
  const go = async () => {
    setBusy(true);
    try {
      const b = budget.trim() === '' ? null : Math.max(0, parseFloat(budget));
      const info = await api.prodCreate({ kind, title, format: { aspect, lengthSec: Math.max(5, Math.round(lengthSec)) }, budgetUsd: Number.isFinite(b as number) ? b : null });
      useStore.getState().set({ newProductionOpen: null });
      await openProduction(info.dir);
    } catch (e) {
      useStore.getState().showToast('작품을 만들 수 없습니다: ' + String((e as Error).message || e));
    }
    setBusy(false);
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal newprod">
        <div className="modal-head">
          <span>
            <Icon name="plus" size={16} /> 새 작품
          </span>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="kind-toggle">
            {(['short', 'series'] as const).map((k) => (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                <b>{KIND_LABEL[k]}</b>
                <small>{k === 'short' ? '한 편으로 끝나는 영상 · 작품 폴더 하나' : '여러 화로 이어지는 영상 · 시리즈 바이블을 모든 화가 공유'}</small>
              </button>
            ))}
          </div>
          <div className="row">
            <label>제목</label>
            <input
              className="text-input"
              autoFocus
              placeholder={kind === 'series' ? '예: 이거 알아? 시즌 1' : '예: 유산균 고르는 법'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
          </div>
          <div className="row top">
            <label>화면 비율</label>
            <div className="aspect-grid">
              {ASPECTS.map((x) => (
                <button key={x.id} className={'aspect-item' + (aspect === x.id ? ' on' : '')} onClick={() => setAspect(x.id)}>
                  <div className="pf-frame sm" style={{ aspectRatio: `${x.w} / ${x.h}` }} />
                  <b>{x.label}</b>
                  <small>{x.desc}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <label>{kind === 'series' ? '한 화 길이' : '길이'}</label>
            <div className="chips flat">
              {LENGTH_PRESETS.map((s) => (
                <button key={s} className={'chip' + (lengthSec === s ? ' active' : '')} onClick={() => setLengthSec(s)}>
                  {lengthLabel(s)}
                </button>
              ))}
              <input className="text-input num" type="number" min={5} value={lengthSec} onChange={(e) => setLengthSec(parseInt(e.target.value || '0', 10))} />
              <small className="muted">초</small>
            </div>
          </div>
          <div className="row">
            <label>예산 (USD)</label>
            <input className="text-input num" type="number" min={0} placeholder="한도 없음" value={budget} onChange={(e) => setBudget(e.target.value)} />
            <small className="muted">{kind === 'series' ? '화마다 적용 · ' : ''}생성 비용이 넘으면 멈추고 물어봅니다</small>
          </div>
          <p className="hint">장르·톤·타깃 같은 내용은 S1 스토리 개발 대화에서 함께 정합니다.</p>
          <div className="modal-foot">
            <button className="btn ghost" onClick={close}>
              취소
            </button>
            <button className="btn primary" onClick={go} disabled={busy}>
              {busy ? '만드는 중...' : '만들기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- 작품 화면 ----------------
export function ProductionView() {
  const dir = useStore((s) => s.prodDir);
  const unit = useStore((s) => s.prodUnit);
  const [info, setInfo] = useState<ProductionInfo | null>(null);
  const [stage, setStage] = useState<StageId>('story');

  const reload = async () => {
    if (!dir) return;
    setInfo(await api.prodGet(dir));
  };
  useEffect(() => {
    reload();
  }, [dir]);

  if (!dir || !info) return <div className="muted pad">불러오는 중...</div>;
  const isSeries = info.meta.kind === 'series';
  const eps = info.episodes || [];
  const ep: EpisodeInfo | undefined = isSeries ? eps.find((e) => e.dir === unit) || eps[0] : undefined;
  const unitDir = isSeries ? ep?.dir : info.dir;
  const unitFile = isSeries ? ep?.file : info.file;
  const stages: Stages | undefined = isSeries ? ep?.meta.stages : info.meta.stages;
  const budget = isSeries ? ep?.meta.budgetUsd ?? null : info.meta.budgetUsd;
  const def = STAGES.find((s) => s.id === stage)!;
  const st = stages?.[stage] || { status: 'empty' as const };
  const a = aspectById(info.meta.format.aspect);

  const saveBudget = async (v: string) => {
    if (!unitFile) return;
    const n = v.trim() === '' ? null : parseFloat(v);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return useStore.getState().showToast('0 이상의 숫자를 입력하세요');
    if (n === budget) return;
    await api.prodUpdateMeta(unitFile, { budgetUsd: n });
    reload();
  };

  return (
    <div className="prod-view">
      <aside className="prod-side">
        <div className="prod-side-head">
          <span className={'kind-badge ' + info.meta.kind}>{KIND_LABEL[info.meta.kind]}</span>
          <h2>{info.meta.title}</h2>
          <small className="muted">
            {a.label} · {isSeries ? '한 화' : '길이'} {lengthLabel(info.meta.format.lengthSec)}
          </small>
        </div>
        {isSeries && (
          <>
            <div className="side-sec">
              <div className="side-title">시리즈 공통</div>
              <button className="side-item" onClick={() => api.openPath(join(info.dir, SERIES_DIRS.bible))}>
                <Icon name="file" size={15} /> 시리즈 바이블 <em>C단계</em>
              </button>
              <button className="side-item" onClick={() => api.openPath(join(info.dir, SERIES_DIRS.arc))}>
                <Icon name="file" size={15} /> 시리즈 줄거리·복선 <em>B단계</em>
              </button>
            </div>
            <div className="side-sec">
              <div className="side-title">
                화 목록
                <button
                  className="link"
                  onClick={async () => {
                    const e = await api.prodAddEpisode(info.dir);
                    await reload();
                    useStore.getState().set({ prodUnit: e.dir });
                  }}
                >
                  + 새 화
                </button>
              </div>
              {eps.map((e) => (
                <button key={e.dir} className={'side-item' + (e.dir === ep?.dir ? ' on' : '')} onClick={() => useStore.getState().set({ prodUnit: e.dir })}>
                  <span className="ep-no">EP{String(e.meta.no).padStart(2, '0')}</span>
                  <span className="ep-title">{e.meta.title}</span>
                  <span className="ep-prog">{Math.round(progressOf(e.meta.stages) * 6)}/6</span>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="side-sec">
          <div className="side-title">관리</div>
          <label className="side-item budget" title="생성 비용이 이 금액을 넘으면 멈추고 물어봅니다">
            <Icon name="speed" size={15} /> 예산 $
            <input
              key={`${unitFile}-${budget}`}
              type="number"
              min={0}
              placeholder="한도 없음"
              defaultValue={budget == null ? '' : String(budget)}
              onBlur={(e) => saveBudget(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <button className="side-item" onClick={() => api.openPath(unitDir || info.dir)}>
            <Icon name="folder" size={15} /> {isSeries ? '이 화 폴더 열기' : '작품 폴더 열기'}
          </button>
        </div>
      </aside>

      <main className="prod-main">
        <div className="stepper">
          {STAGES.map((s, i) => {
            const status = stages?.[s.id]?.status || 'empty';
            return (
              <button key={s.id} className={`step ${status}` + (stage === s.id ? ' on' : '')} onClick={() => setStage(s.id)}>
                <span className="step-no">{s.no}</span>
                <span className="step-label">{s.label}</span>
                <span className="step-status">{STAGE_STATUS_LABEL[status]}</span>
                {i < STAGES.length - 1 && <span className="step-arrow">›</span>}
              </button>
            );
          })}
        </div>

        <section className="stage-panel">
          <div className="stage-head">
            <div>
              <small className="muted">
                {def.no}
                {isSeries && ep ? ` · ${ep.meta.title}` : ''}
              </small>
              <h2>{def.label}</h2>
            </div>
            <span className={`status-chip ${st.status}`}>{STAGE_STATUS_LABEL[st.status]}</span>
          </div>
          <p>{def.desc}</p>
          <div className="stage-meta">
            <div>
              <small className="muted">산출물</small>
              <b>{def.output}</b>
            </div>
            <div>
              <small className="muted">저장 위치</small>
              <b>{def.dir}/</b>
            </div>
          </div>
          <div className="notice">
            이 단계의 작업 화면은 {def.phase}단계에서 추가됩니다. 지금은 작품 폴더와 단계별 폴더가 준비되어 있습니다.
            <button className="btn ghost sm" onClick={() => unitDir && api.openPath(join(unitDir, def.dir))}>
              단계 폴더 열기
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
