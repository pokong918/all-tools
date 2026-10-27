import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { paths } from './paths'
import { hasGit } from './env'
import { broadcast } from './events'

export interface RepoInfo {
  owner: string
  name: string
}

export function parseRepo(repo: string): RepoInfo {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(repo.trim())
  if (!m) throw new Error(`无法解析仓库地址: ${repo}`)
  return { owner: m[1], name: m[2] }
}

interface RunOpts {
  cwd?: string
  onStdout?: (s: string) => void
  onStderr?: (s: string) => void
}

function run(cmd: string, args: string[], opts: RunOpts): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true })
    child.stdout?.on('data', (d: Buffer) => opts.onStdout?.(d.toString()))
    child.stderr?.on('data', (d: Buffer) => opts.onStderr?.(d.toString()))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} 退出码 ${code}`))))
  })
}

function parseGitProgress(line: string): number | undefined {
  const m = /(?:Receiving objects|Resolving deltas|Counting objects):\s+(\d+)%/.exec(line)
  return m ? Number(m[1]) : undefined
}

/**
 * desktop 类工具下载：取最新 Release 的 Windows 资产（.zip 优先解压，否则 .exe 直放）。
 */
export async function downloadReleaseAsset(
  id: string,
  repo: string,
  onLog: (line: string) => void
): Promise<{ dir: string; source: 'release' }> {
  const { owner, name } = parseRepo(repo)
  onLog(`[下载] 查询 ${owner}/${name} 最新 Release`)
  const res = await fetch(`https://api.github.com/repos/${owner}/${name}/releases/latest`, {
    headers: { 'User-Agent': 'all-tools-host', Accept: 'application/vnd.github+json' }
  })
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`)
  const rel = (await res.json()) as {
    tag_name?: string
    assets?: { name: string; size: number; browser_download_url: string }[]
  }
  const candidates = (rel.assets ?? []).filter(
    (a) => /\.(zip|exe)$/i.test(a.name) && !/arm|mac|linux|darwin|android|uninst/i.test(a.name)
  )
  const asset =
    candidates.find((a) => /win|windows/i.test(a.name) && /\.zip$/i.test(a.name)) ??
    candidates.find((a) => /win|windows/i.test(a.name)) ??
    candidates[0]
  if (!asset) throw new Error('最新 Release 未找到可用的 Windows 资产（.zip/.exe）')

  onLog(`[下载] ${asset.name}（${(asset.size / 1e6).toFixed(1)}MB，来自 ${rel.tag_name ?? 'latest'}）`)
  const fileRes = await fetch(asset.browser_download_url, { redirect: 'follow' })
  if (!fileRes.ok) throw new Error(`资产下载失败 HTTP ${fileRes.status}`)
  const buf = Buffer.from(await fileRes.arrayBuffer())

  const dir = path.join(paths.toolsDir, id)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  if (/\.zip$/i.test(asset.name)) {
    new AdmZip(buf).extractAllTo(dir, true)
  } else {
    fs.writeFileSync(path.join(dir, asset.name), buf)
  }
  return { dir, source: 'release' }
}

/**
 * 下载工具到 tools/<id>/（FR-DL-01/02/03）。
 * 优先 git clone --depth 1；无 git 或克隆失败回退 codeload zip 通道。
 * 失败时清理半成品目录。
 */
export async function downloadTool(
  id: string,
  repo: string,
  onLog: (line: string) => void
): Promise<{ dir: string; source: 'git' | 'zip' }> {
  const { owner, name } = parseRepo(repo)
  const dir = path.join(paths.toolsDir, id)
  if (fs.existsSync(dir)) throw new Error(`工具目录已存在：${dir}`)
  fs.mkdirSync(paths.toolsDir, { recursive: true })

  if (hasGit()) {
    try {
      onLog(`[下载] git clone --depth 1 ${repo}.git`)
      await run('git', ['clone', '--depth', '1', '--progress', `${repo}.git`, dir], {
        onStdout: (s) => s.trim() && onLog(`[git] ${s.trimEnd()}`),
        onStderr: (s) => {
          onLog(`[git] ${s.trimEnd()}`)
          for (const line of s.split(/\r?\n|\r/)) {
            const pct = parseGitProgress(line)
            if (pct !== undefined) broadcast('acquire-progress', { id, phase: 'download', percent: pct })
          }
        }
      })
      return { dir, source: 'git' }
    } catch (e) {
      onLog(`[下载] git 克隆失败（${(e as Error).message}），回退 zip 通道`)
      fs.rmSync(dir, { recursive: true, force: true })
    }
  } else {
    onLog('[下载] 未检测到 git，使用 zip 通道')
  }

  let lastErr: unknown = null
  for (const branch of ['main', 'master']) {
    const url = `https://codeload.github.com/${owner}/${name}/zip/refs/heads/${branch}`
    try {
      onLog(`[下载] ${url}`)
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      broadcast('acquire-progress', { id, phase: 'download', percent: 90 })
      onLog(`[下载] 完成，${(buf.length / 1024 / 1024).toFixed(1)}MB，解压中…`)
      const tmpDir = path.join(paths.toolsDir, `.${id}.tmp`)
      fs.rmSync(tmpDir, { recursive: true, force: true })
      new AdmZip(buf).extractAllTo(tmpDir, true)
      // codeload zip 根目录形如 {repo}-{branch}/
      const entries = fs.readdirSync(tmpDir).filter((e) => !e.startsWith('.'))
      const root =
        entries.length === 1 && fs.statSync(path.join(tmpDir, entries[0])).isDirectory()
          ? path.join(tmpDir, entries[0])
          : tmpDir
      fs.renameSync(root, dir)
      if (root !== tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
      broadcast('acquire-progress', { id, phase: 'download', percent: 100 })
      return { dir, source: 'zip' }
    } catch (e) {
      lastErr = e
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
  throw new Error(`下载失败：${(lastErr as Error)?.message ?? '未知错误'}`)
}
