import React, { useState } from 'react';
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

function AssetCard({ a }: { a: Asset }) {
  const st = useStore.getState();
  const thumb = a.thumbs?.[Math.min(a.thumbs.length - 1, 1)];
  return (
    <div
      className="asset"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-studiom-asset', a.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDoubleClick={() => st.addAssetToTimeline(a.id)}
      title={a.name}
    >
      <div className="asset-thumb">
        {a.type === 'audio' ? (
          <div className="asset-audio">
            <Icon name="audio" size={26} />
          </div>
        ) : thumb ? (
          <img src={mediaUrl(thumb)} draggable={false} />
        ) : (
          <div className="asset-audio">
            <Icon name={a.type === 'image' ? 'image' : 'video'} size={26} />
          </div>
        )}
        {a.type !== 'image' && <span className="badge">{formatTime(a.duration, 30, false).replace(/^00:/, '')}</span>}
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
            st.removeAsset(a.id);
          }}
        >
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="asset-name">{a.name}</div>
    </div>
  );
}

function MediaTab() {
  const assets = useStore((s) => s.project.assets);
  const [filter, setFilter] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const drop = useDropImport();
  const list = assets.filter((a) => filter === 'all' || a.type === filter);
  return (
    <div className={'tab-content' + (drop.over ? ' drop-over' : '')} {...drop.props}>
      <button className="import-btn" onClick={async () => importFiles(await api.openMedia('media'))}>
        <Icon name="plus" size={18} /> 가져오기
      </button>
      <div className="chips">
        {(['all', 'video', 'image', 'audio'] as const).map((f) => (
          <button key={f} className={'chip' + (filter === f ? ' active' : '')} onClick={() => setFilter(f)}>
            {{ all: '전체', video: '동영상', image: '이미지', audio: '오디오' }[f]}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="empty">
          <Icon name="folder" size={36} />
          <p>파일을 여기로 끌어 놓거나<br />가져오기를 클릭하세요</p>
          <small>동영상 · 사진 · 음악</small>
        </div>
      ) : (
        <div className="asset-grid">
          {list.map((a) => (
            <AssetCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AudioTab() {
  const assets = useStore((s) => s.project.assets.filter((a) => a.type === 'audio'));
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
