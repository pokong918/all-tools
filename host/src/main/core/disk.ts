import fs from 'node:fs'
import path from 'node:path'
import { paths } from './paths'
import { getInstalledAll } from './store'
import type { StorageInfo } from '../../common/types'

/** 共享 npm 缓存虚拟条目 ID（storage:list 中出现，清理时不触发重装） */
export const NPM_CACHE_ID = '__npm-cache'

const DEP_DIRS = ['node_modules', '.venv', 'target', '__pycache__', '.gradle', 'vendor']

function dirSize(p: string): number {
  let total = 0
  const stack: string[] = [p]
  while (stack.length) {
    const cur = stack.pop()!
    let st: fs.Stats
    try {
      st = fs.lstatSync(cur)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      let names: string[] = []
      try {
        names = fs.readdirSync(cur)
      } catch {
        continue
      }
      for (const n of names) stack.push(path.join(cur, n))
    } else {
      total += st.size
    }
  }
  return total
}

/** 各工具磁盘占用（FR-STG-01）：依赖目录单列 */
export function storageOverview(): StorageInfo[] {
  const out: StorageInfo[] = []
  for (const inst of Object.values(getInstalledAll())) {
    if (!inst.dir || !fs.existsSync(inst.dir)) continue
    let deps = 0
    for (const d of DEP_DIRS) {
      const dp = path.join(inst.dir, d)
      if (fs.existsSync(dp)) deps += dirSize(dp)
    }
    const total = dirSize(inst.dir)
    out.push({ id: inst.id, name: inst.id, dir: inst.dir, deps, code: total - deps, total })
  }
  // 共享 npm 缓存（所有 web-node 工具共用，位于数据目录）
  const npmCache = path.join(paths.dataDir, 'npm-cache')
  if (fs.existsSync(npmCache)) {
    const size = dirSize(npmCache)
    if (size > 0) {
      out.push({ id: NPM_CACHE_ID, name: 'npm 下载缓存（全部工具共享）', dir: npmCache, deps: size, code: 0, total: size })
    }
  }
  return out.sort((a, b) => b.total - a.total)
}

/** 清理依赖目录（npm 缓存虚拟条目直接清理，不重装）；配合 lifecycle.reinstall 重装 */
export function clearDeps(id: string): void {
  if (id === NPM_CACHE_ID) {
    fs.rmSync(path.join(paths.dataDir, 'npm-cache'), { recursive: true, force: true })
    return
  }
  const inst = getInstalledAll()[id]
  if (!inst?.dir) return
  for (const d of DEP_DIRS) {
    fs.rmSync(path.join(inst.dir, d), { recursive: true, force: true })
  }
}
