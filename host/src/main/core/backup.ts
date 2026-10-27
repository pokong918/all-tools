import type { Prefs } from '../../common/types'
import { getCatalogCache, getInstalledAll, getPrefs, loadOverrides, saveCatalogCache, savePrefs } from './store'
import { resetOverride, saveOverride } from './store'
import type { ManifestOverride } from '../../common/types'

export interface BackupFile {
  app: 'all-tools'
  version: 1
  exportedAt: string
  prefs: Prefs
  overrides: Record<string, ManifestOverride>
  catalogCacheSize: number
  catalogCache?: Record<string, unknown>
}

/** 组装备份（收藏/最近/Token/发布仓库/清单覆盖/目录缓存；工具本体不包含，需重新获取） */
export function buildBackup(): BackupFile {
  const cache = getCatalogCache()
  return {
    app: 'all-tools',
    version: 1,
    exportedAt: new Date().toISOString(),
    prefs: getPrefs(),
    overrides: loadOverrides(),
    catalogCacheSize: Object.keys(cache).length,
    catalogCache: cache
  }
}

/** 应用备份：恢复偏好与覆盖；installed 记录不迁移（本机目录不存在），工具需重新获取 */
export function applyBackup(data: unknown): { restored: string[] } {
  const b = data as BackupFile
  if (b?.app !== 'all-tools' || b.version !== 1) {
    throw new Error('不是有效的 All-Tools 备份文件')
  }
  const restored: string[] = []
  if (b.prefs) {
    savePrefs({ ...getPrefs(), ...b.prefs })
    restored.push('偏好设置')
  }
  if (b.overrides) {
    for (const o of Object.values(b.overrides)) saveOverride(o)
    restored.push('适配覆盖')
  }
  if (b.catalogCache && typeof b.catalogCache === 'object') {
    saveCatalogCache(b.catalogCache as Record<string, never>)
    restored.push('目录缓存')
  }
  return { restored }
}

/** 清空全部覆盖（换清单源时使用，可选） */
export function clearAllOverrides(): void {
  for (const id of Object.keys(loadOverrides())) resetOverride(id)
}

export function installedCount(): number {
  return Object.keys(getInstalledAll()).length
}
