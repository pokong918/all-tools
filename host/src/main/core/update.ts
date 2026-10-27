import { spawn } from 'node:child_process'
import fs from 'node:fs'
import type { ToolManifest, ToolState } from '../../common/types'
import { downloadTool } from './downloader'
import { getInstalled, upsertInstalled } from './store'
import { installPhase, log, stop } from './lifecycle'
import { broadcast } from './events'

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const c = spawn('git', args, { cwd, windowsHide: true })
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => (out += d))
    c.on('error', reject)
    c.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(out.trim() || `git ${args[0]} 退出码 ${code}`))
    )
  })
}

function setState(id: string, state: ToolState): void {
  const inst = getInstalled(id)
  if (!inst) return
  upsertInstalled({ ...inst, state, lastError: undefined })
  broadcast('tool-state', { id, state })
}

/** 更新工具（FR-LC-08）：git 源 pull，zip 源重新下载；成功后重装依赖 */
export async function updateTool(manifest: ToolManifest): Promise<{ updated: boolean; message: string }> {
  const id = manifest.id
  const inst = getInstalled(id)
  if (!inst) throw new Error('工具未获取')

  await stop(id)
  setState(id, 'downloading')
  log(id, `[宿主] 检查更新：${manifest.repo}`)

  let updated = false
  let message = ''
  try {
    if (inst.source === 'git') {
      const out = await git(['pull', '--ff-only'], inst.dir)
      updated = !/already up to date|up-to-date|已是最新/i.test(out)
      message = updated ? '已拉取新版本' : '已是最新版本'
      log(id, `[更新] ${out.trim().split('\n')[0] ?? ''}`)
    } else {
      fs.rmSync(inst.dir, { recursive: true, force: true })
      const { dir, source } = await downloadTool(id, manifest.repo, (l) => log(id, l))
      upsertInstalled({ ...getInstalled(id)!, dir, source })
      updated = true
      message = '已重新下载最新版本'
    }

    if (updated) {
      setState(id, 'installing')
      const fresh = getInstalled(id)!
      await installPhase(manifest, fresh.dir, (l) => log(id, l))
    }
    setState(id, 'ready')
    log(id, `[宿主] 更新完成：${message}`)
    return { updated, message }
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    log(id, `[宿主] 更新失败：${msg}`)
    const inst2 = getInstalled(id)
    if (inst2) {
      upsertInstalled({ ...inst2, state: 'error', lastError: msg })
      broadcast('tool-state', { id, state: 'error' })
    }
    throw e
  }
}
