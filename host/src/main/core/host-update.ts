import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { HostUpdateEvent, HostUpdateInfo, HostUpdatePhase } from '../../common/types'
import { broadcast } from './events'
import { getPrefs } from './store'

/**
 * 宿主自更新（FR-DIST-07）双通道实现：
 * - NSIS 安装态：electron-updater 静默更新（启动后延迟检查 + 每 6 小时轮询，
 *   发现新版自动下载，退出时静默安装；可在设置中关闭）。
 * - 便携版 / 开发态：便携 exe 无固定安装目录无法自更新，保持 GitHub API 对比
 *   并引导到 Release 页。
 * 更新源优先取设置中的 releaseRepo（fork 用户），否则用打包内 app-update.yml
 * （由 electron-builder publish 配置生成）。
 */

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const FIRST_CHECK_DELAY_MS = 15 * 1000

let phase: HostUpdatePhase = 'idle'
let latest: string | null = null
let progress = 0
let message: string | undefined
let timer: NodeJS.Timeout | undefined
let wired = false

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((s) => parseInt(s, 10) || 0)
  const pb = b.split('.').map((s) => parseInt(s, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

/** 静默更新通道可用 = NSIS 安装态（便携 exe 由 PORTABLE_EXECUTABLE_DIR 标识） */
export function isSilentUpdateChannel(): boolean {
  return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR
}

function emit(p: HostUpdatePhase, extra: Partial<HostUpdateEvent> = {}): void {
  phase = p
  if (extra.message !== undefined) message = extra.message
  const event: HostUpdateEvent = {
    phase,
    version: latest ?? undefined,
    progress: phase === 'downloading' ? progress : undefined,
    message
  }
  broadcast('host-update', { ...event, ...extra })
}

function applyFeed(): void {
  const repo = getPrefs().releaseRepo?.trim() ?? ''
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(repo)
  if (m && m[1] && m[2]) {
    autoUpdater.setFeedURL({ provider: 'github', owner: m[1], repo: m[2] })
  }
}

function wireEvents(): void {
  if (wired) return
  wired = true
  autoUpdater.on('checking-for-update', () => emit('checking'))
  autoUpdater.on('update-available', (v) => {
    latest = v.version
    progress = 0
    if (autoUpdater.autoDownload) {
      emit('downloading', { message: `发现新版本 v${v.version}，自动下载中` })
    } else {
      emit('idle', { message: `发现新版本 v${v.version}，可在设置中下载` })
    }
  })
  autoUpdater.on('update-not-available', (v) => {
    latest = null
    emit('idle', { message: `已是最新版本（v${v.version}）` })
  })
  autoUpdater.on('download-progress', (p) => {
    const pct = Math.round(p.percent)
    if (pct !== progress) {
      progress = pct
      emit('downloading', { progress: pct })
    }
  })
  autoUpdater.on('update-downloaded', (v) => {
    progress = 100
    latest = v.version
    emit('downloaded', { message: `v${v.version} 已就绪，重启应用即完成安装` })
  })
  autoUpdater.on('error', (e) => {
    emit('error', { message: `更新失败：${e.message}` })
  })
}

/** 把设置中的开关同步到 updater（prefs:set 后调用） */
export function syncAutoUpdatePref(): void {
  if (!isSilentUpdateChannel()) return
  const enabled = getPrefs().autoUpdate !== false
  autoUpdater.autoDownload = enabled
  autoUpdater.autoInstallOnAppQuit = enabled
  if (!enabled && phase === 'downloading') {
    // electron-updater 6 无取消下载 API：让进行中的下载自然结束，但不再自动安装
    emit('idle', { message: '已关闭自动更新（进行中的下载完成后不会自动安装）' })
  }
}

/** 应用就绪后调用：仅在安装态接通 electron-updater 并排定后台检查 */
export function initHostUpdater(): void {
  if (!isSilentUpdateChannel()) return
  applyFeed()
  wireEvents()
  syncAutoUpdatePref()
  timer = setInterval(() => {
    void checkHostUpdate()
  }, CHECK_INTERVAL_MS)
  timer.unref()
  setTimeout(() => {
    void checkHostUpdate()
  }, FIRST_CHECK_DELAY_MS).unref()
}

export function getHostUpdateInfo(): HostUpdateInfo {
  const current = app.getVersion()
  const hasUpdate = latest != null && compareVersions(current, latest) < 0
  const p: HostUpdatePhase = phase
  return {
    current,
    latest,
    hasUpdate,
    message,
    silent: isSilentUpdateChannel(),
    phase: isSilentUpdateChannel() ? p : undefined,
    progress: p === 'downloading' ? progress : undefined
  }
}

async function silentCheck(): Promise<void> {
  emit('checking')
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    emit('error', { message: `更新检查失败：${(e as Error).message}` })
  }
}

/** 应用更新：已下载 → 退出并安装；未检查 → 先检查；已发现新版 → 直接下载 */
export async function applyHostUpdate(): Promise<HostUpdateInfo> {
  if (!isSilentUpdateChannel()) return getHostUpdateInfo()
  const p: HostUpdatePhase = phase
  if (p === 'downloaded') {
    if (timer) clearInterval(timer)
    autoUpdater.quitAndInstall(false, true)
    return getHostUpdateInfo()
  }
  if (p === 'downloading') return getHostUpdateInfo()
  if (latest == null) {
    await silentCheck()
    const after: HostUpdatePhase = phase
    if (latest == null || after === 'downloading') return getHostUpdateInfo()
  }
  try {
    if (autoUpdater.autoDownload) {
      emit('downloading', { message: `v${latest} 下载中` })
      await autoUpdater.downloadUpdate()
    } else {
      emit('idle', { message: '已在设置中关闭自动下载，请开启后重试' })
    }
  } catch (e) {
    emit('error', { message: `下载失败：${(e as Error).message}` })
  }
  return getHostUpdateInfo()
}

/** 手动/定时检查入口：静默通道走 updater，其余走 GitHub API 对比 */
export async function checkHostUpdate(): Promise<HostUpdateInfo> {
  if (isSilentUpdateChannel()) {
    await silentCheck()
    return getHostUpdateInfo()
  }
  return apiCheck()
}

async function apiCheck(): Promise<HostUpdateInfo> {
  const current = app.getVersion()
  const repo = getPrefs().releaseRepo?.trim() ?? ''
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    message = '未配置发布仓库（owner/repo），无法检查更新'
    return { current, latest: null, hasUpdate: false, message, silent: false }
  }
  const headers: Record<string, string> = { 'User-Agent': 'all-tools-host' }
  const token = getPrefs().githubToken
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers })
    if (res.status === 404) {
      message = '发布仓库暂无 Release'
      return { current, latest: null, hasUpdate: false, message, silent: false }
    }
    if (!res.ok) {
      message = `GitHub API HTTP ${res.status}`
      return { current, latest: null, hasUpdate: false, message, silent: false }
    }
    const rel = (await res.json()) as { tag_name?: string; html_url?: string }
    const found = (rel.tag_name ?? '').replace(/^v/, '')
    if (!found) {
      message = 'Release 无版本号'
      return { current, latest: null, hasUpdate: false, message, silent: false }
    }
    const hasUpdate = compareVersions(current, found) < 0
    latest = hasUpdate ? found : null
    message = hasUpdate ? `发现新版本 v${found}` : '已是最新版本'
    return {
      current,
      latest: hasUpdate ? found : null,
      hasUpdate,
      releaseUrl: rel.html_url,
      message,
      silent: false
    }
  } catch (e) {
    message = `检查失败：${(e as Error).message}`
    return { current, latest: null, hasUpdate: false, message, silent: false }
  }
}
