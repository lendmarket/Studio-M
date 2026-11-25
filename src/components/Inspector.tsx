import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { Anim, Clip, Project } from '../core/types';
import { ANIM_LABELS, TRANSITION_LABELS } from '../core/anim';
import { FILTER_PRESETS, NEUTRAL_ADJUST } from '../core/color';
import { FONT_LIST } from '../core/text';
import { ASPECTS, mainTrack, maxTransition } from '../core/project';
import { PLATFORMS } from '../core/platforms';
import { Icon } from './Icons';

type Tab = 'basic' | 'text' | 'audio' | 'speed' | 'anim' | 'adjust' | 'project';

const edit = (id: string, fn: (c: Clip) => void) =>
  useStore.getState().mutate((p) => {
    const c = p.clips.find((x) => x.id === id);
    if (c) fn(c);
  }, true);
const checkpoint = () => useStore.getState().checkpoint();

/** 드래그 1회 = 실행취소 1단계 */
function Slider(props: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; reset?: number }) {
  const { label, value, min, max, step = 1, unit = '', onChange, reset } = props;
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="row slider-row">
      <label onDoubleClick={() => reset !== undefined && (checkpoint(), onChange(reset))} title={reset !== undefined ? '더블클릭하여 초기화' : ''}>
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--pct' as any]: `${pct}%` }}
        onPointerDown={checkpoint}
        onKeyDown={checkpoint}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <div className="num">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = parseFloat(text);
            if (!isNaN(v)) {
              checkpoint();
              onChange(Math.max(min, Math.min(max, v)));
            } else setText(String(value));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {unit && <span>{unit}</span>}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row">
      <label>{label}</label>
      <button className={'switch' + (value ? ' on' : '')} onClick={() => (checkpoint(), onChange(!value))}>
        <span />
      </button>
    </div>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="row">
      <label>{label}</label>
      <div className="color-input">
        <input type="color" value={value} onPointerDown={checkpoint} onChange={(e) => onChange(e.target.value)} />
        <span>{value.toUpperCase()}</span>
      </div>
    </div>
  );
}

function Section({ title, children, onReset }: { title: string; children: React.ReactNode; onReset?: () => void }) {
  return (
    <div className="section">
      <div className="section-head">
        <span>{title}</span>
        {onReset && (
          <button className="link" onClick={() => (checkpoint(), onReset())}>
            초기화
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export default function Inspector() {
  const project = useStore((s) => s.project);
  const clip = useStore((s) => s.project.clips.find((c) => c.id === s.selectedId));
  const tabs: { id: Tab; label: string }[] = !clip
    ? [{ id: 'project', label: '프로젝트' }]
    : clip.kind === 'video'
      ? [
          { id: 'basic', label: '동영상' },
          { id: 'audio', label: '오디오' },
          { id: 'speed', label: '속도' },
          { id: 'anim', label: '애니메이션' },
          { id: 'adjust', label: '조정' },
        ]
      : clip.kind === 'image'
        ? [
            { id: 'basic', label: '이미지' },
            { id: 'anim', label: '애니메이션' },
            { id: 'adjust', label: '조정' },
          ]
        : clip.kind === 'audio'
          ? [
              { id: 'audio', label: '오디오' },
              { id: 'speed', label: '속도' },
            ]
          : [
              { id: 'text', label: '텍스트' },
              { id: 'basic', label: '변형' },
              { id: 'anim', label: '애니메이션' },
            ];
  const [tab, setTab] = useState<Tab>(tabs[0].id);
  const active = tabs.find((t) => t.id === tab) ? tab : tabs[0].id;

  return (
    <div className="panel inspector">
      <div className="panel-head tabs-head">
        {tabs.map((t) => (
          <button key={t.id} className={'ins-tab' + (active === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-body ins-body">
        {!clip && <ProjectTab p={project} />}
        {clip && active === 'basic' && <BasicTab c={clip} />}
        {clip && active === 'text' && <TextTab c={clip} />}
        {clip && active === 'audio' && <AudioTab c={clip} />}
        {clip && active === 'speed' && <SpeedTab c={clip} p={project} />}
        {clip && active === 'anim' && <AnimTab c={clip} p={project} />}
        {clip && active === 'adjust' && <AdjustTab c={clip} />}
      </div>
    </div>
  );
}

function ProjectTab({ p }: { p: Project }) {
  const set = (fn: (p: Project) => void) => useStore.getState().apply(fn);
  return (
    <>
      <Section title="프로젝트 설정">
        <div className="row">
          <label>이름</label>
          <input className="text-input" value={p.name} onChange={(e) => useStore.getState().mutate((x) => (x.name = e.target.value))} />
        </div>
        <div className="row">
          <label>플랫폼</label>
          <select
            value={p.platform || 'custom'}
            onChange={(e) => {
              const pf = PLATFORMS.find((x) => x.id === e.target.value);
              set((x) => {
                x.platform = e.target.value;
                if (pf) {
                  x.width = pf.w;
                  x.height = pf.h;
                }
              });
            }}
          >
            {PLATFORMS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({x.desc.split(' · ')[0]})
              </option>
            ))}
            <option value="custom">사용자 지정</option>
          </select>
        </div>
        <div className="row">
          <label>화면 비율</label>
          <select
            value={ASPECTS.find((a) => a.w === p.width && a.h === p.height)?.id || ''}
            onChange={(e) => {
              const a = ASPECTS.find((x) => x.id === e.target.value)!;
              set((x) => {
                x.width = a.w;
                x.height = a.h;
                const cur = PLATFORMS.find((q) => q.id === x.platform);
                if (!cur || cur.w * a.h !== cur.h * a.w) x.platform = 'custom';
              });
            }}
          >
            {!ASPECTS.find((a) => a.w === p.width && a.h === p.height) && <option value="">{`${p.width}×${p.height}`}</option>}
            {ASPECTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <label>프레임 속도</label>
          <select value={p.fps} onChange={(e) => set((x) => (x.fps = parseInt(e.target.value, 10)))}>
            {[24, 25, 30, 50, 60].map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </div>
        <Color label="배경 색상" value={p.background} onChange={(v) => useStore.getState().mutate((x) => (x.background = v))} />
      </Section>
      <div className="ins-empty">
        <Icon name="cursor" size={28} />
        <p>타임라인에서 클립을 선택하면
          <br />
          여기에서 세부 속성을 편집할 수 있습니다.
        </p>
      </div>
    </>
  );
}

function BasicTab({ c }: { c: Clip }) {
  const t = c.transform;
  return (
    <>
      <Section title="변형" onReset={() => edit(c.id, (x) => (x.transform = { ...x.transform, x: 0, y: 0, scale: 1, rotation: 0 }))}>
        <Slider label="크기" value={Math.round(t.scale * 100)} min={5} max={500} unit="%" reset={100} onChange={(v) => edit(c.id, (x) => (x.transform.scale = v / 100))} />
        <Slider label="위치 X" value={t.x} min={-4000} max={4000} reset={0} onChange={(v) => edit(c.id, (x) => (x.transform.x = v))} />
        <Slider label="위치 Y" value={t.y} min={-4000} max={4000} reset={0} onChange={(v) => edit(c.id, (x) => (x.transform.y = v))} />
        <Slider label="회전" value={t.rotation} min={-360} max={360} unit="°" reset={0} onChange={(v) => edit(c.id, (x) => (x.transform.rotation = v))} />
        <div className="row btn-row">
          <button className="small-btn" onClick={() => (checkpoint(), edit(c.id, (x) => (x.transform.x = 0)))}>가로 중앙</button>
          <button className="small-btn" onClick={() => (checkpoint(), edit(c.id, (x) => (x.transform.y = 0)))}>세로 중앙</button>
          <button className="small-btn" onClick={() => (checkpoint(), edit(c.id, (x) => (x.transform.rotation = (x.transform.rotation + 90) % 360)))}>90° 회전</button>
        </div>
      </Section>
      <Section title="혼합">
        <Slider label="불투명도" value={Math.round(t.opacity * 100)} min={0} max={100} unit="%" reset={100} onChange={(v) => edit(c.id, (x) => (x.transform.opacity = v / 100))} />
      </Section>
      {c.kind === 'video' && (
        <Section title="편집">
          <div className="row btn-row">
            <button className="small-btn" onClick={() => useStore.getState().detachAudio()}>
              <Icon name="detach" size={14} /> 오디오 분리
            </button>
            <button className="small-btn" onClick={() => useStore.getState().duplicateSelected()}>
              <Icon name="copy" size={14} /> 복제
            </button>
          </div>
        </Section>
      )}
    </>
  );
}

function TextTab({ c }: { c: Clip }) {
  const s = c.text!;
  const setS = (fn: (s: NonNullable<Clip['text']>) => void) => edit(c.id, (x) => fn(x.text!));
  return (
    <>
      <Section title="텍스트">
        <textarea
          className="text-area"
          value={s.content}
          onFocus={checkpoint}
          onChange={(e) => {
            const v = e.target.value;
            setS((t) => (t.content = v));
          }}
          rows={3}
        />
        <div className="row">
          <label>글꼴</label>
          <select value={s.fontFamily} onChange={(e) => (checkpoint(), setS((t) => (t.fontFamily = e.target.value)))}>
            {FONT_LIST.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <Slider label="글자 크기" value={s.fontSize} min={8} max={400} reset={80} onChange={(v) => setS((t) => (t.fontSize = v))} />
        <div className="row">
          <label>스타일</label>
          <div className="seg">
            <button className={s.bold ? 'on' : ''} onClick={() => (checkpoint(), setS((t) => (t.bold = !t.bold)))}>
              <b>B</b>
            </button>
            <button className={s.italic ? 'on' : ''} onClick={() => (checkpoint(), setS((t) => (t.italic = !t.italic)))}>
              <i>I</i>
            </button>
          </div>
          <div className="seg">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={s.align === a ? 'on' : ''} onClick={() => (checkpoint(), setS((t) => (t.align = a)))}>
                {{ left: '왼쪽', center: '가운데', right: '오른쪽' }[a]}
              </button>
            ))}
          </div>
        </div>
        <Color label="글자 색상" value={s.color} onChange={(v) => setS((t) => (t.color = v))} />
        <Slider label="자간" value={s.letterSpacing} min={-20} max={100} reset={0} onChange={(v) => setS((t) => (t.letterSpacing = v))} />
        <Slider label="줄 간격" value={Math.round(s.lineHeight * 100)} min={70} max={300} unit="%" reset={120} onChange={(v) => setS((t) => (t.lineHeight = v / 100))} />
      </Section>
      <Section title="외곽선">
        <Slider label="두께" value={s.strokeWidth} min={0} max={30} reset={0} onChange={(v) => setS((t) => (t.strokeWidth = v))} />
        <Color label="색상" value={s.strokeColor} onChange={(v) => setS((t) => (t.strokeColor = v))} />
      </Section>
      <Section title="배경">
        <Slider label="불투명도" value={Math.round(s.bgOpacity * 100)} min={0} max={100} unit="%" reset={0} onChange={(v) => setS((t) => (t.bgOpacity = v / 100))} />
        <Color label="색상" value={s.bgColor} onChange={(v) => setS((t) => (t.bgColor = v))} />
      </Section>
      <Section title="효과">
        <Toggle label="그림자" value={s.shadow} onChange={(v) => setS((t) => (t.shadow = v))} />
        <Slider label="불투명도" value={Math.round(c.transform.opacity * 100)} min={0} max={100} unit="%" reset={100} onChange={(v) => edit(c.id, (x) => (x.transform.opacity = v / 100))} />
      </Section>
    </>
  );
}

function AudioTab({ c }: { c: Clip }) {
  return (
    <>
      <Section title="기본">
        <Toggle label="음소거" value={c.muted} onChange={(v) => edit(c.id, (x) => (x.muted = v))} />
        <Slider label="볼륨" value={Math.round(c.volume * 100)} min={0} max={200} unit="%" reset={100} onChange={(v) => edit(c.id, (x) => (x.volume = v / 100))} />
        <Slider label="페이드 인" value={c.fadeIn} min={0} max={Math.min(10, c.duration)} step={0.1} unit="초" reset={0} onChange={(v) => edit(c.id, (x) => (x.fadeIn = v))} />
        <Slider label="페이드 아웃" value={c.fadeOut} min={0} max={Math.min(10, c.duration)} step={0.1} unit="초" reset={0} onChange={(v) => edit(c.id, (x) => (x.fadeOut = v))} />
      </Section>
      {c.kind === 'video' && (
        <Section title="오디오 분리">
          <p className="hint">동영상의 소리를 별도 오디오 트랙으로 분리합니다.</p>
          <button className="small-btn wide" onClick={() => useStore.getState().detachAudio()}>
            <Icon name="detach" size={14} /> 오디오 분리
          </button>
        </Section>
      )}
    </>
  );
}

function SpeedTab({ c, p }: { c: Clip; p: Project }) {
  const asset = p.assets.find((a) => a.id === c.assetId);
  const setSpeed = (v: number) =>
    edit(c.id, (x) => {
      const src = x.duration * x.speed;
      x.speed = v;
      x.duration = Math.max(0.05, src / v);
      if (asset && asset.duration) x.duration = Math.min(x.duration, (asset.duration - x.inPoint) / v);
    });
  return (
    <Section title="일반 속도">
      <Slider label="배속" value={c.speed} min={0.1} max={10} step={0.05} unit="x" reset={1} onChange={setSpeed} />
      <div className="speed-presets">
        {[0.25, 0.5, 1, 1.5, 2, 3, 5].map((v) => (
          <button key={v} className={'chip' + (Math.abs(c.speed - v) < 1e-3 ? ' active' : '')} onClick={() => (checkpoint(), setSpeed(v))}>
            {v}x
          </button>
        ))}
      </div>
      <p className="hint">길이: {(c.duration).toFixed(2)}초 (원본 {(c.duration * c.speed).toFixed(2)}초)</p>
    </Section>
  );
}

function AnimRow({ label, a, onChange, max }: { label: string; a: Anim; onChange: (a: Anim) => void; max: number }) {
  return (
    <Section title={label}>
      <div className="anim-grid">
        {ANIM_LABELS.map((x) => (
          <button key={x.id} className={'anim-card' + (a.type === x.id ? ' active' : '')} onClick={() => (checkpoint(), onChange({ ...a, type: x.id }))}>
            <div className={'anim-thumb an-' + x.id}>
              <span />
            </div>
            <small>{x.name}</small>
          </button>
        ))}
      </div>
      {a.type !== 'none' && (
        <Slider label="길이" value={a.duration} min={0.1} max={Math.max(0.1, max)} step={0.1} unit="초" reset={0.5} onChange={(v) => onChange({ ...a, duration: v })} />
      )}
    </Section>
  );
}

function AnimTab({ c, p }: { c: Clip; p: Project }) {
  const main = mainTrack(p);
  const mains = p.clips.filter((x) => x.trackId === main.id).sort((a, b) => a.start - b.start);
  const idx = mains.findIndex((x) => x.id === c.id);
  const prev = idx > 0 ? mains[idx - 1] : null;
  return (
    <>
      <AnimRow label="들어오기" a={c.animIn} max={c.duration / 2} onChange={(a) => edit(c.id, (x) => (x.animIn = a))} />
      <AnimRow label="나가기" a={c.animOut} max={c.duration / 2} onChange={(a) => edit(c.id, (x) => (x.animOut = a))} />
      {prev && (
        <Section title="전환 (앞 클립 → 이 클립)">
          <div className="row">
            <label>종류</label>
            <select
              value={c.transition?.type || ''}
              onChange={(e) => {
                checkpoint();
                const v = e.target.value as any;
                edit(c.id, (x) => (x.transition = v ? { type: v, duration: Math.min(x.transition?.duration ?? 0.6, maxTransition(prev, x)) } : null));
              }}
            >
              <option value="">없음</option>
              {TRANSITION_LABELS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {c.transition && (
            <Slider
              label="길이"
              value={c.transition.duration}
              min={0.1}
              max={Math.max(0.1, maxTransition(prev, c))}
              step={0.05}
              unit="초"
              onChange={(v) => edit(c.id, (x) => x.transition && (x.transition.duration = v))}
            />
          )}
        </Section>
      )}
    </>
  );
}

function AdjustTab({ c }: { c: Clip }) {
  const a = c.adjust;
  const set = (k: keyof typeof a) => (v: number) => edit(c.id, (x) => (x.adjust[k] = v));
  return (
    <>
      <Section title="필터">
        <div className="row">
          <label>필터</label>
          <select
            value={c.filter?.id || ''}
            onChange={(e) => {
              checkpoint();
              const v = e.target.value;
              edit(c.id, (x) => (x.filter = v ? { id: v, intensity: x.filter?.intensity ?? 100 } : null));
            }}
          >
            <option value="">없음</option>
            {FILTER_PRESETS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        {c.filter && <Slider label="강도" value={c.filter.intensity} min={0} max={100} reset={100} onChange={(v) => edit(c.id, (x) => x.filter && (x.filter.intensity = v))} />}
      </Section>
      <Section title="기본 조정" onReset={() => edit(c.id, (x) => (x.adjust = { ...NEUTRAL_ADJUST }))}>
        <Slider label="밝기" value={a.brightness} min={-100} max={100} reset={0} onChange={set('brightness')} />
        <Slider label="대비" value={a.contrast} min={-100} max={100} reset={0} onChange={set('contrast')} />
        <Slider label="채도" value={a.saturation} min={-100} max={100} reset={0} onChange={set('saturation')} />
        <Slider label="색조" value={a.hue} min={-180} max={180} unit="°" reset={0} onChange={set('hue')} />
        <Slider label="색온도" value={a.temperature} min={-100} max={100} reset={0} onChange={set('temperature')} />
        <Slider label="틴트" value={a.tint} min={-100} max={100} reset={0} onChange={set('tint')} />
      </Section>
    </>
  );
}
