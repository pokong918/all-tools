import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

/**
 * 双形态路径唯一出口（FR-DIST-01/02）。
 * 开发态：项目根 = 源码仓库根（all-tools/），工具与数据直接落在仓库内。
 * 安装态：项目根 = userData，或用户在首次启动向导中自选的数据根目录
 *        （选择持久化在 userData/data-root.json，即「本项目下载到哪个盘」）。
 * 业务代码禁止在此之外拼接磁盘路径。
 */

// 编译产物位于 all-tools/host/out/main/core/ → 上溯 4 级到仓库根
function devProjectRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..')
}

const isPackaged = app.isPackaged

function dataRootMarker(): string {
  return path.join(app.getPath('userData'), 'data-root.json')
}

function readCustomRoot(): string | null {
  try {
    const m = JSON.parse(fs.readFileSync(dataRootMarker(), 'utf8')) as { dataRoot?: string }
    if (m.dataRoot && fs.existsSync(m.dataRoot)) return m.dataRoot
  } catch {
    // 未配置
  }
  return null
}

export const paths = {
  get isDev(): boolean {
    return !isPackaged
  },
  get projectRoot(): string {
    if (isPackaged) return readCustomRoot() ?? app.getPath('userData')
    return devProjectRoot()
  },
  get toolsDir(): string {
    return path.join(this.projectRoot, 'tools')
  },
  get dataDir(): string {
    return path.join(this.projectRoot, 'data')
  },
  get manifestsDir(): string {
    if (isPackaged) return path.join(this.projectRoot, 'manifests')
    return path.join(devProjectRoot(), 'manifests')
  },
  ensure(): void {
    for (const dir of [this.toolsDir, this.dataDir]) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
}

/** 设置自定义数据根目录（向导/设置页调用；重启后完全生效） */
export function setDataRoot(root: string): void {
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(dataRootMarker(), JSON.stringify({ dataRoot: root }, null, 2), 'utf8')
}
