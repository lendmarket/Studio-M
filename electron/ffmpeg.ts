import { app } from 'electron';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

function fixAsar(p: string) {
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

export const ffmpegPath: string = fixAsar(require('ffmpeg-static') as string);
export const ffprobePath: string = fixAsar((require('ffprobe-static') as { path: string }).path);

export function run(bin: string, args: string[], onStdout?: (chunk: Buffer) => void) {
  return new Promise<{ code: number; stdout: Buffer; stderr: string }>((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    const out: Buffer[] = [];
    let err = '';
    p.stdout.on('data', (d: Buffer) => (onStdout ? onStdout(d) : out.push(d)));
    p.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 200000) err = err.slice(-100000);
    });
    p.on('error', reject);
    p.on('close', (code) => resolve({ code: code ?? -1, stdout: Buffer.concat(out), stderr: err }));
  });
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg', '.opus', '.wma']);

export interface ProbeResult {
  type: 'video' | 'audio' | 'image';
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export async function probe(file: string): Promise<ProbeResult> {
  const r = await run(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  if (r.code !== 0) throw new Error('파일을 읽을 수 없습니다: ' + r.stderr.slice(-300));
  const j = JSON.parse(r.stdout.toString());
  const streams: any[] = j.streams || [];
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const a = streams.find((s) => s.codec_type === 'audio');
  const ext = path.extname(file).toLowerCase();
  const duration = parseFloat(j.format?.duration || v?.duration || a?.duration || '0') || 0;
  let width = v ? v.width : 0;
  let height = v ? v.height : 0;
  const rot = Number(v?.tags?.rotate || v?.side_data_list?.find((d: any) => d.rotation !== undefined)?.rotation || 0);
  if (Math.abs(rot) % 180 === 90) [width, height] = [height, width];
  let type: ProbeResult['type'] = 'video';
  if (IMAGE_EXT.has(ext) || (v && duration < 0.05 && !a)) type = 'image';
  else if (!v || AUDIO_EXT.has(ext)) type = 'audio';
  return { type, duration: type === 'image' ? 0 : duration, width, height, hasAudio: !!a && type !== 'image' };
}

function cacheDir(file: string, kind: string) {
  const st = fs.statSync(file);
  const h = createHash('md5').update(file + st.size + st.mtimeMs).digest('hex').slice(0, 16);
  const d = path.join(app.getPath('userData'), 'cache', kind, h);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export async function thumbnails(file: string, duration: number) {
  const dir = cacheDir(file, 'thumbs');
  const interval = Math.max(0.5, duration / 120);
  const done = path.join(dir, 'done.json');
  if (fs.existsSync(done)) return JSON.parse(fs.readFileSync(done, 'utf8'));
  await run(ffmpegPath, [
    '-v', 'error', '-y', '-i', file,
    '-vf', `fps=1/${interval},scale=-2:90`,
    '-q:v', '6', path.join(dir, 't%04d.jpg'),
  ]);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort().map((f) => path.join(dir, f));
  const res = { files, interval };
  fs.writeFileSync(done, JSON.stringify(res));
  return res;
}

export async function waveform(file: string) {
  const dir = cacheDir(file, 'wave');
  const done = path.join(dir, 'peaks.json');
  if (fs.existsSync(done)) return JSON.parse(fs.readFileSync(done, 'utf8'));
  const rate = 4000;
  const perSec = 40;
  const bucket = rate / perSec;
  const peaks: number[] = [];
  let cur = 0;
  let cnt = 0;
  let carry: Buffer | null = null;
  await run(ffmpegPath, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'], (chunk) => {
    let buf = carry ? Buffer.concat([carry, chunk]) : chunk;
    const usable = buf.length - (buf.length % 2);
    carry = usable < buf.length ? buf.subarray(usable) : null;
    for (let i = 0; i < usable; i += 2) {
      const v = Math.abs(buf.readInt16LE(i));
      if (v > cur) cur = v;
      if (++cnt >= bucket) {
        peaks.push(Math.round((cur / 32768) * 100) / 100);
        cur = 0;
        cnt = 0;
      }
    }
  });
  if (cnt > 0) peaks.push(Math.round((cur / 32768) * 100) / 100);
  const res = { peaks, perSec };
  fs.writeFileSync(done, JSON.stringify(res));
  return res;
}
