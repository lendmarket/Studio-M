// 프로젝트 → FFmpeg filter_complex 변환 (메인 프로세스에서 사용, DOM 의존성 없음)
import type { Clip, ExportSettings, Project } from './types';
import { colorOps, ffmpegColorFilters, fmt } from './color';
import { resolveMotion } from './anim';

export interface ExportJob {
  project: Project;
  settings: ExportSettings;
  textImages: Record<string, string>; // clipId → PNG 경로
}

export interface BuiltGraph {
  args: string[]; // -filter_complex_script 경로는 '{GRAPH}' 자리표시자
  graph: string;
  duration: number;
}

function atempoChain(speed: number): string[] {
  const out: string[] = [];
  let s = speed;
  while (s > 2) {
    out.push('atempo=2');
    s /= 2;
  }
  while (s < 0.5) {
    out.push('atempo=0.5');
    s /= 0.5;
  }
  if (Math.abs(s - 1) > 1e-6) out.push(`atempo=${fmt(s)}`);
  return out;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function buildExport(job: ExportJob): BuiltGraph {
  const { project: p, settings: st } = job;
  const W = st.width;
  const H = st.height;
  const k = W / p.width;
  const fps = st.fps;
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  const tracks = new Map(p.tracks.map((t) => [t.id, t]));
  const duration = p.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  if (duration <= 0) throw new Error('타임라인이 비어 있습니다.');

  const inputs: string[] = [];
  const filters: string[] = [];
  let nInputs = 0;
  const addInput = (...a: string[]) => {
    inputs.push(...a);
    return nInputs++;
  };

  // 렌더 순서: 아래 트랙(메인) → 위 트랙, 트랙 안에서는 시작 순
  const visualTracks = p.tracks.filter((t) => t.type !== 'audio' && !t.hidden).reverse();
  const order: Clip[] = [];
  for (const t of visualTracks) {
    order.push(...p.clips.filter((c) => c.trackId === t.id).sort((a, b) => a.start - b.start));
  }

  const bg = /^#[0-9a-fA-F]{6}$/.test(p.background) ? '0x' + p.background.slice(1) : 'black';
  filters.push(`color=c=${bg}:s=${W}x${H}:r=${fps}:d=${fmt(duration)},format=yuv420p[base0]`);

  const videoInputIdx = new Map<string, number>();
  let n = 0;
  for (const c of order) {
    const asset = c.assetId ? assets.get(c.assetId) : undefined;
    const S = c.start;
    const E = c.start + c.duration;
    const D = fmt(c.duration);
    let idx: number;
    const chain: string[] = [];
    if (c.kind === 'video' && asset) {
      idx = addInput('-ss', fmt(c.inPoint), '-t', fmt(c.duration * c.speed + 0.1), '-i', asset.path);
      videoInputIdx.set(c.id, idx);
      chain.push(`setpts=(PTS-STARTPTS)/${fmt(c.speed)}`, `fps=${fps}`);
    } else if (c.kind === 'image' && asset) {
      idx = addInput('-loop', '1', '-framerate', String(fps), '-t', D, '-i', asset.path);
      chain.push('setpts=PTS-STARTPTS');
    } else if (c.kind === 'text' && job.textImages[c.id]) {
      idx = addInput('-loop', '1', '-framerate', String(fps), '-t', D, '-i', job.textImages[c.id]);
      chain.push('setpts=PTS-STARTPTS');
    } else continue;

    chain.push(`trim=duration=${D}`, 'format=rgba');
    if (c.kind !== 'text' && asset) {
      const s = Math.min(p.width / asset.width, p.height / asset.height) * c.transform.scale * k;
      chain.push(`scale=${even(asset.width * s)}:${even(asset.height * s)}:flags=bicubic`);
      chain.push(...ffmpegColorFilters(colorOps(c.adjust, c.filter)));
      if (c.transform.rotation % 360 !== 0) {
        const r = fmt((c.transform.rotation * Math.PI) / 180);
        chain.push(`rotate=${r}:c=none:ow=rotw(${r}):oh=roth(${r})`);
      }
    }
    if (c.transform.opacity < 1) chain.push(`colorchannelmixer=aa=${fmt(c.transform.opacity)}`);

    const m = resolveMotion(c);
    if (m.inDur > 0 && m.inDef.fade) chain.push(`fade=t=in:st=0:d=${fmt(m.inDur)}:alpha=1`);
    if (m.outDur > 0 && m.outDef.fade) chain.push(`fade=t=out:st=${fmt(c.duration - m.outDur)}:d=${fmt(m.outDur)}:alpha=1`);
    chain.push(`setpts=PTS+${fmt(S)}/TB`);
    filters.push(`[${idx}:v]${chain.join(',')}[v${n}]`);

    const X = c.kind === 'text' ? 0 : c.transform.x * k;
    const Y = c.kind === 'text' ? 0 : c.transform.y * k;
    const motion = (axis: 'dx' | 'dy', size: number) => {
      let e = '';
      if (m.inDur > 0 && m.inDef[axis]) {
        e += `+if(lt(t\\,${fmt(S + m.inDur)})\\,${fmt(m.inDef[axis] * size)}*pow(1-(t-${fmt(S)})/${fmt(m.inDur)}\\,2)\\,0)`;
      }
      if (m.outDur > 0 && m.outDef[axis]) {
        e += `-if(gt(t\\,${fmt(E - m.outDur)})\\,${fmt(m.outDef[axis] * size)}*pow(1-(${fmt(E)}-t)/${fmt(m.outDur)}\\,2)\\,0)`;
      }
      return e;
    };
    const xe = `(W-w)/2+${fmt(X)}${motion('dx', W)}`;
    const ye = `(H-h)/2+${fmt(Y)}${motion('dy', H)}`;
    filters.push(
      `[base${n}][v${n}]overlay=x=${xe}:y=${ye}:eof_action=pass:enable=between(t\\,${fmt(S)}\\,${fmt(E - 0.0001)})[base${n + 1}]`,
    );
    n++;
  }
  filters.push(`[base${n}]format=yuv420p[vout]`);

  // 오디오
  const aLabels: string[] = [];
  let an = 0;
  for (const c of p.clips) {
    const tr = tracks.get(c.trackId);
    if (!tr || tr.muted || c.muted || c.volume <= 0) continue;
    const asset = c.assetId ? assets.get(c.assetId) : undefined;
    if (!asset || !asset.hasAudio) continue;
    if (tr.hidden && c.kind !== 'audio') continue;
    let idx: number;
    if (c.kind === 'video') {
      const vi = videoInputIdx.get(c.id);
      idx = vi !== undefined ? vi : addInput('-ss', fmt(c.inPoint), '-t', fmt(c.duration * c.speed + 0.1), '-i', asset.path);
    } else if (c.kind === 'audio') {
      idx = addInput('-ss', fmt(c.inPoint), '-t', fmt(c.duration * c.speed + 0.1), '-i', asset.path);
    } else continue;
    const ch = ['asetpts=PTS-STARTPTS', 'aformat=sample_rates=48000:channel_layouts=stereo', ...atempoChain(c.speed)];
    ch.push(`atrim=duration=${fmt(c.duration)}`);
    if (c.volume !== 1) ch.push(`volume=${fmt(c.volume)}`);
    if (c.fadeIn > 0) ch.push(`afade=t=in:st=0:d=${fmt(Math.min(c.fadeIn, c.duration))}`);
    if (c.fadeOut > 0) ch.push(`afade=t=out:st=${fmt(Math.max(0, c.duration - c.fadeOut))}:d=${fmt(Math.min(c.fadeOut, c.duration))}`);
    const ms = Math.round(c.start * 1000);
    if (ms > 0) ch.push(`adelay=${ms}:all=1`);
    filters.push(`[${idx}:a]${ch.join(',')}[a${an}]`);
    aLabels.push(`[a${an}]`);
    an++;
  }
  if (aLabels.length === 0) {
    const idx = addInput('-f', 'lavfi', '-t', fmt(duration), '-i', 'anullsrc=r=48000:cl=stereo');
    filters.push(`[${idx}:a]anull[aout]`);
  } else {
    const head =
      aLabels.length > 1
        ? `${aLabels.join('')}amix=inputs=${aLabels.length}:normalize=0:duration=longest:dropout_transition=0,`
        : `${aLabels[0]}`;
    filters.push(`${head}apad=whole_dur=${fmt(duration)},atrim=duration=${fmt(duration)}[aout]`);
  }

  const graph = filters.join(';\n');
  const args = [
    '-y',
    '-hide_banner',
    '-nostats',
    '-progress',
    'pipe:1',
    ...inputs,
    '-filter_complex_script',
    '{GRAPH}',
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    String(st.crf),
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-t',
    fmt(duration),
    st.outPath,
  ];
  return { args, graph, duration };
}
