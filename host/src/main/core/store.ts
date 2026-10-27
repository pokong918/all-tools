import fs from 'node:fs'
import path from 'node:path'
import { paths } from './paths'
import type { CatalogEntry, InstalledTool, Prefs, ToolManifest } from '../../common/types'

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

const installedFile = (): string => path.join(paths.dataDir, 'installed.json')
const prefsFile = (): string => path.join(paths.dataDir, 'prefs.json')
const catalogCacheFile = (): string => path.join(paths.dataDir, 'catalog-cache.json')
const autoManifestsDir = (): string => path.join(paths.dataDir, 'auto-manifests')

export function getInstalledAll(): Record<string, InstalledTool> {
  return readJson<Record<string, InstalledTool>>(installedFile(), {})
}

export function saveInstalledAll(map: Record<string, InstalledTool>): void {
  writeJsonAtomic(installedFile(), map)
}

export function getInstalled(id: string): InstalledTool | undefined {
  return getInstalledAll()[id]
}

export function upsertInstalled(tool: InstalledTool): void {
  const map = getInstalledAll()
  map[tool.id] = { ...map[tool.id], ...tool }
  saveInstalledAll(map)
}

export function removeInstalled(id: string): void {
  const map = getInstalledAll()
  delete map[id]
  saveInstalledAll(map)
}

export function getPrefs(): Prefs {
  return readJson<Prefs>(prefsFile(), { favorites: [], recent: [] })
}

export function savePrefs(p: Prefs): void {
  writeJsonAtomic(prefsFile(), p)
}

export function touchRecent(id: string): void {
  const p = getPrefs()
  p.recent = [id, ...p.recent.filter((r) => r !== id)].slice(0, 10)
  savePrefs(p)
}

/** GitHub 采集目录缓存（键：owner/name） */
export function getCatalogCache(): Record<string, CatalogEntry> {
  return readJson<Record<string, CatalogEntry>>(catalogCacheFile(), {})
}

export function saveCatalogCache(map: Record<string, CatalogEntry>): void {
  writeJsonAtomic(catalogCacheFile(), map)
}

/** 自动适配生成的 Manifest（社区工具获取后落盘，与官方清单共同构成目录） */
export function saveAutoManifest(m: ToolManifest): void {
  fs.mkdirSync(autoManifestsDir(), { recursive: true })
  writeJsonAtomic(path.join(autoManifestsDir(), `${m.id}.json`), m)
}

export function loadAutoManifests(): ToolManifest[] {
  const dir = autoManifestsDir()
  if (!fs.existsSync(dir)) return []
  const list: ToolManifest[] = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      list.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as ToolManifest)
    } catch (e) {
      console.warn(`[auto-manifest] ${f} 解析失败：`, e)
    }
  }
  return list
}
