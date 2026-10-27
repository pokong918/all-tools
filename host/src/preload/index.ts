import { contextBridge, ipcRenderer } from 'electron'
import type {
  AllToolsApi,
  LogEvent,
  ProgressEvent,
  StateEvent,
  SyncLogEvent,
  TermDataEvent
} from '../common/api'

function subscribe<T>(channel: string, cb: (v: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, v: T): void => cb(v)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: AllToolsApi = {
  catalog: () => ipcRenderer.invoke('catalog:list'),
  syncCatalog: () => ipcRenderer.invoke('catalog:sync'),
  envInfo: () => ipcRenderer.invoke('env:info'),
  acquire: (m) => ipcRenderer.invoke('tool:acquire', m),
  acquireEntry: (e) => ipcRenderer.invoke('tool:acquire-entry', e),
  start: (m) => ipcRenderer.invoke('tool:start', m),
  stop: (id) => ipcRenderer.invoke('tool:stop', id),
  remove: (id) => ipcRenderer.invoke('tool:remove', id),
  updateTool: (m) => ipcRenderer.invoke('tool:update', m),
  saveOverride: (patch) => ipcRenderer.invoke('tool:save-override', patch),
  resetOverride: (id) => ipcRenderer.invoke('tool:reset-override', id),
  logs: (id) => ipcRenderer.invoke('tool:logs', id),
  termOpen: (id) => ipcRenderer.invoke('term:open', id),
  termWrite: (id, data) => ipcRenderer.invoke('term:write', id, data),
  termClose: (id) => ipcRenderer.invoke('term:close', id),
  storageList: () => ipcRenderer.invoke('storage:list'),
  clearDeps: (id) => ipcRenderer.invoke('storage:clear-deps', id),
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (p) => ipcRenderer.invoke('prefs:set', p),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  wizardStatus: () => ipcRenderer.invoke('wizard:status'),
  completeWizard: (payload) => ipcRenderer.invoke('wizard:complete', payload),
  chooseDirectory: () => ipcRenderer.invoke('dirs:choose'),
  syncManifests: () => ipcRenderer.invoke('manifests:sync'),
  checkHostUpdate: () => ipcRenderer.invoke('app:check-update'),
  migrateDataRoot: (target) => ipcRenderer.invoke('data:migrate', target),
  backupExport: () => ipcRenderer.invoke('backup:export'),
  backupImport: () => ipcRenderer.invoke('backup:import'),
  onToolState: (cb: (s: StateEvent) => void) => subscribe('tool-state', cb),
  onToolLog: (cb: (v: LogEvent) => void) => subscribe('tool-log', cb),
  onProgress: (cb: (v: ProgressEvent) => void) => subscribe('acquire-progress', cb),
  onTermData: (cb: (v: TermDataEvent) => void) => subscribe('term-data', cb),
  onFocusTool: (cb: (v: { id: string }) => void) => subscribe('focus-tool', cb),
  onSyncLog: (cb: (v: SyncLogEvent) => void) => subscribe('sync-log', cb)
}

contextBridge.exposeInMainWorld('allTools', api)
