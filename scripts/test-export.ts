import { buildExport } from '../src/core/exportGraph';
import { newProject, clipFromAsset, normalize, findFreeTrack, textClip, mainTrack } from '../src/core/project';
import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
const dir = process.argv[2];
const ff = process.argv[3];
const p = newProject();
p.assets = [
  { id: 'v1', type: 'video', path: dir + '/v1.mp4', name: 'v1', duration: 6, width: 1280, height: 720, hasAudio: true },
  { id: 'v2', type: 'video', path: dir + '/v2.mp4', name: 'v2', duration: 5, width: 640, height: 480, hasAudio: false },
  { id: 'img', type: 'image', path: dir + '/img.png', name: 'img', duration: 0, width: 800, height: 600, hasAudio: false },
  { id: 'a1', type: 'audio', path: dir + '/a1.mp3', name: 'a1', duration: 8, width: 0, height: 0, hasAudio: true },
];
const main = mainTrack(p).id;
const c1 = clipFromAsset(p.assets[0], main, 0); c1.adjust.contrast = 30; c1.filter = { id: 'warm', intensity: 80 }; c1.speed = 2; c1.duration = 3;
const c2 = clipFromAsset(p.assets[1], main, 10); c2.transition = { type: 'push-left', duration: 0.8 }; c2.animOut = { type: 'fade', duration: 0.5 };
const c3 = clipFromAsset(p.assets[2], main, 0); c3.duration = 2;
p.clips.push(c1, c2);
normalize(p);
const ov = findFreeTrack(p, 'video', 1, 3);
c3.trackId = ov.id; c3.start = 1; c3.transform = { x: 300, y: -200, scale: 0.4, rotation: 15, opacity: 0.8 }; c3.animIn = { type: 'slide-left', duration: 0.5 };
p.clips.push(c3);
const tt = findFreeTrack(p, 'text', 0, 4); const t = textClip(tt.id, 0.5); t.duration = 4; t.animIn = { type: 'fade', duration: 0.5 }; p.clips.push(t);
const at = findFreeTrack(p, 'audio', 0, 6); const a = clipFromAsset(p.assets[3], at.id, 0.5); a.duration = 5; a.volume = 0.5; a.fadeIn = 1; a.fadeOut = 1; p.clips.push(a);
normalize(p);
console.log(p.tracks.map(t => t.type + (t.main ? '*' : '')).join(','), p.clips.map(c => `${c.kind}@${c.start.toFixed(2)}+${c.duration}`).join(' '));
const b = buildExport({ project: p, settings: { outPath: dir + '/out.mp4', width: 1280, height: 720, fps: 30, crf: 23 }, textImages: { [t.id]: dir + '/text.png' } });
writeFileSync(dir + '/graph.txt', b.graph);
const args = b.args.map(x => x === '{GRAPH}' ? dir + '/graph.txt' : x).filter(x => x !== 'pipe:1' && x !== '-progress');
const r = spawnSync(ff, args, { encoding: 'utf8' });
console.log('exit', r.status, r.stderr.split('\n').filter(l => /error|Error|Invalid|warn/i.test(l)).slice(0, 10).join('\n'));
