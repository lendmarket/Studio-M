import { useEffect, useMemo, useState } from 'react';
import { useStore, HomePage } from '../store';
import { api } from '../api';
import { Icon } from './Icons';
import { PLATFORMS, platformById } from '../core/platforms';
import { formatTime } from '../core/project';
import { mediaUrl } from '../engine/preview';
import { createProject, openProjectFile } from '../projectIO';
import type { ExportInfo, ProjectInfo } from '../../electron/preload';
import { ProductionsPage } from './Productions';
import AiSettingsCards from './AiSettings';

const NAV: { id: HomePage; label: string; icon: string; soon?: string }[] = [
  { id: 'home', label: '홈', icon: 'home' },
  { id: 'productions', label: '제작', icon: 'video' },
  { id: 'projects', label: '편집 프로젝트', icon: 'folder' },
  { id: 'templates', label: '템플릿', icon: 'sparkle', soon: '2단계' },
  { id: 'uploads', label: '업로드', icon: 'export', soon: '5단계' },
  { id: 'settings', label: '설정', icon: 'gear' },
];

const ago = (ms: number) => {
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return '방금 전';
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}일 전`;
  return new Date(ms).toLocaleDateString('ko-KR');
};
const mb = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`);

export default function Home() {
  const page = useStore((s) => s.homePage);
  const settings = useStore((s) => s.settings);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [exports, setExports] = useState<ExportInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const [p, e] = await Promise.all([api.wsProjects(), api.wsExports()]);
    setProjects(p);
    setExports(e);
    setLoading(false);
  };
  useEffect(() => {
    reload();
    const on = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [settings?.workspace]);

  return (
    <div className="home">
      <nav className="home-nav">
        {NAV.map((n) => (
          <button key={n.id} className={'nav-item' + (page === n.id ? ' active' : '')} onClick={() => useStore.getState().set({ homePage: n.id })}>
            <Icon name={n.icon} size={18} />
            <span>{n.label}</span>
            {n.soon && <em>{n.soon}</em>}
          </button>
        ))}
        <div className="nav-spacer" />
        <StorageCard />
      </nav>
      <main className="home-main">
        {page === 'home' && <Dashboard projects={projects} exports={exports} loading={loading} reload={reload} />}
        {page === 'productions' && <ProductionsPage />}
        {page === 'projects' && <ProjectsPage projects={projects} reload={reload} />}
        {page === 'templates' && <Soon title="템플릿" text="자막 스타일 · 인트로/아웃트로 · 레이아웃 템플릿이 2단계에서 추가됩니다." />}
        {page === 'uploads' && <Soon title="업로드" text="유튜브 · 인스타그램 · 틱톡 계정 연결과 자동/예약 업로드가 5단계에서 추가됩니다." />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

function StorageCard() {
  const s = useStore((x) => x.settings);
  if (!s) return null;
  return (
    <div className="storage-card" title={s.workspace}>
      <div className="storage-head">
        <Icon name={s.onDrive ? 'cloud' : 'folder'} size={15} />
        <span>{s.onDrive ? 'Google Drive에 저장 중' : '내 PC에 저장 중'}</span>
      </div>
      <div className="storage-path">{s.workspace}</div>
      <button className="link" onClick={() => api.openPath(s.workspace)}>
        폴더 열기
      </button>
    </div>
  );
}

function PlatformCards({ compact }: { compact?: boolean }) {
  return (
    <div className={'platform-grid' + (compact ? ' compact' : '')}>
      {PLATFORMS.map((p) => (
        <button key={p.id} className="platform-card" style={{ ['--pc' as any]: p.color }} onClick={() => useStore.getState().set({ newProjectOpen: p.id })}>
          <div className="pf-frame" style={{ aspectRatio: `${p.w} / ${p.h}` }}>
            <span>{p.glyph}</span>
          </div>
          <div className="pf-meta">
            <b>{p.name}</b>
            <small>{p.desc}</small>
          </div>
        </button>
      ))}
    </div>
  );
}

function Dashboard({ projects, exports, loading, reload }: { projects: ProjectInfo[]; exports: ExportInfo[]; loading: boolean; reload: () => void }) {
  const weekAgo = Date.now() - 7 * 86400000;
  const thisWeek = projects.filter((p) => p.updatedAt > weekAgo).length;
  const vertical = projects.filter((p) => p.height > p.width).length;
  const totalDur = projects.reduce((s, p) => s + p.duration, 0);
  const hour = new Date().getHours();
  const greet = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '좋은 저녁이에요';

  return (
    <div className="dash">
      <section className="hero">
        <div>
          <h1>{greet} 👋</h1>
          <p>오늘은 어떤 영상을 만들어 볼까요?</p>
        </div>
        <div className="hero-actions">
          <button className="btn-hero" onClick={() => useStore.getState().set({ newProjectOpen: 'shorts' })}>
            <Icon name="plus" size={20} /> 새 프로젝트
          </button>
          <button className="btn-sub" onClick={() => useStore.getState().set({ homePage: 'productions', newProductionOpen: 'short' })}>
            <Icon name="sparkle" size={16} /> 새 작품 (사전 제작)
          </button>
          <button className="btn-sub" onClick={() => openProjectFile()}>
            <Icon name="folder" size={16} /> 프로젝트 열기
          </button>
        </div>
      </section>

      <section>
        <div className="sec-head">
          <h2>빠르게 시작하기</h2>
          <span className="muted">플랫폼을 고르면 해당 규격으로 바로 시작합니다</span>
        </div>
        <PlatformCards />
      </section>

      <section className="stats">
        <Stat icon="folder" color="#8b6cff" label="전체 프로젝트" value={projects.length} sub={`세로 ${vertical} · 가로/기타 ${projects.length - vertical}`} />
        <Stat icon="update" color="#25c2f4" label="이번 주 작업" value={thisWeek} sub="최근 7일 동안 수정" />
        <Stat icon="export" color="#3ccf8e" label="내보낸 영상" value={exports.length} sub={exports.length ? `총 ${mb(exports.reduce((s, e) => s + e.size, 0))}` : '아직 없음'} />
        <Stat icon="video" color="#ffb020" label="총 편집 길이" value={formatTime(totalDur, 30, false).replace(/^00:/, '')} sub="모든 프로젝트 합계" />
        <Stat icon="cloud" color="#ff4fa3" label="업로드 현황" value="—" sub="5단계에서 계정 연결" dim />
      </section>

      <div className="dash-cols">
        <section className="recent">
          <div className="sec-head">
            <h2>최근 프로젝트</h2>
            <button className="link" onClick={() => useStore.getState().set({ homePage: 'projects' })}>
              모두 보기 →
            </button>
          </div>
          {loading ? (
            <div className="muted pad">불러오는 중...</div>
          ) : projects.length === 0 ? (
            <div className="empty-card">
              <Icon name="sparkle" size={30} />
              <p>아직 프로젝트가 없어요. 위에서 플랫폼을 골라 첫 영상을 만들어 보세요!</p>
            </div>
          ) : (
            <div className="proj-grid">
              {projects.slice(0, 8).map((p) => (
                <ProjectCard key={p.file} p={p} reload={reload} />
              ))}
            </div>
          )}
        </section>
        <section className="exports-col">
          <div className="sec-head">
            <h2>최근 내보낸 영상</h2>
          </div>
          {exports.length === 0 ? (
            <div className="muted pad">내보낸 영상이 여기에 표시됩니다.</div>
          ) : (
            <div className="export-list">
              {exports.slice(0, 8).map((e) => (
                <button key={e.file} className="export-row" onClick={() => api.reveal(e.file)} title={e.file}>
                  <div className="ex-ico">
                    <Icon name="video" size={16} />
                  </div>
                  <div className="ex-meta">
                    <b>{e.name}</b>
                    <small>
                      {e.project} · {mb(e.size)} · {ago(e.createdAt)}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, color, label, value, sub, dim }: { icon: string; color: string; label: string; value: string | number; sub: string; dim?: boolean }) {
  return (
    <div className={'stat' + (dim ? ' dim' : '')} style={{ ['--sc' as any]: color }}>
      <div className="stat-ico">
        <Icon name={icon} size={18} />
      </div>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

function ProjectCard({ p, reload }: { p: ProjectInfo; reload: () => void }) {
  const pf = platformById(p.platform);
  const [menu, setMenu] = useState(false);
  return (
    <div className="proj-card" onClick={() => openProjectFile(p.file)} onMouseLeave={() => setMenu(false)}>
      <div className="proj-thumb">
        {p.thumb ? <img src={mediaUrl(p.thumb) + '?t=' + Math.round(p.updatedAt)} draggable={false} /> : <Icon name="video" size={26} />}
        <span className="pf-badge" style={{ background: pf.color }}>
          {pf.short}
        </span>
        {p.duration > 0 && <span className="badge">{formatTime(p.duration, 30, false).replace(/^00:/, '')}</span>}
        <button
          className="proj-more"
          onClick={(e) => {
            e.stopPropagation();
            setMenu(!menu);
          }}
        >
          ⋯
        </button>
        {menu && (
          <div className="proj-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => openProjectFile(p.file)}>열기</button>
            <button onClick={() => api.openPath(p.dir)}>폴더 열기</button>
            <button
              className="danger"
              onClick={async () => {
                const r = await api.confirm(`'${p.name}' 프로젝트를 삭제할까요?`, ['휴지통으로 이동', '취소'], '프로젝트 폴더(미디어, 내보낸 영상 포함)가 휴지통으로 이동합니다.');
                if (r === 0) {
                  await api.wsTrash(p.file).catch((e: Error) => useStore.getState().showToast(e.message));
                  reload();
                }
              }}
            >
              삭제
            </button>
          </div>
        )}
      </div>
      <div className="proj-meta">
        <b>{p.name}</b>
        <small>
          {pf.name} · {ago(p.updatedAt)}
        </small>
      </div>
    </div>
  );
}

function ProjectsPage({ projects, reload }: { projects: ProjectInfo[]; reload: () => void }) {
  const [q, setQ] = useState('');
  const [pf, setPf] = useState('all');
  const list = useMemo(
    () => projects.filter((p) => (pf === 'all' || p.platform === pf) && p.name.toLowerCase().includes(q.toLowerCase())),
    [projects, q, pf],
  );
  return (
    <div className="dash">
      <section className="page-head">
        <h1>프로젝트</h1>
        <button className="btn-hero sm" onClick={() => useStore.getState().set({ newProjectOpen: 'shorts' })}>
          <Icon name="plus" size={16} /> 새 프로젝트
        </button>
      </section>
      <div className="filter-bar">
        <input className="search" placeholder="프로젝트 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          <button className={'chip' + (pf === 'all' ? ' active' : '')} onClick={() => setPf('all')}>
            전체 {projects.length}
          </button>
          {PLATFORMS.map((x) => {
            const n = projects.filter((p) => p.platform === x.id).length;
            return n ? (
              <button key={x.id} className={'chip' + (pf === x.id ? ' active' : '')} onClick={() => setPf(x.id)}>
                {x.short} {n}
              </button>
            ) : null;
          })}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="muted pad">프로젝트가 없습니다.</div>
      ) : (
        <div className="proj-grid wide">
          {list.map((p) => (
            <ProjectCard key={p.file} p={p} reload={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function Soon({ title, text }: { title: string; text: string }) {
  return (
    <div className="dash">
      <section className="page-head">
        <h1>{title}</h1>
      </section>
      <div className="empty-card big">
        <Icon name="sparkle" size={34} />
        <p>{text}</p>
      </div>
    </div>
  );
}

function SettingsPage() {
  const s = useStore((x) => x.settings);
  const [safe, setSafe] = useState(false);
  const [version, setVersion] = useState('');
  useEffect(() => {
    api.isSafeMode().then(setSafe);
    api.version().then(setVersion);
  }, []);
  if (!s) return null;
  const save = async (patch: object) => useStore.getState().set({ settings: await api.wsSaveSettings(patch) });
  return (
    <div className="dash settings-page">
      <section className="page-head">
        <h1>설정</h1>
      </section>
      <div className="set-card">
        <h3>저장 위치</h3>
        <p className="muted">새 프로젝트는 이 폴더 안에 '프로젝트 이름' 폴더로 만들어집니다. (media · exports 폴더 포함)</p>
        <div className="set-row">
          <div className="path-box">
            <Icon name={s.onDrive ? 'cloud' : 'folder'} size={16} />
            <span>{s.workspace}</span>
          </div>
          <button
            className="btn ghost"
            onClick={async () => {
              const f = await api.wsChooseFolder();
              if (f) save({ workspace: f });
            }}
          >
            변경
          </button>
        </div>
        {s.googleDrive ? (
          !s.onDrive && (
            <div className="notice">
              Google Drive가 연결되어 있습니다: <b>{s.googleDrive}</b>
              <button className="btn primary sm" onClick={() => save({ workspace: s.googleDrive + (s.googleDrive!.includes('\\') ? '\\' : '/') + 'Studio M' })}>
                Google Drive에 저장하기
              </button>
            </div>
          )
        ) : (
          <div className="notice warn">
            Google Drive 데스크톱 앱이 감지되지 않았습니다. PC 용량을 아끼려면 'Google Drive 데스크톱'을 설치하고 <b>파일 스트리밍</b> 모드로 설정한 뒤 Studio M을 다시 실행하세요.
          </div>
        )}
        <p className="muted small">기존 프로젝트는 옮겨지지 않습니다. 필요하면 폴더째로 새 위치에 옮기면 그대로 열립니다.</p>
      </div>
      <div className="set-card">
        <h3>미디어</h3>
        <label className="check">
          <input type="checkbox" checked={s.copyMedia} onChange={(e) => save({ copyMedia: e.target.checked })} />
          가져온 영상·사진·음악을 프로젝트의 media 폴더로 복사 (원본을 옮기거나 지워도 프로젝트가 유지됩니다)
        </label>
      </div>
      <AiSettingsCards />
      <div className="set-card">
        <h3>플랫폼 길이 제한</h3>
        <p className="muted">플랫폼 정책이 바뀌면 여기서 수정하세요. 비워두면 제한 없음.</p>
        <div className="limit-grid">
          {PLATFORMS.map((p) => {
            const v = p.id in s.limits ? s.limits[p.id] : p.maxSec;
            return (
              <div key={p.id} className="limit-row">
                <span className="pf-dot" style={{ background: p.color }} />
                <span>{p.name}</span>
                <input
                  type="number"
                  min={0}
                  placeholder="제한 없음"
                  defaultValue={v ?? ''}
                  onBlur={(e) => save({ limits: { ...s.limits, [p.id]: e.target.value ? parseInt(e.target.value, 10) : null } })}
                />
                <small>초</small>
              </div>
            );
          })}
        </div>
      </div>
      <div className="set-card">
        <h3>앱</h3>
        <div className="set-row">
          <span>Studio M v{version}</span>
          <button className="btn ghost" onClick={() => api.checkUpdate()}>
            업데이트 확인
          </button>
          <button className="btn ghost" onClick={() => api.openLogs()}>
            로그 폴더
          </button>
          <button className="btn ghost" onClick={() => api.setSafeMode(!safe)}>
            {safe ? 'GPU 가속 켜기' : '안전 모드(GPU 끔)'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewProjectDialog() {
  const pid = useStore((s) => s.newProjectOpen);
  const [platform, setPlatform] = useState(pid || 'shorts');
  const pf = platformById(platform);
  const today = new Date();
  const def = `${pf.short} ${today.getMonth() + 1}월 ${today.getDate()}일 ${String(today.getHours()).padStart(2, '0')}${String(today.getMinutes()).padStart(2, '0')}`;
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setPlatform(pid || 'shorts'), [pid]);
  if (!pid) return null;
  const close = () => !busy && useStore.getState().set({ newProjectOpen: null });
  const go = async () => {
    setBusy(true);
    try {
      await createProject(platform, name.trim() || def);
      useStore.getState().set({ newProjectOpen: null });
      setName('');
    } catch (e) {
      useStore.getState().showToast('프로젝트를 만들 수 없습니다: ' + String((e as Error).message || e));
    }
    setBusy(false);
  };
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal newproj">
        <div className="modal-head">
          <span>
            <Icon name="plus" size={16} /> 새 프로젝트
          </span>
          <button className="icon-btn" onClick={close}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="np-grid">
            {PLATFORMS.map((p) => (
              <button key={p.id} className={'np-item' + (platform === p.id ? ' on' : '')} style={{ ['--pc' as any]: p.color }} onClick={() => setPlatform(p.id)}>
                <div className="pf-frame sm" style={{ aspectRatio: `${p.w} / ${p.h}` }}>
                  <span>{p.glyph}</span>
                </div>
                <b>{p.name}</b>
                <small>{p.desc}</small>
              </button>
            ))}
          </div>
          <div className="row">
            <label>프로젝트 이름</label>
            <input className="text-input" autoFocus placeholder={def} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
          </div>
          <p className="hint">
            {pf.w}×{pf.h} · 저장 위치: {useStore.getState().settings?.workspace}
          </p>
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
