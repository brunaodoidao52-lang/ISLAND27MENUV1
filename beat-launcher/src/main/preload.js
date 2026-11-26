const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Toda chamada devolve { ok, value } ou { ok: false, error }; aqui vira valor ou exceção.
const call = async (name, ...args) => {
  const r = await ipcRenderer.invoke(name, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

contextBridge.exposeInMainWorld('api', {
  getState: () => call('state:get'),
  pickFiles: (kind, multi) => call('pick:files', kind, multi),
  pickFolder: () => call('pick:folder'),
  pathOf: (file) => webUtils.getPathForFile(file),
  fileUrl: (p) => call('file:url', p),
  analyze: (p) => call('file:analyze', p),
  previewTexts: (beat) => call('texts:preview', beat),
  addBeat: (input) => call('beat:add', input),
  addFiles: (paths) => call('beat:addFiles', paths),
  updateBeat: (id, patch) => call('beat:update', id, patch),
  removeBeat: (id) => call('beat:remove', id),
  rerender: (id) => call('beat:rerender', id),
  regenTexts: (id) => call('beat:regenTexts', id),
  retry: (id, platform) => call('beat:retry', id, platform),
  publishNow: (id) => call('beat:publishNow', id),
  moveBeat: (id, to) => call('beat:move', id, to),
  distribute: () => call('queue:distribute'),
  clearTimes: () => call('queue:clearTimes'),
  saveSettings: (patch) => call('settings:save', patch),
  connectYouTube: (id, secret) => call('youtube:connect', id, secret),
  disconnectYouTube: () => call('youtube:disconnect'),
  saveInstagram: (cfg) => call('instagram:save', cfg),
  disconnectInstagram: () => call('instagram:disconnect'),
  renderLoop: (opts) => call('loop:render', opts),
  showFile: (p) => call('shell:show', p),
  openPath: (p) => call('shell:open', p),
  openUrl: (u) => call('shell:url', u),
  copy: (t) => call('clipboard:write', t),
  ensureFolder: (p) => call('folder:ensure', p),
  planWeek: (start, weekIndex) => call('marketing:week', start, weekIndex),
  planVitrine: () => call('marketing:vitrine'),
  updatePost: (id, patch) => call('marketing:update', id, patch),
  removePost: (id) => call('marketing:remove', id),
  markPosted: (id) => call('marketing:done', id),
  rerenderPost: (id) => call('marketing:rerender', id),
  clearPosted: () => call('marketing:clearDone'),
  pickMarketingPhoto: (key) => call('marketing:photo', key),
  saveMarketing: (patch) => call('marketing:settings', patch),
  saveAI: (cfg) => call('ai:save', cfg),
  clearAIKey: () => call('ai:clearKey'),
  testAI: () => call('ai:test'),
  aiSuggestBeat: (id) => call('ai:suggestBeat', id),
  aiApplyBeat: (id) => call('ai:applyBeat', id),
  aiRewritePost: (id) => call('ai:rewritePost', id),
  aiIdeas: (count, foco) => call('ai:ideas', count, foco),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onLog: (cb) => ipcRenderer.on('log', (_e, l) => cb(l)),
  onLoopProgress: (cb) => ipcRenderer.on('loop:progress', (_e, p) => cb(p)),
});
