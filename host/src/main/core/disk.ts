import fs from 'node:fs'
import path from 'node:path'
import type { StorageInfo } from '../../common/types'
import { getInstalledAll } from './store'

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
  return out.sort((a, b) => b.total - a.total)
}

/** 清理依赖目录（配合 lifecycle.reinstall 重装） */
export function clearDeps(id: string): void {
  const inst = getInstalledAll()[id]
  if (!inst?.dir) return
  for (const d of DEP_DIRS) {
    fs.rmSync(path.join(inst.dir, d), { recursive: true, force: true })
  }
}
