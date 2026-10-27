const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pickMedia: (kind) => ipcRenderer.invoke('media:pick', kind),
  importFiles: (files) => ipcRenderer.invoke('media:import', files.map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
  saveRecording: (data) => ipcRenderer.invoke('media:saveRecording', data),
  makeProxy: (file) => ipcRenderer.invoke('media:proxy', file),
  writeTemp: (name, data) => ipcRenderer.invoke('file:writeTemp', name, data),
  saveProject: (project, current, saveAs) => ipcRenderer.invoke('project:save', project, current, saveAs),
  openProject: () => ipcRenderer.invoke('project:open'),
  missingFiles: (paths) => ipcRenderer.invoke('project:check', paths),
  setDirty: (value) => ipcRenderer.invoke('app:dirty', value),
  askMic: () => ipcRenderer.invoke('mic:ask'),
  chooseExport: (name) => ipcRenderer.invoke('export:choose', name),
  startExport: (project, opts) => ipcRenderer.invoke('export:start', project, opts),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  showFile: (file) => ipcRenderer.invoke('shell:show', file),
  openFile: (file) => ipcRenderer.invoke('shell:open', file),
  onExportProgress: (cb) => ipcRenderer.on('export:progress', (_e, p) => cb(p)),
  onProjectLoaded: (cb) => ipcRenderer.on('project:loaded', (_e, data) => cb(data)),
});
