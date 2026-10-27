import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { paths, setDataRoot } from './paths'
import { stop } from './lifecycle'
import { closeAllTerminals } from './runners/cli'
import { getInstalledAll } from './store'

/**
 * 数据目录迁移（FR-SET 数据备份/换机场景）：
 * 停止全部工具 → 复制 tools/ data/（安装态含 manifests/）到新根 → 切换 data-root 标记。
 * 需重启应用后完全生效。
 */
export async function migrateDataRoot(target: string): Promise<{ moved: string[] }> {
  const normalized = path.resolve(target)
  if (normalized === path.resolve(paths.projectRoot)) {
    throw new Error('新目录与当前数据目录相同')
  }
  if (normalized.startsWith(path.resolve(paths.projectRoot) + path.sep)) {
    throw new Error('新目录不能位于当前数据目录内部')
  }
  await fsp.mkdir(normalized, { recursive: true })

  // 停止一切本地进程
  closeAllTerminals()
  for (const id of Object.keys(getInstalledAll())) {
    try {
      await stop(id)
    } catch {
      // 尽力而为
    }
  }

  const moved: string[] = []
  const sources: [string, string][] = [
    ['tools', paths.toolsDir],
    ['data', paths.dataDir],
    ['manifests', paths.manifestsDir]
  ]
  for (const [name, src] of sources) {
    if (!fs.existsSync(src)) continue
    const dst = path.join(normalized, name)
    if (path.resolve(dst) === path.resolve(src)) continue
    await fsp.cp(src, dst, { recursive: true, force: true })
    moved.push(name)
  }

  setDataRoot(normalized)
  return { moved }
}
