export type ToolType = 'web-node' | 'web-static' | 'web-python' | 'docker' | 'cli' | 'desktop'

export interface ToolManifest {
  id: string
  name: string
  description: string
  descriptionZh?: string
  /** https://github.com/{owner}/{repo} */
  repo: string
  homepage?: string
  category: string
  tags?: string[]
  /** 编写时量级，仅展示参考 */
  stars?: number
  type: ToolType
  runtime?: { node?: string }
  /** 支持 {port} 占位符 */
  install?: string
  /** 支持 {port} / {venv-py} 占位符；#static=宿主静态服务，#terminal=内嵌终端，{compose}=docker compose */
  start: string
  port?: { default?: number; env?: string }
  healthCheck?: { kind?: 'http' | 'tcp'; path?: string; timeoutMs?: number }
  /** 相对路径（以 / 开头），支持 {port} */
  openUrl: string
  dataDirs?: string[]
  notes?: string
  /** preset=官方预置清单；auto=获取社区工具时本地自动识别生成 */
  origin?: 'preset' | 'auto'
}

export type ToolState =
  | 'not-downloaded'
  | 'downloading'
  | 'installing'
  | 'ready'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'error'

export interface InstalledTool {
  id: string
  dir: string
  installedAt: string
  source: 'git' | 'zip' | 'release'
  commitOrBranch?: string
  state: ToolState
  port?: number
  pid?: number
  lastError?: string
}

/** GitHub 采集目录条目（FR-CAT-01，粗标类型，获取后由本地精判覆盖） */
export interface CatalogEntry {
  /** owner/name */
  repo: string
  name: string
  description: string
  stars: number
  language: string | null
  topics: string[]
  pushedAt: string
  toolType: ToolType | 'unknown'
  category: string
  homepage?: string
  collectedAt: string
}

export interface ToolListItem {
  manifest: ToolManifest
  installed: boolean
  state: ToolState
  port?: number
  lastError?: string
  /** 官方预置适配 = true；自动适配生成 = false */
  official: boolean
}

export interface CatalogView {
  tools: ToolListItem[]
  community: CatalogEntry[]
}

export interface Prefs {
  favorites: string[]
  recent: string[]
  githubToken?: string
  /** 发布仓库 owner/repo：Manifest 远程同步与宿主更新检查共用 */
  releaseRepo?: string
  wizardDone?: boolean
}

export interface DriveInfo {
  path: string
  free: number
}

export interface WizardStatus {
  need: boolean
  isPackaged: boolean
  defaultRoot: string
  currentRoot: string
  drives: DriveInfo[]
}

export interface ManifestSyncResult {
  added: number
  updated: number
  total: number
}

export interface HostUpdateInfo {
  current: string
  latest: string | null
  hasUpdate: boolean
  releaseUrl?: string
  message?: string
}

/** Manifest 本地覆盖（可视化编辑，浅合并到官方/自动清单之上） */
export interface ManifestOverride {
  id: string
  start?: string
  port?: { default?: number; env?: string }
  openUrl?: string
  healthCheck?: { path?: string; timeoutMs?: number }
  notes?: string
}

export interface EnvInfo {
  node: string | null
  npm: string | null
  git: string | null
  python: string | null
  docker: string | null
}

export interface SyncResult {
  added: number
  updated: number
  total: number
  requests: number
  /** 非空 = 本次同步提前中止（限速/网络），已保留部分结果 */
  note?: string
}

export interface StorageInfo {
  id: string
  name: string
  dir: string
  /** bytes，除依赖外 */
  code: number
  /** bytes，node_modules/.venv 等依赖目录 */
  deps: number
  total: number
}
