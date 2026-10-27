/**
 * 打包前下载 Node sidecar（FR-DIST-08）：
 * 从 npmmirror 的 node 镜像下载 Windows x64 官方 zip，解压到 build-resources/runtimes/node/，
 * electron-builder 经 extraResources 将其内置进安装包，使目标机器无需预装 Node。
 *
 * 已存在时跳过；可用 NODE_MIRROR / NODE_VERSION 环境变量覆盖。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const NODE_VERSION = process.env.NODE_VERSION || 'v20.18.1'
const MIRROR = process.env.NODE_MIRROR || 'https://npmmirror.com/mirrors/node/'
const ARCH = process.platform === 'win32' ? 'win-x64' : null

if (!ARCH) {
  console.log('[fetch-node] 当前平台非 Windows，跳过（macOS/Linux 打包时再适配）')
  process.exit(0)
}

const url = `${MIRROR}${NODE_VERSION}/node-${NODE_VERSION}-${ARCH}.zip`
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build-resources', 'runtimes')
const nodeDir = path.join(outDir, 'node')

if (fs.existsSync(path.join(nodeDir, 'node.exe'))) {
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

if (!fs.existsSync(path.join(nodeDir, 'node.exe'))) {
  throw new Error('解压后未找到 node.exe')
}
console.log(`[fetch-node] 完成：${path.join(nodeDir, 'node.exe')}`)
