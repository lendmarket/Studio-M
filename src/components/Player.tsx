import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { PreviewEngine } from '../engine/preview';
import { ASPECTS, formatTime, projectDuration } from '../core/project';
import { clipBox, pointInBox, Box } from '../core/geometry';
import { Icon } from './Icons';

export default function Player() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PreviewEngine | null>(null);
  const [size, setSize] = useState({ w: 640, h: 360 });
  const project = useStore((s) => s.project);
  const playing = useStore((s) => s.playing);
  const currentTime = useStore((s) => s.currentTime);
  const selectedId = useStore((s) => s.selectedId);
  const [ratioOpen, setRatioOpen] = useState(false);
  const duration = projectDuration(project);

  // 화면 크기에 맞춘 캔버스 크기
  useEffect(() => {
    const el = stageRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const s = Math.min((r.width - 24) / project.width, (r.height - 24) / project.height);
      setSize({ w: Math.max(10, Math.floor(project.width * s)), h: Math.max(10, Math.floor(project.height * s)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  // 렌더 루프
  useEffect(() => {
    const engine = new PreviewEngine();
    engineRef.current = engine;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const st = useStore.getState();
      const dt = (now - last) / 1000;
      last = now;
      let t = st.currentTime;
      if (st.playing) {
        const dur = projectDuration(st.project);
        t = t + dt;
        if (t >= dur) {
          t = dur;
          useStore.setState({ playing: false, currentTime: dur });
        } else useStore.setState({ currentTime: t });
      }
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext('2d')!;
        engine.render(ctx, st.project, t, st.playing);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      engine.destroy();
    };
  }, []);

  useEffect(() => {
    if (playing) engineRef.current?.resumeAudio();
    else engineRef.current?.pauseAll();
  }, [playing]);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.min(project.width, Math.round(size.w * dpr));
  const ch = Math.round((cw / project.width) * project.height);
  const scale = size.w / project.width; // 프로젝트 → 화면 px

  // 선택 박스
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const sel = project.clips.find((c) => c.id === selectedId);
  const selVisible =
    sel && sel.kind !== 'audio' && currentTime >= sel.start && currentTime < sel.start + sel.duration && !project.tracks.find((t) => t.id === sel.trackId)?.hidden;
  const box: Box | null = selVisible && sel ? clipBox(project, sel, sel.assetId ? assets.get(sel.assetId) : undefined) : null;

  const toProject = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const onStageDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const pt = toProject(e);
    // 위 트랙부터 히트 테스트
    const tracks = project.tracks.filter((t) => t.type !== 'audio' && !t.hidden && !t.locked);
    for (const tr of tracks) {
      const clips = project.clips
        .filter((c) => c.trackId === tr.id && currentTime >= c.start && currentTime < c.start + c.duration)
        .sort((a, b) => b.start - a.start);
      for (const c of clips) {
        const b = clipBox(project, c, c.assetId ? assets.get(c.assetId) : undefined);
        if (b && pointInBox(b, pt.x, pt.y)) {
          useStore.getState().select(c.id);
          startDrag(e, c.id, 'move');
          return;
        }
      }
    }
    useStore.getState().select(null);
  };

  const startDrag = (e: React.PointerEvent, id: string, mode: 'move' | 'scale' | 'rotate') => {
    e.stopPropagation();
    e.preventDefault();
    const st = useStore.getState();
    const c0 = st.project.clips.find((c) => c.id === id);
    if (!c0) return;
    const b0 = clipBox(st.project, c0, c0.assetId ? assets.get(c0.assetId) : undefined);
    if (!b0) return;
    const p0 = toProject(e);
    const t0 = { ...c0.transform };
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const p = toProject(ev);
      if (!moved) {
        if (Math.hypot(p.x - p0.x, p.y - p0.y) * scale < 2) return;
        moved = true;
        useStore.getState().checkpoint();
      }
      useStore.getState().mutate((proj) => {
        const c = proj.clips.find((x) => x.id === id)!;
        if (mode === 'move') {
          let nx = t0.x + (p.x - p0.x);
          let ny = t0.y + (p.y - p0.y);
          const snap = 12 / scale;
          if (Math.abs(nx) < snap) nx = 0;
          if (Math.abs(ny) < snap) ny = 0;
          c.transform.x = Math.round(nx);
          c.transform.y = Math.round(ny);
        } else if (mode === 'scale') {
          const d0 = Math.hypot(p0.x - b0.cx, p0.y - b0.cy);
          const d1 = Math.hypot(p.x - b0.cx, p.y - b0.cy);
          c.transform.scale = Math.max(0.05, Math.min(10, Math.round(t0.scale * (d1 / Math.max(1, d0)) * 100) / 100));
        } else {
          const a0 = Math.atan2(p0.y - b0.cy, p0.x - b0.cx);
          const a1 = Math.atan2(p.y - b0.cy, p.x - b0.cx);
          let r = t0.rotation + ((a1 - a0) * 180) / Math.PI;
          r = Math.round(r);
          for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(r - s) < 4) r = s;
          c.transform.rotation = r;
        }
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen();
  };

  const togglePlay = () => {
    const st = useStore.getState();
    if (!st.playing && st.currentTime >= duration - 0.01) st.seek(0);
    st.setPlaying(!st.playing);
  };

  const aspect = ASPECTS.find((a) => a.w * project.height === a.h * project.width);

  return (
    <div className="panel player" ref={wrapRef}>
      <div className="panel-head">
        <span>플레이어</span>
      </div>
      <div className="stage" ref={stageRef} onPointerDown={onStageDown}>
        <div className="canvas-wrap" style={{ width: size.w, height: size.h }}>
          <canvas ref={canvasRef} width={cw} height={ch} style={{ width: size.w, height: size.h }} />
          {box && sel && (
            <div
              className="sel-box"
              style={{
                left: (box.cx - box.w / 2) * scale,
                top: (box.cy - box.h / 2) * scale,
                width: box.w * scale,
                height: box.h * scale,
                transform: `rotate(${box.rotation}deg)`,
              }}
              onPointerDown={(e) => startDrag(e, sel.id, 'move')}
            >
              {['nw', 'ne', 'sw', 'se'].map((h) => (
                <div key={h} className={'handle ' + h} onPointerDown={(e) => startDrag(e, sel.id, 'scale')} />
              ))}
              <div className="rot-handle" onPointerDown={(e) => startDrag(e, sel.id, 'rotate')}>
                <Icon name="update" size={12} />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="player-bar">
        <div className="tc">
          <span className="tc-cur">{formatTime(currentTime, project.fps)}</span>
          <span className="tc-sep">/</span>
          <span className="tc-dur">{formatTime(duration, project.fps)}</span>
        </div>
        <button className="play-btn" onClick={togglePlay} title="재생/일시정지 (Space)">
          <Icon name={playing ? 'pause' : 'play'} size={18} />
        </button>
        <div className="player-right">
          <div className="ratio">
            <button className="ratio-btn" onClick={() => setRatioOpen(!ratioOpen)}>
              <Icon name="ratio" size={15} /> {aspect ? aspect.id : `${project.width}×${project.height}`}
            </button>
            {ratioOpen && (
              <div className="ratio-menu" onMouseLeave={() => setRatioOpen(false)}>
                {ASPECTS.map((a) => (
                  <button
                    key={a.id}
                    className={aspect?.id === a.id ? 'active' : ''}
                    onClick={() => {
                      setRatioOpen(false);
                      useStore.getState().apply((p) => {
                        p.width = a.w;
                        p.height = a.h;
                      });
                    }}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={toggleFull} title="전체 화면">
            <Icon name="fullscreen" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
