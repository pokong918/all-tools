import fs from 'node:fs'
import path from 'node:path'
import type { ManifestSyncResult } from '../../common/types'
import { paths } from './paths'
import { getPrefs } from './store'
import { broadcast } from './events'

/**
 * Manifest 库远程热更新（FR-DIST-03）：
 * 从发布仓库（prefs.releaseRepo = owner/repo）的 manifests/tools/ 拉取清单增量，
 * 以文件 sha 判断变更，写入本地 manifests 目录，使老版本宿主也能获得新适配。
 */

interface GhContentEntry {
  name: string
  sha: string
  download_url: string | null
}

export async function syncManifests(): Promise<ManifestSyncResult> {
  const repo = getPrefs().releaseRepo?.trim() ?? ''
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error('请先在「设置」中配置发布仓库（owner/repo）')
  }
  const token = getPrefs().githubToken
  const headers: Record<string, string> = {
    'User-Agent': 'all-tools-host',
    Accept: 'application/vnd.github+json'
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/manifests/tools`, { headers })
  if (res.status === 404) throw new Error(`仓库 ${repo} 中未找到 manifests/tools 目录`)
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`)
  const entries = ((await res.json()) as GhContentEntry[]).filter(
    (e) => e.name.endsWith('.json') && e.download_url
  )

  const shaFile = path.join(paths.dataDir, 'manifest-sha.json')
  let shaMap: Record<string, string> = {}
  try {
    shaMap = JSON.parse(fs.readFileSync(shaFile, 'utf8')) as Record<string, string>
  } catch {
    // 首次同步
  }

  const toolsDir = path.join(paths.manifestsDir, 'tools')
  fs.mkdirSync(toolsDir, { recursive: true })
  fs.mkdirSync(paths.dataDir, { recursive: true })

  let added = 0
  let updated = 0
  for (const e of entries) {
    if (shaMap[e.name] === e.sha) continue
    broadcast('sync-log', { line: `拉取清单 ${e.name}` })
    const raw = await fetch(e.download_url!, { headers: { 'User-Agent': 'all-tools-host' } })
    if (!raw.ok) continue
    const text = await raw.text()
    try {
      JSON.parse(text)
    } catch {
      continue
    }
    fs.writeFileSync(path.join(toolsDir, e.name), text, 'utf8')
    if (shaMap[e.name]) updated++
    else added++
    shaMap[e.name] = e.sha
  }

  fs.writeFileSync(shaFile, JSON.stringify(shaMap, null, 2), 'utf8')
  const result: ManifestSyncResult = { added, updated, total: entries.length }
  broadcast('sync-log', { line: `清单同步完成：新增 ${added}，更新 ${updated}，远端共 ${result.total} 份` })
  return result
}
