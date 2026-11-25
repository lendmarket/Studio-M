import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { ffmpegPath, probe, thumbnails, waveform } from './ffmpeg';
import { buildExport, ExportJob } from '../src/core/exportGraph';

protocol.registerSchemesAsPrivileged([
  { scheme: 'smedia', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } },
]);

let win: BrowserWindow | null = null;
let exportProc: ChildProcess | null = null;
let pendingOpen: string | null = process.argv.find((a) => a.toLowerCase().endsWith('.smproj')) || null;

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
};

function registerMediaProtocol() {
  protocol.handle('smedia', async (req) => {
    const url = new URL(req.url);
    const file = decodeURIComponent(url.pathname.slice(1));
    try {
      const stat = await fs.promises.stat(file);
      const size = stat.size;
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const headers: Record<string, string> = {
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      };
      const range = req.headers.get('range');
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        let start = m && m[1] ? parseInt(m[1], 10) : 0;
        let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
        if (!m || !m[1]) start = Math.max(0, size - (parseInt(m?.[2] || '0', 10) || size));
        end = Math.min(end, size - 1);
        const stream = fs.createReadStream(file, { start, end });
        return new Response(Readable.toWeb(stream) as any, {
          status: 206,
          headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
        });
      }
      return new Response(Readable.toWeb(fs.createReadStream(file)) as any, {
        status: 200,
        headers: { ...headers, 'Content-Length': String(size) },
      });
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f0f12',
    title: 'Studio M',
    icon: path.join(__dirname, '../dist/icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#141417', symbolColor: '#e6e6ea', height: 40 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => {
    win?.maximize();
    win?.show();
  });
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') win?.webContents.toggleDevTools();
  });
  win.on('close', (e) => {
    if ((win as any).__forceClose) return;
    e.preventDefault();
    win?.webContents.send('app:before-close');
  });
}

// ---------- IPC ----------
const MEDIA_FILTERS = [
  { name: '미디어', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
  { name: '모든 파일', extensions: ['*'] },
];

ipcMain.handle('dialog:openMedia', async (_e, kind: 'media' | 'audio') => {
  const filters =
    kind === 'audio'
      ? [{ name: '오디오', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'mp4', 'mov'] }]
      : MEDIA_FILTERS;
  const r = await dialog.showOpenDialog(win!, { properties: ['openFile', 'multiSelections'], filters });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('dialog:openProject', async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Studio M 프로젝트', extensions: ['smproj'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:save', async (_e, opts: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => {
  const r = await dialog.showSaveDialog(win!, opts);
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:confirm', async (_e, opts: { message: string; buttons: string[]; detail?: string }) => {
  const r = await dialog.showMessageBox(win!, { type: 'question', message: opts.message, detail: opts.detail, buttons: opts.buttons, cancelId: opts.buttons.length - 1, defaultId: 0 });
  return r.response;
});
ipcMain.handle('media:probe', (_e, f: string) => probe(f));
ipcMain.handle('media:thumbs', (_e, f: string, d: number) => thumbnails(f, d));
ipcMain.handle('media:waveform', (_e, f: string) => waveform(f));
ipcMain.handle('fs:read', (_e, f: string) => fs.promises.readFile(f, 'utf8'));
ipcMain.handle('fs:write', (_e, f: string, data: string) => fs.promises.writeFile(f, data, 'utf8'));
ipcMain.handle('fs:exists', (_e, f: string) => fs.existsSync(f));
ipcMain.handle('app:autosave', (_e, data: string) =>
  fs.promises.writeFile(path.join(app.getPath('userData'), 'autosave.smproj'), data, 'utf8'),
);
ipcMain.handle('app:loadAutosave', async () => {
  const f = path.join(app.getPath('userData'), 'autosave.smproj');
  return fs.existsSync(f) ? fs.promises.readFile(f, 'utf8') : null;
});
ipcMain.handle('app:pendingOpen', () => {
  const p = pendingOpen;
  pendingOpen = null;
  return p;
});
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:reveal', (_e, f: string) => shell.showItemInFolder(f));
ipcMain.handle('app:openExternal', (_e, url: string) => {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
});
ipcMain.on('app:close-confirmed', () => {
  if (win) {
    (win as any).__forceClose = true;
    win.close();
  }
});

ipcMain.handle('export:start', async (_e, job: ExportJob & { textPngs: Record<string, string> }) => {
  const tmp = path.join(app.getPath('temp'), 'studio-m-export-' + Date.now());
  fs.mkdirSync(tmp, { recursive: true });
  const textImages: Record<string, string> = {};
  for (const [id, dataUrl] of Object.entries(job.textPngs || {})) {
    const f = path.join(tmp, `${id}.png`);
    fs.writeFileSync(f, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    textImages[id] = f;
  }
  const built = buildExport({ project: job.project, settings: job.settings, textImages });
  const graphFile = path.join(tmp, 'graph.txt');
  fs.writeFileSync(graphFile, built.graph, 'utf8');
  const args = built.args.map((a) => (a === '{GRAPH}' ? graphFile : a));
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    exportProc = p;
    let err = '';
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const l of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(l.trim());
        if (m) win?.webContents.send('export:progress', Math.min(1, parseInt(m[1], 10) / 1e6 / built.duration));
      }
    });
    p.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 100000) err = err.slice(-50000);
    });
    p.on('close', (code) => {
      exportProc = null;
      fs.rmSync(tmp, { recursive: true, force: true });
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: code === null || (p as any).__cancelled ? '취소됨' : err.split('\n').slice(-12).join('\n') });
    });
  });
});
ipcMain.handle('export:cancel', () => {
  if (exportProc) {
    (exportProc as any).__cancelled = true;
    exportProc.kill();
  }
});

// ---------- 자동 업데이트 ----------
function setupUpdater() {
  const send = (s: object) => win?.webContents.send('update:status', s);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => send({ state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => send({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => send({ state: 'error', message: String(e?.message || e) }));
  ipcMain.handle('update:check', () => (app.isPackaged ? autoUpdater.checkForUpdates().catch(() => null) : send({ state: 'dev' })));
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());
  if (app.isPackaged) setTimeout(() => autoUpdater.checkForUpdates().catch(() => undefined), 4000);
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', (_e, argv) => {
    const f = argv.find((a) => a.toLowerCase().endsWith('.smproj'));
    if (f) win?.webContents.send('app:open-project', f);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    registerMediaProtocol();
    createWindow();
    setupUpdater();
  });
  app.on('window-all-closed', () => app.quit());
}
