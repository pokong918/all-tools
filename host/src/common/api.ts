import type {
  CatalogEntry,
  CatalogView,
  EnvInfo,
  HostUpdateEvent,
  HostUpdateInfo,
  ManifestOverride,
  ManifestSyncResult,
  Prefs,
  StorageInfo,
  SyncResult,
  ToolManifest,
  WizardStatus
} from './types'

export interface StateEvent { id: string; state: string; port?: number }
export interface LogEvent { id: string; line: string }
export interface ProgressEvent { id: string; phase: string; percent: number }
export interface TermDataEvent { id: string; data: string }
export interface SyncLogEvent { line: string }
export type { HostUpdateEvent }

/** preload 暴露给渲染层的 API 契约（window.allTools） */
export interface AllToolsApi {
  catalog(): Promise<CatalogView>
  /** 触发一次 GitHub 目录采集（匿名配额内可用，建议低频手动/每日） */
  syncCatalog(): Promise<SyncResult>
  envInfo(): Promise<EnvInfo>
  acquire(m: ToolManifest): Promise<void>
  /** 获取社区目录条目：下载后本地自动识别生成 Manifest */
  acquireEntry(e: CatalogEntry): Promise<ToolManifest>
  start(m: ToolManifest): Promise<{ openUrl: string; port: number }>
  stop(id: string): Promise<void>
  remove(id: string): Promise<void>
  updateTool(m: ToolManifest): Promise<{ updated: boolean; message: string }>
  /** 保存/重置 Manifest 本地覆盖，返回合并后的最新 Manifest */
  saveOverride(patch: ManifestOverride): Promise<ToolManifest | null>
  resetOverride(id: string): Promise<ToolManifest | null>
  logs(id: string): Promise<string[]>
  termOpen(id: string): Promise<void>
  termWrite(id: string, data: string): Promise<void>
  termClose(id: string): Promise<void>
  storageList(): Promise<StorageInfo[]>
  clearDeps(id: string): Promise<void>
  getPrefs(): Promise<Prefs>
  setPrefs(p: Prefs): Promise<Prefs>
  openExternal(url: string): Promise<void>
  /** 首次启动向导状态（仅安装态需要） */
  wizardStatus(): Promise<WizardStatus>
  completeWizard(payload: { dataRoot?: string; token?: string; syncNow: boolean }): Promise<void>
  chooseDirectory(): Promise<string | null>
  /** 从发布仓库拉取官方 Manifest 增量（FR-DIST-03） */
  syncManifests(): Promise<ManifestSyncResult>
  /** 检查宿主新版本（安装态 = electron-updater 静默检查；便携/开发态 = GitHub API 对比） */
  checkHostUpdate(): Promise<HostUpdateInfo>
  /** 当前更新通道状态快照（页面挂载时用） */
  getHostUpdateStatus(): Promise<HostUpdateInfo>
  /** 应用更新：已下载则退出安装，否则检查/下载 */
  applyHostUpdate(): Promise<HostUpdateInfo>
  /** 订阅更新通道状态广播 */
  onHostUpdate(cb: (v: HostUpdateEvent) => void): () => void
  /** 数据目录迁移（停止全部工具并复制数据到新根，需重启生效） */
  migrateDataRoot(target: string): Promise<{ moved: string[] }>
  backupExport(): Promise<string | null>
  backupImport(): Promise<{ restored: string[] } | null>
  onToolState(cb: (s: StateEvent) => void): () => void
  onToolLog(cb: (v: LogEvent) => void): () => void
  onProgress(cb: (v: ProgressEvent) => void): () => void
  onTermData(cb: (v: TermDataEvent) => void): () => void
  /** 托盘点击运行中工具 */
  onFocusTool(cb: (v: { id: string }) => void): () => void
  onSyncLog(cb: (v: SyncLogEvent) => void): () => void
}
