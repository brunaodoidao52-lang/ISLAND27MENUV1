const { app, BrowserWindow, ipcMain, dialog, shell, session, systemPreferences, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ff = require('./ffmpeg');

const VISUAL_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'wmv', 'flv', '3gp', 'mts', 'm2ts', 'ts', 'mpg', 'mpeg', 'gif', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff', 'heic'];
const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'wma', 'aiff', 'webm'];

let win = null;
let dirty = false;
let pendingOpen = process.argv.find((a) => a.endsWith('.i27proj')) || null;
let exportJob = null;
const workDir = path.join(app.getPath('temp'), `island27-editor-${process.pid}`);
fs.mkdirSync(workDir, { recursive: true });

const fileUrl = (p) => pathToFileURL(p).href;

async function importMedia(file) {
  const info = await ff.probe(file);
  info.url = fileUrl(file);
  if (info.type !== 'audio') {
    const thumb = path.join(workDir, `thumb-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
    const at = info.type === 'video' ? Math.min(1, info.duration / 3) : 0;
    const ok = await ff.thumbnail(file, thumb, at);
    info.thumb = ok ? fileUrl(ok) : null;
  }
  return info;
}

async function importMany(files) {
  const results = [];
  const errors = [];
  for (const f of files) {
    try {
      results.push(await importMedia(f));
    } catch (e) {
      errors.push(`${path.basename(f)}: ${e.message}`);
    }
  }
  return { results, errors };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#111216',
    title: 'ISLAND27 Editor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('close', (e) => {
    if (!dirty) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Sair sem salvar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      message: 'Existem alterações não salvas no projeto.',
      detail: 'Deseja sair mesmo assim?',
    });
    if (choice === 1) e.preventDefault();
  });
  win.webContents.on('did-finish-load', () => {
    if (pendingOpen) openProjectFile(pendingOpen);
    pendingOpen = null;
  });
}

function openProjectFile(file) {
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    win.webContents.send('project:loaded', { path: file, project: json });
  } catch (e) {
    dialog.showErrorBox('Não foi possível abrir o projeto', e.message);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', (_e, argv) => {
  const file = argv.find((a) => a.endsWith('.i27proj'));
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
    if (file) openProjectFile(file);
  }
});
app.on('open-file', (e, file) => {
  e.preventDefault();
  if (win) openProjectFile(file);
  else pendingOpen = file;
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  if (exportJob) exportJob.cancel();
  fs.rmSync(workDir, { recursive: true, force: true });
});

ipcMain.handle('media:pick', async (_e, kind) => {
  const filters = kind === 'audio'
    ? [{ name: 'Áudio', extensions: AUDIO_EXT }, { name: 'Vídeo (extrair áudio)', extensions: VISUAL_EXT }]
    : kind === 'video'
      ? [{ name: 'Vídeo', extensions: VISUAL_EXT.filter((x) => !['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff', 'heic'].includes(x)) }]
      : [{ name: 'Vídeos e fotos', extensions: VISUAL_EXT }];
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters });
  if (r.canceled) return { results: [], errors: [] };
  return importMany(r.filePaths);
});

ipcMain.handle('media:import', (_e, files) => importMany(files));

ipcMain.handle('media:proxy', async (_e, file) => {
  const out = path.join(workDir, `proxy-${Date.now()}.mp4`);
  await ff.makeProxy(file, out);
  return fileUrl(out);
});

// MediaRecorder gera WebM sem duração no cabeçalho; convertemos para M4A para ter duração exata.
ipcMain.handle('media:saveRecording', async (_e, data) => {
  const stamp = Date.now();
  const raw = path.join(workDir, `narracao-${stamp}.webm`);
  const out = path.join(workDir, `narracao-${stamp}.m4a`);
  fs.writeFileSync(raw, Buffer.from(data));
  const { code, stderr } = await ff.run(['-y', '-hide_banner', '-i', raw, '-vn', '-c:a', 'aac', '-b:a', '192k', out]);
  fs.rm(raw, { force: true }, () => {});
  if (code !== 0) throw new Error(stderr.split('\n').slice(-3).join(' '));
  return importMedia(out);
});

ipcMain.handle('file:writeTemp', (_e, name, data) => {
  const out = path.join(workDir, `${Date.now()}-${name}`);
  const buf = typeof data === 'string' ? Buffer.from(data.split(',')[1], 'base64') : Buffer.from(data);
  fs.writeFileSync(out, buf);
  return { path: out, url: fileUrl(out) };
});

ipcMain.handle('project:save', async (_e, project, current, saveAs) => {
  let file = current;
  if (!file || saveAs) {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: file || 'Meu projeto.i27proj',
      filters: [{ name: 'Projeto ISLAND27 Editor', extensions: ['i27proj'] }],
    });
    if (r.canceled) return null;
    file = r.filePath;
  }
  fs.writeFileSync(file, JSON.stringify(project, null, 1));
  return file;
});

ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Projeto ISLAND27 Editor', extensions: ['i27proj'] }] });
  if (r.canceled) return null;
  return { path: r.filePaths[0], project: JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')) };
});

ipcMain.handle('project:check', (_e, paths) => paths.filter((p) => !fs.existsSync(p)));

ipcMain.handle('app:dirty', (_e, value) => {
  dirty = !!value;
});

ipcMain.handle('mic:ask', async () => {
  if (process.platform === 'darwin') return systemPreferences.askForMediaAccess('microphone');
  return true;
});

ipcMain.handle('export:choose', async (_e, name) => {
  const r = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('videos'), name),
    filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }],
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('export:start', async (e, project, opts) => {
  if (exportJob) throw new Error('Já existe uma exportação em andamento.');
  const overlays = (opts.overlays || []).map((o, i) => {
    const file = path.join(workDir, `overlay-${Date.now()}-${i}.png`);
    fs.writeFileSync(file, Buffer.from(o.data.split(',')[1], 'base64'));
    return { path: file, start: o.start, end: o.end, fade: o.fade };
  });
  try {
    exportJob = ff.runExport(project, { ...opts, overlays, workDir }, (p) => {
      if (!e.sender.isDestroyed()) e.sender.send('export:progress', p);
    });
    return await exportJob.done;
  } finally {
    exportJob = null;
    overlays.forEach((o) => fs.rm(o.path, { force: true }, () => {}));
  }
});

ipcMain.handle('export:cancel', () => {
  if (exportJob) exportJob.cancel();
});

ipcMain.handle('shell:show', (_e, file) => shell.showItemInFolder(file));
ipcMain.handle('shell:open', (_e, file) => shell.openPath(file));
