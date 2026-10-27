/**
 * 打包前下载 Node sidecar（FR-DIST-08）：
 * 从 npmmirror 的 node 镜像下载官方二进制，解压到 build-resources/runtimes/node/，
 * electron-builder 经 extraResources 将其内置进安装包，使目标机器无需预装 Node。
 *
 * 平台：Windows zip（adm-zip）；macOS/Linux tar（系统 tar 命令解压）。
 * 注意：macOS/Linux 打包链路尚未端到端实测（M4 准备阶段）。
 *
 * 已存在时跳过；可用 NODE_MIRROR / NODE_VERSION 环境变量覆盖。
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const NODE_VERSION = process.env.NODE_VERSION || 'v20.18.1'
const MIRROR = process.env.NODE_MIRROR || 'https://npmmirror.com/mirrors/node/'

const MATRIX = {
  win32: { arch: 'win-x64', ext: 'zip' },
  darwin: { arch: process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64', ext: 'tar.gz' },
  linux: { arch: process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64', ext: 'tar.xz' }
}

const PLATFORM = MATRIX[process.platform]
if (!PLATFORM) {
  console.log(`[fetch-node] 不支持的平台 ${process.platform}，跳过`)
  process.exit(0)
}

const nodeExeName = process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node')
const url = `${MIRROR}${NODE_VERSION}/node-${NODE_VERSION}-${PLATFORM.arch}.${PLATFORM.ext}`
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build-resources', 'runtimes')
const nodeDir = path.join(outDir, 'node')

if (fs.existsSync(path.join(nodeDir, nodeExeName))) {
  console.log(`[fetch-node] sidecar node ${NODE_VERSION} 已存在，跳过`)
  process.exit(0)
}

console.log(`[fetch-node] 下载 ${url}`)
const res = await fetch(url, { redirect: 'follow' })
if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)
const buf = Buffer.from(await res.arrayBuffer())
console.log(`[fetch-node] ${(buf.length / 1e6).toFixed(1)} MB，解压中…`)

fs.rmSync(nodeDir, { recursive: true, force: true })
fs.mkdirSync(nodeDir, { recursive: true })

if (PLATFORM.ext === 'zip') {
  new AdmZip(buf).extractAllTo(nodeDir, true)
  // 官方 zip 根目录为 node-vX-win-x64/，上提一级
  const entries = fs.readdirSync(nodeDir).filter((e) => !e.startsWith('.'))
  if (entries.length === 1 && fs.statSync(path.join(nodeDir, entries[0])).isDirectory()) {
    const inner = path.join(nodeDir, entries[0])
    for (const e of fs.readdirSync(inner)) {
      fs.renameSync(path.join(inner, e), path.join(nodeDir, e))
    }
    fs.rmSync(inner, { recursive: true, force: true })
  }
} else {
  const tarFile = path.join(outDir, `node-sidecar.${PLATFORM.ext}`)
  fs.writeFileSync(tarFile, buf)
  const tar = spawnSync('tar', ['-xf', tarFile, '-C', nodeDir, '--strip-components', '1'], { stdio: 'inherit' })
  fs.rmSync(tarFile, { force: true })
  if (tar.status !== 0) throw new Error('tar 解压失败')
  try {
    fs.chmodSync(path.join(nodeDir, 'bin', 'node'), 0o755)
  } catch {
    // 忽略
  }
}

if (!fs.existsSync(path.join(nodeDir, nodeExeName))) {
  throw new Error(`解压后未找到 ${nodeExeName}`)
}
console.log(`[fetch-node] 完成：${path.join(nodeDir, nodeExeName)}`)
