import { app } from 'electron'
import type { HostUpdateInfo } from '../../common/types'
import { getPrefs } from './store'

/**
 * 宿主自更新检查（FR-DIST-07 轻量实现）：
 * 对比 GitHub Release 最新 tag 与当前版本，发现新版即引导下载。
 * 完整的 electron-updater 静默更新待发布渠道确定后接入。
 */

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((s) => parseInt(s, 10) || 0)
  const pb = b.split('.').map((s) => parseInt(s, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

export async function checkHostUpdate(): Promise<HostUpdateInfo> {
  const current = app.getVersion()
  const repo = getPrefs().releaseRepo?.trim() ?? ''
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return { current, latest: null, hasUpdate: false, message: '未配置发布仓库（owner/repo），无法检查更新' }
  }
  const headers: Record<string, string> = { 'User-Agent': 'all-tools-host' }
  const token = getPrefs().githubToken
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers })
    if (res.status === 404) {
      return { current, latest: null, hasUpdate: false, message: '发布仓库暂无 Release' }
    }
    if (!res.ok) return { current, latest: null, hasUpdate: false, message: `GitHub API HTTP ${res.status}` }
    const rel = (await res.json()) as { tag_name?: string; html_url?: string }
    const latest = (rel.tag_name ?? '').replace(/^v/, '')
    if (!latest) return { current, latest: null, hasUpdate: false, message: 'Release 无版本号' }
    const hasUpdate = compareVersions(current, latest) < 0
    return {
      current,
      latest,
      hasUpdate,
      releaseUrl: rel.html_url,
      message: hasUpdate ? `发现新版本 v${latest}` : '已是最新版本'
    }
  } catch (e) {
    return { current, latest: null, hasUpdate: false, message: `检查失败：${(e as Error).message}` }
  }
}
