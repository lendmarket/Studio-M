import React, { useEffect, useRef, useState } from 'react';
import { useStore, LeftTab } from '../store';
import { Icon } from './Icons';
import { api } from '../api';
import { importFiles } from '../media';
import { mediaUrl } from '../engine/preview';
import { STICKERS, TEXT_PRESETS, DEFAULT_TEXT } from '../core/text';
import { FILTER_PRESETS } from '../core/color';
import { TRANSITION_LABELS } from '../core/anim';
import { formatTime, mainTrack, maxTransition } from '../core/project';
import type { Asset } from '../core/types';

const TABS: { id: LeftTab; label: string; icon: string }[] = [
  { id: 'media', label: '미디어', icon: 'media' },
  { id: 'audio', label: '오디오', icon: 'audio' },
  { id: 'text', label: '텍스트', icon: 'text' },
  { id: 'sticker', label: '스티커', icon: 'sticker' },
  { id: 'transition', label: '전환', icon: 'transition' },
  { id: 'filter', label: '필터', icon: 'filter' },
];

export default function LeftPanel() {
  const tab = useStore((s) => s.leftTab);
  return (
    <div className="panel left-panel">
      <div className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => useStore.getState().set({ leftTab: t.id })}>
            <Icon name={t.icon} size={20} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'media' && <MediaTab />}
        {tab === 'audio' && <AudioTab />}
        {tab === 'text' && <TextTab />}
        {tab === 'sticker' && <StickerTab />}
        {tab === 'transition' && <TransitionTab />}
        {tab === 'filter' && <FilterTab />}
      </div>
    </div>
  );
}

function useDropImport() {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        const paths = Array.from(e.dataTransfer.files).map((f) => api.pathForFile(f)).filter(Boolean);
        importFiles(paths);
      },
    },
  };
}

const TYPE_LABEL: Record<string, string> = { video: '동영상', image: '이미지', audio: '오디오' };

/** 여러 미디어를 차례대로 타임라인에 추가 (영상·이미지는 메인 트랙 끝에 이어서, 오디오는 재생헤드부터 이어서) */
function addManyToTimeline(ids: string[]) {
  const st = useStore.getState();
  let audioAt = st.currentTime;
  for (const id of ids) {
    const a = useStore.getState().project.assets.find((x) => x.id === id);
    if (!a) continue;
    if (a.type === 'audio') {
      useStore.getState().addAssetToTimeline(id, { start: audioAt });
      audioAt += a.duration;
    } else useStore.getState().addAssetToTimeline(id);
  }
}

/** 미디어 삭제 — 타임라인에 쓰인 클립도 지워지므로 그때만 확인 */
async function removeMany(ids: string[]) {
  const st = useStore.getState();
  const set1 = new Set(ids);
  const used = st.project.clips.filter((c) => c.assetId && set1.has(c.assetId)).length;
  if (used) {
    const r = await api.confirm(
      `미디어 ${ids.length}개를 삭제할까요?`,
      ['삭제', '취소'],
      `타임라인에서 쓰고 있는 클립 ${used}개도 함께 지워집니다. 삭제 후 Ctrl+Z로 되돌릴 수 있습니다.`,
    );
    if (r !== 0) return false;
  }
  st.removeAssets(ids);
  return true;
}

interface ItemProps {
  a: Asset;
  view: 'grid' | 'list';
  selected: boolean;
  selectedIds: string[];
  onPick: (e: React.MouseEvent, id: string) => void;
}

function AssetItem({ a, view, selected, selectedIds, onPick }: ItemProps) {
  const st = useStore.getState();
  const thumb = a.thumbs?.[Math.min(a.thumbs.length - 1, 1)];
  const dur = a.type !== 'image' ? formatTime(a.duration, 30, false).replace(/^00:/, '') : '';
  const thumbEl =
    a.type === 'audio' ? (
      <div className="asset-audio">
        <Icon name="audio" size={view === 'grid' ? 26 : 16} />
      </div>
    ) : thumb ? (
      <img src={mediaUrl(thumb)} draggable={false} />
    ) : (
      <div className="asset-audio">
        <Icon name={a.type === 'image' ? 'image' : 'video'} size={view === 'grid' ? 26 : 16} />
      </div>
    );
  const actions = (
    <>
      <button
        className="asset-add"
        title="타임라인에 추가"
        onClick={(e) => {
          e.stopPropagation();
          st.addAssetToTimeline(a.id);
        }}
      >
        <Icon name="plus" size={14} />
      </button>
      <button
        className="asset-del"
        title="삭제"
        onClick={(e) => {
          e.stopPropagation();
          removeMany([a.id]);
        }}
      >
        <Icon name="close" size={12} />
      </button>
    </>
  );
  return (
    <div
      className={(view === 'grid' ? 'asset' : 'asset-row') + (selected ? ' sel' : '')}
      data-asset-id={a.id}
      draggable
      onDragStart={(e) => {
        // 선택된 항목을 끌면 선택한 것 전부, 아니면 이것 하나
        const ids = selected ? selectedIds : [a.id];
        e.dataTransfer.setData('application/x-studiom-asset', ids.join('\n'));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={(e) => onPick(e, a.id)}
      onDoubleClick={() => st.addAssetToTimeline(a.id)}
      title={a.name}
    >
      {view === 'grid' ? (
        <>
          <div className="asset-thumb">
            {thumbEl}
            {dur && <span className="badge">{dur}</span>}
            {actions}
          </div>
          <div className="asset-name">{a.name}</div>
        </>
      ) : (
        <>
          <div className="row-thumb">{thumbEl}</div>
          <div className="row-name">{a.name}</div>
          <span className="row-type">{TYPE_LABEL[a.type]}</span>
          <span className="row-dur">{dur || '—'}</span>
          <div className="row-actions">{actions}</div>
        </>
      )}
    </div>
  );
}

function MediaTab() {
  const assets = useStore((s) => s.project.assets);
  const [filter, setFilter] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('studiom.mediaView') === 'list' ? 'list' : 'grid'));
  const [sel, setSel] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const drop = useDropImport();
  const list = assets.filter((a) => filter === 'all' || a.type === filter);

  // 지워졌거나 필터로 숨은 항목은 선택에서 뺌
  useEffect(() => {
    const vis = new Set(list.map((a) => a.id));
    setSel((s) => (s.every((id) => vis.has(id)) ? s : s.filter((id) => vis.has(id))));
  }, [assets, filter]);

  const changeView = (v: 'grid' | 'list') => {
    setView(v);
    localStorage.setItem('studiom.mediaView', v);
  };

  /** 클릭: 하나 선택 / Ctrl: 더하기·빼기 / Shift: 범위 */
  const onPick = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey && anchor) {
      const i0 = list.findIndex((a) => a.id === anchor);
      const i1 = list.findIndex((a) => a.id === id);
      if (i0 >= 0 && i1 >= 0) {
        const range = list.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).map((a) => a.id);
        setSel((s) => (e.ctrlKey ? Array.from(new Set([...s, ...range])) : range));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else setSel([id]);
    setAnchor(id);
  };

  /** 빈 곳에서 끌면 사각형 안의 항목을 선택 (Ctrl을 누르고 끌면 기존 선택에 더함) */
  const onAreaDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-asset-id], button')) return;
    const area = areaRef.current!;
    const r0 = area.getBoundingClientRect();
    const sx = e.clientX - r0.left + area.scrollLeft;
    const sy = e.clientY - r0.top + area.scrollTop;
    const base = e.ctrlKey || e.metaKey ? sel : [];
    let moved = false;
    const move = (ev: PointerEvent) => {
      const r = area.getBoundingClientRect();
      const cx = ev.clientX - r.left + area.scrollLeft;
      const cy = ev.clientY - r.top + area.scrollTop;
      const b = { x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) };
      if (!moved && b.w + b.h < 4) return;
      moved = true;
      setBox(b);
      const hit: string[] = [];
      area.querySelectorAll<HTMLElement>('[data-asset-id]').forEach((el) => {
        const er = el.getBoundingClientRect();
        const ex = er.left - r.left + area.scrollLeft;
        const ey = er.top - r.top + area.scrollTop;
        if (ex < b.x + b.w && ex + er.width > b.x && ey < b.y + b.h && ey + er.height > b.y) hit.push(el.dataset.assetId!);
      });
      setSel(Array.from(new Set([...base, ...hit])));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setBox(null);
      if (!moved) setSel(base); // 빈 곳 클릭 = 선택 해제
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      setSel(list.map((a) => a.id));
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) {
      e.preventDefault();
      e.stopPropagation(); // 타임라인 클립 삭제 단축키와 겹치지 않게
      removeMany(sel).then((ok) => ok && setSel([]));
    } else if (e.key === 'Escape') setSel([]);
  };

  const ordered = list.filter((a) => sel.includes(a.id)).map((a) => a.id); // 화면 순서대로

  return (
    <div className={'tab-content media-tab' + (drop.over ? ' drop-over' : '')} {...drop.props}>
      <button className="import-btn" onClick={async () => importFiles(await api.openMedia('media'))}>
        <Icon name="plus" size={18} /> 가져오기
      </button>
      <div className="media-bar">
        <div className="chips">
          {(['all', 'video', 'image', 'audio'] as const).map((f) => (
            <button key={f} className={'chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>
              {{ all: '전체', video: '동영상', image: '이미지', audio: '오디오' }[f]}
            </button>
          ))}
        </div>
        <div className="view-toggle">
          <button className={view === 'grid' ? 'on' : ''} title="미리보기형" onClick={() => changeView('grid')}>
            <Icon name="grid" size={14} />
          </button>
          <button className={view === 'list' ? 'on' : ''} title="목록형" onClick={() => changeView('list')}>
            <Icon name="list" size={14} />
          </button>
        </div>
      </div>
      {sel.length > 0 && (
        <div className="sel-bar">
          <b>{sel.length}개 선택</b>
          <button className="btn primary sm" onClick={() => addManyToTimeline(ordered)}>
            <Icon name="plus" size={13} /> 타임라인에 추가
          </button>
          <button className="btn ghost sm danger" onClick={() => removeMany(ordered).then((ok) => ok && setSel([]))}>
            삭제
          </button>
          <button className="link" onClick={() => setSel([])}>
            선택 해제
          </button>
        </div>
      )}
      {list.length === 0 ? (
        <div className="empty">
          <Icon name="folder" size={36} />
          <p>파일을 여기로 끌어 놓거나<br />가져오기를 클릭하세요</p>
          <small>동영상 · 사진 · 음악</small>
        </div>
      ) : (
        <div className="asset-area" ref={areaRef} tabIndex={0} onPointerDown={onAreaDown} onKeyDown={onKey}>
          <div className={view === 'grid' ? 'asset-grid' : 'asset-list'}>
            {list.map((a) => (
              <AssetItem key={a.id} a={a} view={view} selected={sel.includes(a.id)} selectedIds={ordered} onPick={onPick} />
            ))}
          </div>
          {box && <div className="sel-rect" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
          <small className="muted area-hint">빈 곳에서 끌어서 여러 개 선택 · Ctrl/Shift+클릭 · Ctrl+A 전체 · Delete 삭제 · 더블클릭 또는 끌어서 타임라인에 추가</small>
        </div>
      )}
    </div>
  );
}

function AudioTab() {
  // 선택자에서 새 배열을 만들면 zustand 5에서 무한 렌더(React #185) → 원본을 받아서 거름
  const all = useStore((s) => s.project.assets);
  const assets = all.filter((a) => a.type === 'audio');
  const drop = useDropImport();
  return (
    <div className={'tab-content' + (drop.over ? ' drop-over' : '')} {...drop.props}>
      <button className="import-btn" onClick={async () => importFiles(await api.openMedia('audio'))}>
        <Icon name="plus" size={18} /> 음악/효과음 가져오기
      </button>
      {assets.length === 0 ? (
        <div className="empty">
          <Icon name="audio" size={36} />
          <p>MP3, WAV, M4A 등의<br />오디오 파일을 가져오세요</p>
        </div>
      ) : (
        <div className="audio-list">
          {assets.map((a) => (
            <div
              key={a.id}
              className="audio-row"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-studiom-asset', a.id)}
              onDoubleClick={() => useStore.getState().addAssetToTimeline(a.id)}
            >
              <div className="audio-ico">
                <Icon name="audio" size={18} />
              </div>
              <div className="audio-meta">
                <div className="audio-name">{a.name}</div>
                <div className="audio-dur">{formatTime(a.duration, 30, false)}</div>
              </div>
              <button className="icon-btn" title="재생헤드 위치에 추가" onClick={() => useStore.getState().addAssetToTimeline(a.id)}>
                <Icon name="plus" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TextTab() {
  return (
    <div className="tab-content">
      <button className="import-btn" onClick={() => useStore.getState().addText({}, '텍스트')}>
        <Icon name="plus" size={18} /> 기본 텍스트 추가
      </button>
      <div className="section-title">텍스트 스타일</div>
      <div className="text-grid">
        {TEXT_PRESETS.map((p) => {
          const s = { ...DEFAULT_TEXT, ...p.style };
          const style: React.CSSProperties = {
            fontFamily: `"${s.fontFamily}", "Malgun Gothic", sans-serif`,
            fontWeight: s.bold ? 700 : 400,
            fontStyle: s.italic ? 'italic' : 'normal',
            color: s.color,
            WebkitTextStroke: s.strokeWidth ? `${Math.min(3, s.strokeWidth / 3)}px ${s.strokeColor}` : undefined,
            paintOrder: 'stroke fill',
            background: s.bgOpacity ? s.bgColor : undefined,
            padding: s.bgOpacity ? '2px 8px' : undefined,
            borderRadius: 4,
            textShadow: s.shadow ? '0 2px 6px rgba(0,0,0,.7)' : undefined,
          };
          return (
            <button key={p.id} className="text-card" onClick={() => useStore.getState().addText(p.style, p.name, p.y)}>
              <span style={style}>{p.id === 'default' ? '텍스트' : (p.style.content as string).slice(0, 8)}</span>
              <small>{p.name}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StickerTab() {
  return (
    <div className="tab-content">
      <div className="section-title">이모지 스티커</div>
      <div className="sticker-grid">
        {STICKERS.map((s) => (
          <button key={s} className="sticker" onClick={() => useStore.getState().addText({ content: s, fontSize: 220, bold: false }, '스티커 ' + s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function TransitionTab() {
  const sel = useStore((s) => s.project.clips.find((c) => c.id === s.selectedId));
  const project = useStore((s) => s.project);
  const main = mainTrack(project);
  const mains = project.clips.filter((c) => c.trackId === main.id).sort((a, b) => a.start - b.start);
  const idx = sel ? mains.findIndex((c) => c.id === sel.id) : -1;
  const canApply = idx > 0;
  const apply = (type: any) => {
    if (!canApply || !sel) return useStore.getState().showToast('메인 트랙에서 두 번째 이후 클립을 선택하세요');
    const prev = mains[idx - 1];
    useStore.getState().updateClip(sel.id, (c) => {
      c.transition = type ? { type, duration: Math.min(c.transition?.duration ?? 0.6, maxTransition(prev, c)) } : null;
    });
  };
  return (
    <div className="tab-content">
      <p className="hint">메인 트랙의 클립을 선택하면, 앞 클립에서 해당 클립으로 넘어가는 전환이 적용됩니다.</p>
      <div className="fx-grid">
        <button className={'fx-card' + (canApply && !sel?.transition ? ' active' : '')} onClick={() => apply(null)}>
          <div className="fx-thumb none">∅</div>
          <small>없음</small>
        </button>
        {TRANSITION_LABELS.map((t) => (
          <button key={t.id} className={'fx-card' + (sel?.transition?.type === t.id ? ' active' : '')} onClick={() => apply(t.id)}>
            <div className={'fx-thumb tr-' + t.id}>
              <span>{t.icon}</span>
            </div>
            <small>{t.name}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterTab() {
  const sel = useStore((s) => s.project.clips.find((c) => c.id === s.selectedId));
  const visual = sel && (sel.kind === 'video' || sel.kind === 'image');
  const apply = (id: string | null) => {
    if (!visual || !sel) return useStore.getState().showToast('동영상 또는 이미지 클립을 선택하세요');
    useStore.getState().updateClip(sel.id, (c) => {
      c.filter = id ? { id, intensity: c.filter?.intensity ?? 100 } : null;
    });
  };
  return (
    <div className="tab-content">
      <p className="hint">클립을 선택한 뒤 필터를 클릭하세요. 강도는 오른쪽 '조정' 탭에서 바꿀 수 있습니다.</p>
      <div className="fx-grid">
        <button className={'fx-card' + (visual && !sel?.filter ? ' active' : '')} onClick={() => apply(null)}>
          <div className="fx-thumb none">∅</div>
          <small>없음</small>
        </button>
        {FILTER_PRESETS.map((f) => (
          <button key={f.id} className={'fx-card' + (sel?.filter?.id === f.id ? ' active' : '')} onClick={() => apply(f.id)}>
            <div className="fx-thumb" style={{ background: f.swatch }} />
            <small>{f.name}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
