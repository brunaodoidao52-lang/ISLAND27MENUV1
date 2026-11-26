// Processo principal do Electron: janela, bandeja (continua rodando para postar nos horários), diálogos e contas.
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, safeStorage, Tray, Menu, nativeImage, Notification, powerSaveBlocker } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ff = require('./ffmpeg');
const { renderLoop, safeName } = require('./pipeline');
const { createStore } = require('./store');
const { Engine } = require('./engine');
const youtube = require('./youtube');
const instagram = require('./instagram');
const texts = require('../shared/texts');
const schedule = require('../shared/schedule');
const plan = require('../shared/plan');
const ai = require('./ai');

const AUDIO = [...ff.AUDIO_EXT].map((e) => e.slice(1));
const IMAGE = [...ff.IMAGE_EXT].map((e) => e.slice(1));
const VIDEO = [...ff.VIDEO_EXT].map((e) => e.slice(1));

let win = null;
let tray = null;
let quitting = false;
const logLines = [];

// Pasta de dados separada (útil para testes): ISLAND27_DATA_DIR=/caminho
if (process.env.ISLAND27_DATA_DIR) app.setPath('userData', process.env.ISLAND27_DATA_DIR);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

const userData = app.getPath('userData');
const workDir = path.join(app.getPath('temp'), 'island27-beat-launcher');
fs.mkdirSync(workDir, { recursive: true });

const canEncrypt = () => {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
};
let store;
let engine;

function log(msg) {
  const line = `${new Date().toLocaleString('pt-BR')}  ${msg}`;
  logLines.push(line);
  if (logLines.length > 300) logLines.shift();
  if (win && !win.isDestroyed()) win.webContents.send('log', line);
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
}

function outDir() {
  return store.settings.outDir || path.join(app.getPath('videos'), 'ISLAND27 Beat Launcher');
}

function fileUrl(p) {
  return p && fs.existsSync(p) ? `${pathToFileURL(p).href}?v=${Math.round(fs.statSync(p).mtimeMs)}` : null;
}

/** Estado enviado para a tela (sem segredos). */
function publicState() {
  const s = store.settings;
  return {
    items: store.items.map((it) => ({
      ...it,
      coverUrl: fileUrl(it.coverPath),
      urls: it.outputs ? { youtube: fileUrl(it.outputs.youtube), reels: fileUrl(it.outputs.reels), thumb: fileUrl(it.outputs.thumb), thumbB: fileUrl(it.outputs.thumbB) } : null,
      folder: it.outputs ? path.dirname(it.outputs.youtube) : null,
    })),
    settings: {
      ...s,
      youtube: { clientId: s.youtube.clientId, hasSecret: !!s.youtube.clientSecret, connected: !!(s.youtube.tokens && s.youtube.tokens.refresh), channel: s.youtube.channel },
      instagram: { ...s.instagram, token: undefined, hasToken: !!s.instagram.token },
      ai: { ...s.ai, apiKey: undefined, hasKey: !!(s.ai && s.ai.apiKey) },
    },
    posts: store.posts.map((p) => ({
      ...p,
      imageUrls: p.files && p.files.images ? p.files.images.map(fileUrl) : [],
      videoUrl: p.files && p.files.video ? fileUrl(p.files.video) : null,
    })),
    kindLabels: plan.KIND_LABEL,
    aiProviders: ai.PROVIDERS,
    marketingPhotoUrls: Object.fromEntries(Object.entries((s.marketing && s.marketing.photos) || {}).map(([k, v]) => [k, fileUrl(v)])),
    defaultMarketing: plan.DEFAULT_MARKETING,
    outDir: outDir(),
    encryption: canEncrypt(),
    generos: texts.GENEROS,
    defaultTemplates: texts.DEFAULT_TEMPLATES,
    nextSlots: schedule.nextFreeSlots(new Date(Date.now() + (s.leadMinutes || 30) * 60000), s.slots, 3, { taken: store.items.filter((i) => i.when).map((i) => i.when), days: s.days }).map((d) => d.toISOString()),
  };
}

let pushTimer = null;
function pushState() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (win && !win.isDestroyed()) win.webContents.send('state', publicState());
    updateTray();
  }, 120);
}

function ytClient() {
  const y = store.settings.youtube;
  if (!y.tokens || !y.tokens.refresh) return null;
  return youtube.client({
    clientId: y.clientId,
    clientSecret: y.clientSecret,
    tokens: y.tokens,
    saveTokens: (tokens) => store.setSettings({ youtube: { tokens } }),
  });
}

function igClient() {
  const i = store.settings.instagram;
  if (!i.token || !i.userId) return null;
  return instagram.client({ login: i.login, userId: i.userId, token: i.token, version: i.version });
}

/** Renova o token do Instagram (60 dias) quando passa de 30 dias. */
async function refreshInstagramToken() {
  const i = store.settings.instagram;
  if (!i.token || i.login !== 'instagram') return;
  if (Date.now() - (i.tokenSavedAt || 0) < 30 * 86400000) return;
  try {
    const r = await igClient().refreshToken();
    if (r) {
      store.setSettings({ instagram: { token: r.token, tokenSavedAt: Date.now() } });
      log('Token do Instagram renovado.');
    }
  } catch (e) {
    log(`Não foi possível renovar o token do Instagram: ${e.message}`);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#08090c',
    title: 'ISLAND27 Beat Launcher',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('close', (e) => {
    if (quitting || !store.settings.background) return;
    e.preventDefault();
    win.hide();
    if (!app.backgroundNoticeShown) {
      app.backgroundNoticeShown = true;
      notify('ISLAND27 Beat Launcher', 'Continuo rodando aqui na bandeja para postar nos horários. Para sair de vez, use "Sair" no ícone da bandeja.');
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}

function updateTray() {
  if (!tray) return;
  const items = store.items;
  const waiting = items.filter((i) => i.ig.status === 'pendente' || i.yt.status === 'pendente').length;
  tray.setToolTip(`ISLAND27 Beat Launcher - ${waiting} lançamento(s) na fila`);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'build', 'icon.png')).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir o Beat Launcher', click: showWindow },
      { type: 'separator' },
      {
        label: 'Sair',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showWindow);
  updateTray();
}

app.on('second-instance', showWindow);

app.whenReady().then(() => {
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  store = createStore(path.join(userData, 'beat-launcher.json'), canEncrypt() ? { encrypt: (s) => safeStorage.encryptString(s).toString('base64'), decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')) } : {});
  engine = new Engine({ store, dirs: { workDir, outDir }, clients: { youtube: ytClient, instagram: igClient }, log });
  const lastStatus = new Map();
  engine.on('change', () => {
    pushState();
    // avisa quando algo é publicado ou dá erro
    for (const it of store.items) {
      const key = `${it.render.status}|${it.yt.status}|${it.ig.status}`;
      const prev = lastStatus.get(it.id);
      lastStatus.set(it.id, key);
      if (!prev || prev === key) continue;
      const [, py, pi] = prev.split('|');
      if (it.yt.status !== py && ['agendado', 'publicado'].includes(it.yt.status)) notify('YouTube', `${it.nome}: ${it.yt.status}${it.yt.simulated ? ' (modo teste)' : ''}`);
      if (it.ig.status !== pi && it.ig.status === 'publicado') notify('Instagram', `${it.nome}: publicado${it.ig.simulated ? ' (modo teste)' : ''}`);
      if ((it.yt.status === 'erro' && py !== 'erro') || (it.ig.status === 'erro' && pi !== 'erro')) notify('Beat Launcher', `Erro ao publicar ${it.nome}. Abra o app para ver.`);
    }
  });
  engine.on('due', (p) => notify('Hora de postar', `${p.titulo}. Abra a aba Marketing para copiar a legenda e os arquivos.`));
  createWindow();
  createTray();
  engine.start();
  // impede o PC de "dormir" enquanto o app roda (para não perder horários do Instagram)
  powerSaveBlocker.start('prevent-app-suspension');
  refreshInstagramToken();
  setInterval(refreshInstagramToken, 12 * 3600000);
  app.on('activate', showWindow);
});

app.on('before-quit', () => {
  quitting = true;
  if (engine) engine.stop();
  if (store) store.flush();
});
app.on('window-all-closed', () => {
  if (quitting || !store || !store.settings.background) app.quit();
});

// ---------- IPC ----------
const handle = (name, fn) =>
  ipcMain.handle(name, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

handle('state:get', () => ({ ...publicState(), log: logLines }));

handle('pick:files', async (kind, multi) => {
  const filters = {
    audio: [{ name: 'Beat (áudio)', extensions: AUDIO }],
    image: [{ name: 'Capa (imagem)', extensions: IMAGE }],
    video: [{ name: 'Vídeo de fundo', extensions: VIDEO }],
    any: [{ name: 'Beats, capas e vídeos', extensions: [...AUDIO, ...IMAGE, ...VIDEO, 'txt'] }],
  }[kind] || [];
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', ...(multi ? ['multiSelections'] : [])], filters });
  return r.canceled ? [] : r.filePaths;
});

handle('pick:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

handle('file:url', (p) => fileUrl(p));
handle('file:analyze', async (p) => ff.analyze(p));
handle('texts:preview', (beat) => texts.generate(beat, store.settings));

handle('beat:add', (input) => engine.addBeat(input).id);
handle('beat:addFiles', (files) => {
  const r = engine.addFiles(files);
  return { added: r.added.length, errors: r.errors };
});
handle('beat:update', (id, patch) => {
  engine.update(id, patch);
});
handle('beat:remove', (id) => engine.remove(id));
handle('beat:rerender', (id) => engine.rerender(id));
handle('beat:regenTexts', (id) => engine.regenTexts(id));
handle('beat:retry', (id, platform) => engine.retry(id, platform));
handle('beat:publishNow', (id) => engine.publishNow(id));
handle('beat:move', (id, to) => {
  store.move(id, to);
  pushState();
});
handle('queue:distribute', () => engine.distribute().length);
handle('queue:clearTimes', () => {
  for (const it of store.items) if (it.yt.status === 'pendente' && it.ig.status !== 'enviando' && it.ig.status !== 'publicado') store.update(it.id, { when: null });
  pushState();
});

handle('settings:save', (patch) => {
  if (patch.slots) patch.slots = schedule.formatSlots(patch.slots);
  store.setSettings(patch);
  // textos que o usuário não editou acompanham os novos modelos/links
  if (patch.links || patch.templates) for (const it of store.items) if (!it.textsEdited && it.yt.status === 'pendente') store.update(it.id, { texts: texts.generate(it, store.settings) });
  pushState();
  engine.tick();
});

handle('youtube:connect', async (clientId, clientSecret) => {
  const id = clientId || store.settings.youtube.clientId;
  const secret = clientSecret || store.settings.youtube.clientSecret;
  store.setSettings({ youtube: { clientId: id, clientSecret: secret } });
  const r = await youtube.connect({ clientId: id, clientSecret: secret, openExternal: (u) => shell.openExternal(u) });
  store.setSettings({ youtube: { tokens: r.tokens, channel: r.channel } });
  log(`YouTube conectado${r.channel ? `: ${r.channel.title}` : ''}.`);
  showWindow();
  pushState();
  return r.channel;
});
handle('youtube:disconnect', () => {
  store.setSettings({ youtube: { tokens: null, channel: null } });
  pushState();
});

handle('instagram:save', async (cfg) => {
  const patch = { login: cfg.login, userId: String(cfg.userId || '').trim(), version: cfg.version || 'v23.0' };
  if (cfg.token) {
    patch.token = cfg.token.trim();
    patch.tokenSavedAt = Date.now();
  }
  store.setSettings({ instagram: patch });
  const c = igClient();
  if (!c) throw new Error('Preencha o ID da conta e o token.');
  const acc = await c.account();
  store.setSettings({ instagram: { username: acc.username || '' } });
  log(`Instagram conectado: @${acc.username}`);
  pushState();
  return acc;
});
handle('instagram:disconnect', () => {
  store.setSettings({ instagram: { token: '', username: '' } });
  pushState();
});

let loopJob = 0;
handle('loop:render', async (opts) => {
  const id = ++loopJob;
  const dir = path.join(outDir(), 'Loops');
  const out = path.join(dir, `${safeName(path.basename(opts.image, path.extname(opts.image)))}-loop-${opts.format.replace(':', 'x')}-${opts.style}-${Date.now().toString(36)}.mp4`);
  await renderLoop({ ...opts, out, workDir }, (p) => win && win.webContents.send('loop:progress', { id, p }));
  return { path: out, url: fileUrl(out) };
});

handle('shell:show', (p) => shell.showItemInFolder(p));
handle('shell:open', (p) => shell.openPath(p));
handle('shell:url', (u) => /^https?:\/\//.test(u) && shell.openExternal(u));
handle('clipboard:write', (t) => clipboard.writeText(String(t || '')));
handle('folder:ensure', (p) => {
  fs.mkdirSync(p, { recursive: true });
  return p;
});

// ---------- marketing ----------
handle('marketing:week', (start, weekIndex) => engine.planWeek(new Date(start), Number(weekIndex) || 0).length);
handle('marketing:vitrine', () => engine.planVitrine().length);
handle('marketing:update', (id, patch) => {
  engine.updatePost(id, patch);
});
handle('marketing:remove', (id) => engine.removePost(id));
handle('marketing:done', (id) => engine.markPosted(id));
handle('marketing:rerender', (id) => engine.rerenderPost(id));
handle('marketing:clearDone', () => {
  for (const p of [...store.posts]) if (p.status === 'postado') store.removePost(p.id);
  pushState();
});
handle('marketing:photo', async (key) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Foto', extensions: IMAGE }] });
  if (r.canceled) return null;
  store.setSettings({ marketing: { photos: { [key]: r.filePaths[0] } } });
  pushState();
  return r.filePaths[0];
});
handle('marketing:settings', (patch) => {
  store.setSettings({ marketing: patch });
  pushState();
});

// ---------- IA (modo teste) ----------
handle('ai:save', (cfg) => {
  const patch = { enabled: !!cfg.enabled, autoApply: !!cfg.autoApply, provider: cfg.provider || 'deepseek', baseUrl: (cfg.baseUrl || '').trim(), model: (cfg.model || '').trim() };
  if (cfg.apiKey) patch.apiKey = cfg.apiKey.trim();
  store.setSettings({ ai: patch });
  pushState();
});
handle('ai:clearKey', () => {
  store.setSettings({ ai: { apiKey: '', enabled: false } });
  pushState();
});
handle('ai:test', async () => {
  const r = await ai.client(ai.cfgOf(store.settings)).test();
  log(`IA conectada (${r.model}): “${r.reply}”.`);
  return r;
});
handle('ai:suggestBeat', (id) => engine.aiSuggestBeat(id));
handle('ai:applyBeat', (id) => engine.aiApplyBeat(id));
handle('ai:rewritePost', (id) => engine.aiRewritePost(id));
handle('ai:ideas', (count, foco) => engine.aiIdeas(count, foco));
