import type { Asset, Clip, Project } from '../core/types';
import { colorOps } from '../core/color';
import { motionAt } from '../core/anim';
import { drawTextClip } from '../core/text';
import { fitSize } from '../core/geometry';

export const mediaUrl = (p: string) => 'smedia://local/' + encodeURIComponent(p);

interface Entry {
  el: HTMLVideoElement | HTMLAudioElement | HTMLImageElement;
  src: string;
  gain?: GainNode;
  kind: 'video' | 'audio' | 'image';
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export class PreviewEngine {
  private entries = new Map<string, Entry>();
  private actx: AudioContext | null = null;
  private svg: SVGSVGElement;
  private filterKeys = new Map<string, string>();

  constructor() {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('width', '0');
    this.svg.setAttribute('height', '0');
    this.svg.style.position = 'absolute';
    document.body.appendChild(this.svg);
  }

  private audio() {
    if (!this.actx) this.actx = new AudioContext();
    return this.actx;
  }

  resumeAudio() {
    this.audio().resume().catch(() => undefined);
  }

  private entry(clip: Clip, asset: Asset): Entry {
    const src = mediaUrl(asset.path);
    let e = this.entries.get(clip.id);
    const kind = clip.kind === 'image' ? 'image' : clip.kind === 'audio' ? 'audio' : 'video';
    if (e && e.src === src && e.kind === kind) return e;
    if (e) this.dispose(clip.id);
    if (kind === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = src;
      e = { el: img, src, kind };
    } else {
      const el = kind === 'video' ? document.createElement('video') : document.createElement('audio');
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      el.src = src;
      if (el instanceof HTMLVideoElement) el.playsInline = true;
      e = { el, src, kind };
      if (asset.hasAudio) {
        try {
          const ctx = this.audio();
          const node = ctx.createMediaElementSource(el);
          const gain = ctx.createGain();
          node.connect(gain).connect(ctx.destination);
          e.gain = gain;
        } catch {
          /* ignore */
        }
      } else el.muted = true;
    }
    this.entries.set(clip.id, e);
    return e;
  }

  private dispose(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    if (!(e.el instanceof HTMLImageElement)) {
      e.el.pause();
      e.el.removeAttribute('src');
      e.el.load();
    }
    e.gain?.disconnect();
    this.entries.delete(id);
    const f = document.getElementById('cf_' + id);
    f?.remove();
    this.filterKeys.delete(id);
  }

  private filterFor(clip: Clip): string {
    const ops = colorOps(clip.adjust, clip.filter);
    if (ops.identity) return 'none';
    const key = ops.contrast + '|' + ops.matrix.join(',');
    const id = 'cf_' + clip.id;
    if (this.filterKeys.get(clip.id) !== key) {
      document.getElementById(id)?.remove();
      const f = document.createElementNS(SVG_NS, 'filter');
      f.setAttribute('id', id);
      f.setAttribute('color-interpolation-filters', 'sRGB');
      const c = ops.contrast;
      const ct = document.createElementNS(SVG_NS, 'feComponentTransfer');
      for (const ch of ['R', 'G', 'B']) {
        const fn = document.createElementNS(SVG_NS, 'feFunc' + ch);
        fn.setAttribute('type', 'linear');
        fn.setAttribute('slope', String(c));
        fn.setAttribute('intercept', String(0.5 - 0.5 * c));
        ct.appendChild(fn);
      }
      f.appendChild(ct);
      const m = ops.matrix;
      const cm = document.createElementNS(SVG_NS, 'feColorMatrix');
      cm.setAttribute('type', 'matrix');
      cm.setAttribute('values', `${m[0]} ${m[1]} ${m[2]} 0 0 ${m[3]} ${m[4]} ${m[5]} 0 0 ${m[6]} ${m[7]} ${m[8]} 0 0 0 0 0 1 0`);
      f.appendChild(cm);
      this.svg.appendChild(f);
      this.filterKeys.set(clip.id, key);
    }
    return `url(#${id})`;
  }

  /** 매 프레임 호출: 미디어 동기화 + 캔버스 합성 */
  render(ctx: CanvasRenderingContext2D, p: Project, t: number, playing: boolean) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const k = W / p.width;
    const assets = new Map(p.assets.map((a) => [a.id, a]));
    const tracks = new Map(p.tracks.map((x) => [x.id, x]));
    const alive = new Set<string>();

    // 1) 미디어 요소 동기화
    for (const c of p.clips) {
      if (c.kind === 'text') continue;
      const a = c.assetId ? assets.get(c.assetId) : undefined;
      if (!a) continue;
      alive.add(c.id);
      const e = this.entry(c, a);
      if (e.el instanceof HTMLImageElement) continue;
      const el = e.el;
      const tr = tracks.get(c.trackId);
      const active = t >= c.start && t < c.start + c.duration;
      const near = t >= c.start - 1.5 && t < c.start + c.duration;
      const local = Math.max(0, t - c.start);
      const want = c.inPoint + local * c.speed;
      if (e.gain) {
        let g = c.muted || tr?.muted || (tr?.hidden && c.kind !== 'audio') ? 0 : c.volume;
        if (c.fadeIn > 0) g *= Math.min(1, local / c.fadeIn);
        if (c.fadeOut > 0) g *= Math.min(1, (c.duration - local) / c.fadeOut);
        e.gain.gain.value = Math.max(0, g);
      }
      if (active && playing) {
        if (Math.abs(el.playbackRate - c.speed) > 1e-3) el.playbackRate = c.speed;
        if (el.paused) {
          if (Math.abs(el.currentTime - want) > 0.05) el.currentTime = want;
          el.play().catch(() => undefined);
        } else if (Math.abs(el.currentTime - want) > 0.25 * Math.max(1, c.speed)) el.currentTime = want;
      } else {
        if (!el.paused) el.pause();
        if (active || near) {
          const target = active ? want : c.inPoint;
          if (Math.abs(el.currentTime - target) > 0.02 && !el.seeking) el.currentTime = target;
        }
      }
    }
    for (const id of [...this.entries.keys()]) if (!alive.has(id)) this.dispose(id);

    // 2) 합성
    ctx.save();
    ctx.fillStyle = p.background || '#000';
    ctx.fillRect(0, 0, W, H);
    const visual = p.tracks.filter((x) => x.type !== 'audio' && !x.hidden).reverse();
    for (const tr of visual) {
      const clips = p.clips.filter((c) => c.trackId === tr.id && t >= c.start && t < c.start + c.duration).sort((a, b) => a.start - b.start);
      for (const c of clips) {
        const mo = motionAt(c, t, W, H);
        const alpha = c.transform.opacity * mo.alpha;
        if (alpha <= 0.001) continue;
        if (c.kind === 'text') {
          ctx.globalAlpha = alpha;
          drawTextClip(ctx, c, k, W, H, mo.dx, mo.dy);
          ctx.globalAlpha = 1;
          continue;
        }
        const a = c.assetId ? assets.get(c.assetId) : undefined;
        const e = this.entries.get(c.id);
        if (!a || !e || e.kind === 'audio') continue;
        const el = e.el as HTMLVideoElement | HTMLImageElement;
        const ready = el instanceof HTMLImageElement ? el.complete && el.naturalWidth > 0 : el.readyState >= 2;
        if (!ready) continue;
        const aw = a.width || (el instanceof HTMLImageElement ? el.naturalWidth : el.videoWidth);
        const ah = a.height || (el instanceof HTMLImageElement ? el.naturalHeight : el.videoHeight);
        const f = fitSize(aw, ah, p.width, p.height);
        const w = f.w * c.transform.scale * k;
        const h = f.h * c.transform.scale * k;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(W / 2 + c.transform.x * k + mo.dx, H / 2 + c.transform.y * k + mo.dy);
        if (c.transform.rotation) ctx.rotate((c.transform.rotation * Math.PI) / 180);
        ctx.filter = this.filterFor(c);
        ctx.drawImage(el, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  pauseAll() {
    for (const e of this.entries.values()) if (!(e.el instanceof HTMLImageElement)) e.el.pause();
  }

  destroy() {
    for (const id of [...this.entries.keys()]) this.dispose(id);
    this.svg.remove();
    this.actx?.close();
  }
}
