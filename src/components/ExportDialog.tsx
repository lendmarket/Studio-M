import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { renderTextPng } from '../core/text';
import { formatTime, projectDuration } from '../core/project';
import { Icon } from './Icons';
import { Logo } from './TopBar';

const RES = [
  { id: '480', label: '480p', short: 480 },
  { id: '720', label: '720p', short: 720 },
  { id: '1080', label: '1080p', short: 1080 },
  { id: '1440', label: '2K', short: 1440 },
  { id: '2160', label: '4K', short: 2160 },
];
const QUALITY = [
  { id: 'low', label: '낮음 (작은 파일)', crf: 28 },
  { id: 'rec', label: '권장', crf: 21 },
  { id: 'high', label: '높음', crf: 17 },
];

const even = (n: number) => Math.round(n / 2) * 2;

export default function ExportDialog() {
  const project = useStore((s) => s.project);
  const [name, setName] = useState(project.name || '동영상');
  const [res, setRes] = useState('1080');
  const [fps, setFps] = useState(project.fps);
  const [quality, setQuality] = useState('rec');
  const [phase, setPhase] = useState<'form' | 'running' | 'done' | 'error'>('form');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [outPath, setOutPath] = useState('');
  const duration = projectDuration(project);

  const short = RES.find((r) => r.id === res)!.short;
  const landscape = project.width >= project.height;
  const k = short / Math.min(project.width, project.height);
  const W = even(project.width * k);
  const H = even(project.height * k);
  const crf = QUALITY.find((q) => q.id === quality)!.crf;
  const estMB = Math.round(((W * H * fps * duration) / 1e6) * (crf <= 17 ? 0.02 : crf <= 21 ? 0.0125 : 0.006) + duration * 0.024);

  useEffect(() => api.onExportProgress((p: number) => setProgress(p)), []);

  const close = () => phase !== 'running' && useStore.getState().set({ exportOpen: false });

  const start = async () => {
    if (duration <= 0) return setError('타임라인이 비어 있습니다.'), setPhase('error');
    const out = await api.saveDialog(`${name}.mp4`, [{ name: 'MP4 동영상', extensions: ['mp4'] }]);
    if (!out) return;
    setOutPath(out);
    setPhase('running');
    setProgress(0);
    await document.fonts.ready;
    const textPngs: Record<string, string> = {};
    const hidden = new Set(project.tracks.filter((t) => t.hidden).map((t) => t.id));
    for (const c of project.clips) if (c.kind === 'text' && !hidden.has(c.trackId)) textPngs[c.id] = renderTextPng(c, project.width, W, H);
    const r = await api.exportStart({ project, settings: { outPath: out, width: W, height: H, fps, crf }, textPngs });
    if (r.ok) {
      setProgress(1);
      setPhase('done');
    } else {
      setError(r.error || '알 수 없는 오류');
      setPhase('error');
    }
  };

  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal export">
        <div className="modal-head">
          <span>
            <Icon name="export" size={16} /> 내보내기
          </span>
          {phase !== 'running' && (
            <button className="icon-btn" onClick={close}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        {phase === 'form' && (
          <div className="modal-body">
            <div className="row">
              <label>파일 이름</label>
              <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="row">
              <label>해상도</label>
              <div className="seg">
                {RES.map((r) => (
                  <button key={r.id} className={res === r.id ? 'on' : ''} onClick={() => setRes(r.id)}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <label>프레임 속도</label>
              <div className="seg">
                {[24, 25, 30, 50, 60].map((f) => (
                  <button key={f} className={fps === f ? 'on' : ''} onClick={() => setFps(f)}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="row">
              <label>화질</label>
              <div className="seg">
                {QUALITY.map((q) => (
                  <button key={q.id} className={quality === q.id ? 'on' : ''} onClick={() => setQuality(q.id)}>
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="export-summary">
              <div>
                <small>출력</small>
                <b>
                  {W}×{H} · {fps}fps · MP4 (H.264/AAC)
                </b>
              </div>
              <div>
                <small>길이</small>
                <b>{formatTime(duration, fps, false)}</b>
              </div>
              <div>
                <small>예상 크기</small>
                <b>약 {estMB} MB</b>
              </div>
            </div>
            {!landscape && <p className="hint">세로 영상은 짧은 변 기준으로 해상도가 정해집니다.</p>}
            <div className="modal-foot">
              <button className="btn ghost" onClick={close}>
                취소
              </button>
              <button className="btn primary" onClick={start} disabled={duration <= 0}>
                내보내기
              </button>
            </div>
          </div>
        )}
        {phase === 'running' && (
          <div className="modal-body center">
            <Logo size={48} />
            <p className="export-status">동영상을 만드는 중... {Math.round(progress * 100)}%</p>
            <div className="progress">
              <div style={{ width: `${progress * 100}%` }} />
            </div>
            <button className="btn ghost" onClick={() => api.exportCancel()}>
              취소
            </button>
          </div>
        )}
        {phase === 'done' && (
          <div className="modal-body center">
            <div className="done-icon">
              <Icon name="check" size={30} />
            </div>
            <p className="export-status">내보내기 완료!</p>
            <p className="hint path">{outPath}</p>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => api.reveal(outPath)}>
                폴더 열기
              </button>
              <button className="btn primary" onClick={() => useStore.getState().set({ exportOpen: false })}>
                완료
              </button>
            </div>
          </div>
        )}
        {phase === 'error' && (
          <div className="modal-body">
            <p className="export-status err">내보내기에 실패했습니다</p>
            <pre className="err-log">{error}</pre>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setPhase('form')}>
                다시 시도
              </button>
              <button className="btn primary" onClick={() => useStore.getState().set({ exportOpen: false })}>
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
