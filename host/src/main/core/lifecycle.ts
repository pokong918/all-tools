import type { ChildProcess } from 'node:child_process'
import type { Server } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { CatalogEntry, ToolManifest, ToolState } from '../../common/types'
import {
  getInstalled,
  getInstalledAll,
  removeInstalled,
  saveAutoManifest,
  saveInstalledAll,
  upsertInstalled
} from './store'
import { downloadReleaseAsset, downloadTool } from './downloader'
import { detectAndBuildManifest, slugifyId } from './autodetect'
import { spawn } from 'node:child_process'
import { allocatePort, isPortFree, releasePort } from './ports'
import { startStaticServer } from './runners/web-static'
import { killTree, npmInstall, startNodeApp } from './runners/web-node'
import { ensureVenv, pipInstall, venvPythonPath } from './runners/web-python'
import { composeDown, composeUp } from './runners/docker'
import { closeAllTerminals, closeTerminal, openTerminal } from './runners/cli'
import { pythonExe } from './env'
import { broadcast } from './events'

interface Runtime {
  child?: ChildProcess
  server?: Server
  logs: string[]
  openUrl?: string
  manifest?: ToolManifest
  composeDir?: string
}

const runtimes = new Map<string, Runtime>()

function ensureRuntime(id: string): Runtime {
  let rt = runtimes.get(id)
  if (!rt) {
    rt = { logs: [] }
    runtimes.set(id, rt)
  }
  return rt
}

export function log(id: string, line: string): void {
  const rt = ensureRuntime(id)
  rt.logs.push(line)
  if (rt.logs.length > 800) rt.logs.splice(0, rt.logs.length - 800)
  broadcast('tool-log', { id, line })
}

export function getLogs(id: string): string[] {
  return [...ensureRuntime(id).logs]
}

function setState(
  id: string,
  state: ToolState,
  extra?: Partial<{ port: number; pid: number; lastError: string }>
): void {
  const inst = getInstalled(id)
  if (!inst) return
  const next = { ...inst, ...extra, state }
  if (state !== 'error') next.lastError = undefined
  upsertInstalled(next)
  broadcast('tool-state', { id, state, port: next.port })
}

/** 宿主启动时归位遗留的中间态（进程不可能跨宿主存活） */
export function initLifecycle(): void {
  const map = getInstalledAll()
  for (const t of Object.values(map)) {
    if (['downloading', 'installing', 'starting', 'running'].includes(t.state)) {
      t.state = 'stopped'
      t.pid = undefined
    }
  }
  saveInstalledAll(map)
}

/** 安装阶段（按类型分派）：acquire / update / reinstall 共用 */
export async function installPhase(
  manifest: ToolManifest,
  dir: string,
  onLog: (s: string) => void
): Promise<void> {
  if (manifest.type === 'web-node') {
    onLog('[宿主] 安装依赖（npm install），首次可能较慢…')
    await npmInstall(dir, onLog)
  } else if (manifest.type === 'web-python') {
    const py = pythonExe()
    if (!py) throw new Error('未检测到 Python，请先安装 Python 3 并加入 PATH')
    const vpy = await ensureVenv(dir, py, onLog)
    await pipInstall(dir, vpy, onLog)
  }
  // docker / cli / web-static：无需安装期动作
}

/** 获取官方预置清单工具 */
export async function acquire(manifest: ToolManifest): Promise<void> {
  const id = manifest.id
  if (getInstalled(id)) throw new Error('该工具已获取')
  ensureRuntime(id).logs = []
  upsertInstalled({
    id,
    dir: '',
    installedAt: new Date().toISOString(),
    source: 'git',
    state: 'downloading'
  })
  log(id, `[宿主] 开始获取 ${manifest.repo}`)
  try {
    const { dir, source } =
      manifest.type === 'desktop'
        ? await downloadReleaseAsset(id, manifest.repo, (l) => log(id, l))
        : await downloadTool(id, manifest.repo, (l) => log(id, l))
    upsertInstalled({ ...getInstalled(id)!, dir, source })
    setState(id, 'installing')
    await installPhase(manifest, dir, (l) => log(id, l))
    setState(id, 'ready')
    log(id, '[宿主] 工具已就绪，可以启动')
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    log(id, `[宿主] 获取失败：${msg}`)
    setState(id, 'error', { lastError: msg })
    throw e
  }
}

/** 获取社区目录条目：下载 → 本地自动识别生成 Manifest → 安装（FR-DL-05） */
export async function acquireEntry(entry: CatalogEntry): Promise<ToolManifest> {
  const id = slugifyId(entry.repo)
  if (getInstalled(id)) throw new Error('该工具已获取')
  ensureRuntime(id).logs = []
  upsertInstalled({
    id,
    dir: '',
    installedAt: new Date().toISOString(),
    source: 'git',
    state: 'downloading'
  })
  log(id, `[宿主] 开始获取 ${entry.repo}（下载后自动识别适配）`)
  try {
    const { dir, source } = await downloadTool(id, `https://github.com/${entry.repo}`, (l) => log(id, l))
    upsertInstalled({ ...getInstalled(id)!, dir, source })
    const manifest = detectAndBuildManifest(dir, entry)
    ensureRuntime(id).manifest = manifest
    saveAutoManifest(manifest)
    log(id, `[适配] 识别为 ${manifest.type}${manifest.notes ? `：${manifest.notes}` : ''}`)
    setState(id, 'installing')
    await installPhase(manifest, dir, (l) => log(id, l))
    setState(id, 'ready')
    log(id, '[宿主] 自动适配完成，可以启动')
    return manifest
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    log(id, `[宿主] 获取失败：${msg}`)
    setState(id, 'error', { lastError: msg })
    throw e
  }
}

/** 在工具目录（深度 2）内寻找可执行文件，排除卸载器 */
function findExecutable(dir: string): string | null {
  const queue: [string, number][] = [[dir, 0]]
  while (queue.length) {
    const [d, depth] = queue.shift()!
    let names: string[] = []
    try {
      names = fs.readdirSync(d)
    } catch {
      continue
    }
    const exe = names.find((n) => n.toLowerCase().endsWith('.exe') && !/unins/i.test(n))
    if (exe) return path.join(d, exe)
    if (depth < 2) {
      for (const n of names) {
        const p = path.join(d, n)
        try {
          if (fs.statSync(p).isDirectory() && !n.startsWith('.')) queue.push([p, depth + 1])
        } catch {
          // 忽略不可访问项
        }
      }
    }
  }
  return null
}

async function waitHealthy(id: string, port: number, manifest: ToolManifest): Promise<void> {  const hc = manifest.healthCheck
  const timeoutMs = hc?.timeoutMs ?? 60000
  const p = hc?.path ?? manifest.openUrl.replaceAll('{port}', String(port))
  const url = `http://127.0.0.1:${port}${p.startsWith('/') ? p : `/${p}`}`
  const deadline = Date.now() + timeoutMs
  log(id, `[宿主] 健康检查 ${url}（最长等待 ${Math.round(timeoutMs / 1000)}s）`)
  while (Date.now() < deadline) {
    const rt = runtimes.get(id)
    if (rt?.child && rt.child.exitCode !== null) {
      throw new Error('工具进程提前退出，请查看日志')
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (res.status < 500) return
    } catch {
      // 尚未就绪，继续轮询
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`健康检查超时（${Math.round(timeoutMs / 1000)}s）`)
}

/** 启动：端口策略 → Runner 分派 → 健康检查 → running，返回窗口内打开地址 */
export async function start(manifest: ToolManifest): Promise<{ openUrl: string; port: number }> {
  const id = manifest.id
  const inst = getInstalled(id)
  if (!inst) throw new Error('工具尚未获取')
  if (inst.state === 'running') {
    const openUrl = runtimes.get(id)?.openUrl
    if (openUrl !== undefined && (inst.port || manifest.type === 'cli')) {
      return { openUrl, port: inst.port ?? 0 }
    }
  }
  ensureRuntime(id).manifest = manifest
  setState(id, 'starting')

  try {
    // CLI：终端会话即"运行"
    if (manifest.type === 'cli') {
      openTerminal(id)
      setState(id, 'running')
      log(id, '[宿主] 已在工具目录打开终端')
      return { openUrl: '', port: 0 }
    }

    // 桌面程序：独立窗口启动（无法嵌入宿主窗口，FR-ADP-07）
    if (manifest.type === 'desktop') {
      const exe = findExecutable(inst.dir)
      if (!exe) throw new Error('工具目录中未找到可执行文件（.exe）')
      log(id, `[宿主] 启动桌面程序：${path.basename(exe)}`)
      const child = spawn(`"${exe}"`, { cwd: inst.dir, shell: true, windowsHide: false })
      const rt = ensureRuntime(id)
      rt.child = child
      child.on('exit', (code) => {
        if (getInstalled(id)?.state === 'running') {
          log(id, `[宿主] 桌面程序已退出（code=${code}）`)
          rt.child = undefined
          rt.openUrl = undefined
          setState(id, 'stopped')
        }
      })
      setState(id, 'running', { pid: child.pid })
      return { openUrl: '', port: 0 }
    }

    // 端口策略：docker 由 compose 固定；其余走端口池
    let port: number
    if (manifest.type === 'docker') {
      port = manifest.port?.default ?? 8080
      if (!(await isPortFree(port))) {
        throw new Error(
          `端口 ${port} 已被占用（compose 端口固定）。请释放该端口或修改工具目录中的 compose 文件后重试。`
        )
      }
    } else {
      port = await allocatePort(id, manifest.port?.default)
    }
    log(id, `[宿主] 使用端口 ${port}，启动中…`)

    if (manifest.type === 'web-static') {
      ensureRuntime(id).server = await startStaticServer(inst.dir, port)
    } else if (manifest.type === 'web-node') {
      const cmd = manifest.start.replaceAll('{port}', String(port))
      const child = startNodeApp(
        cmd,
        inst.dir,
        { name: manifest.port?.env ?? 'PORT', value: port },
        (l) => log(id, l)
      )
      const rt = ensureRuntime(id)
      rt.child = child
      child.on('exit', (code) => {
        // 仅在 running 态下回置 stopped，避免覆盖启动失败的 error 态
        if (getInstalled(id)?.state === 'running') {
          log(id, `[宿主] 工具进程已退出（code=${code}）`)
          releasePort(id)
          rt.child = undefined
          rt.openUrl = undefined
          setState(id, 'stopped')
        }
      })
    } else if (manifest.type === 'web-python') {
      let vpyQuoted: string
      if (fs.existsSync(venvPythonPath(inst.dir))) {
        vpyQuoted = `"${venvPythonPath(inst.dir)}"`
      } else {
        const py = pythonExe()
        if (!py) throw new Error('未检测到 Python，请先安装 Python 3 并加入 PATH')
        vpyQuoted = await ensureVenv(inst.dir, py, (l) => log(id, l))
      }
      const cmd = manifest.start.replaceAll('{port}', String(port)).replaceAll('{venv-py}', vpyQuoted)
      const child = startNodeApp(
        cmd,
        inst.dir,
        { name: manifest.port?.env ?? 'PORT', value: port },
        (l) => log(id, l)
      )
      const rt = ensureRuntime(id)
      rt.child = child
      child.on('exit', (code) => {
        if (getInstalled(id)?.state === 'running') {
          log(id, `[宿主] 工具进程已退出（code=${code}）`)
          releasePort(id)
          rt.child = undefined
          rt.openUrl = undefined
          setState(id, 'stopped')
        }
      })
    } else if (manifest.type === 'docker') {
      await composeUp(inst.dir, (l) => log(id, l))
      ensureRuntime(id).composeDir = inst.dir
    } else {
      throw new Error(`暂不支持该类型：${manifest.type}`)
    }

    await waitHealthy(id, port, manifest)
    const openUrl = `http://127.0.0.1:${port}${manifest.openUrl.replaceAll('{port}', String(port))}`
    const rt = ensureRuntime(id)
    rt.openUrl = openUrl
    setState(id, 'running', { port, pid: rt.child?.pid })
    log(id, `[宿主] 已就绪：${openUrl}`)
    return { openUrl, port }
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    log(id, `[宿主] 启动失败：${msg}`)
    setState(id, 'error', { lastError: msg })
    await stopById(id, true)
    throw e
  }
}

async function stopById(id: string, silent: boolean): Promise<void> {
  const rt = runtimes.get(id)
  const inst = getInstalled(id)

  if (rt?.manifest?.type === 'docker' && rt.composeDir) {
    log(id, '[宿主] docker compose down')
    try {
      await composeDown(rt.composeDir, (l) => log(id, l))
    } catch (e) {
      log(id, `[宿主] compose down 异常：${(e as Error).message}`)
    }
    rt.composeDir = undefined
  }
  if (rt?.manifest?.type === 'cli') {
    closeTerminal(id)
  }
  if (rt?.child && rt.child.exitCode === null && rt.child.pid) {
    log(id, `[宿主] 终止进程树 pid=${rt.child.pid}`)
    await killTree(rt.child.pid)
  }
  if (rt?.server) {
    const srv = rt.server
    await new Promise<void>((resolve) => {
      srv.close(() => resolve())
    })
    rt.server = undefined
  }
  releasePort(id)
  if (!rt) return
  rt.child = undefined
  rt.openUrl = undefined
  if (!silent && inst) setState(id, 'stopped')
}

export async function stop(id: string): Promise<void> {
  await stopById(id, false)
}

/** 清理依赖后重装（配合 disk.clearDeps） */
export async function reinstall(manifest: ToolManifest): Promise<void> {
  const inst = getInstalled(manifest.id)
  if (!inst?.dir) return
  setState(manifest.id, 'installing')
  await installPhase(manifest, inst.dir, (l) => log(manifest.id, l))
  setState(manifest.id, 'ready')
}

/** 移除：停止 → 删除目录与记录（FR-DL-07） */
export async function remove(id: string): Promise<void> {
  await stopById(id, true)
  const inst = getInstalled(id)
  if (inst?.dir) fs.rmSync(inst.dir, { recursive: true, force: true })
  removeInstalled(id)
  runtimes.delete(id)
  broadcast('tool-state', { id, state: 'not-downloaded' })
}

/** 运行中工具（供托盘菜单） */
export function getRunningIds(): string[] {
  return Object.values(getInstalledAll())
    .filter((t) => t.state === 'running')
    .map((t) => t.id)
}

/** 宿主退出前清理全部（FR-LC-04） */
export function stopAll(): void {
  closeAllTerminals()
  for (const id of [...runtimes.keys()]) {
    try {
      void stopById(id, true)
    } catch {
      // 退出路径尽力而为
    }
  }
}
