import fs from 'node:fs'
import type { DriveInfo } from '../../common/types'

/** 枚举 Windows 盘符与剩余空间（供首次启动向导选择数据盘） */
export function listDrives(): DriveInfo[] {
  const out: DriveInfo[] = []
  for (let code = 65; code <= 90; code++) {
    const drive = `${String.fromCharCode(code)}:\\`
    try {
      const st = fs.statfsSync(drive)
      if (st.blocks > 0) {
        out.push({ path: drive, free: Number(st.bavail) * Number(st.bsize) })
      }
    } catch {
      // 盘符不存在
    }
  }
  return out.sort((a, b) => b.free - a.free)
}

export function fmtBytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(0)} GB`
}
