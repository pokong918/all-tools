import { spawnSync } from 'node:child_process'
import type { EnvInfo } from '../../common/types'
import { sidecarNodeDir } from './runners/util'

function versionOf(cmd: string): string | null {
  const exe = process.platform === 'win32' && cmd === 'npm' ? 'npm.cmd' : cmd
  try {
    const r = spawnSync(exe, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 8000 })
    if (r.status === 0) {
      return ((r.stdout || r.stderr || '').trim().split('\n')[0]) ?? null
    }
  } catch {
    // 命令不存在
  }
  return null
}

let cached: EnvInfo | null = null
let pyExe: string | null | undefined

/** node 字段：安装态优先显示内置 sidecar 版本（目标机器可能无系统 Node） */
export function envInfo(): EnvInfo {
  if (!cached) {
    let node: string | null = versionOf('node')
    const sidecar = sidecarNodeDir()
    if (sidecar) {
      const exe = `${sidecar}${process.platform === 'win32' ? '\\node.exe' : '/bin/node'}`
      const v = versionOf(exe)
      if (v) node = `内置 ${v}`
    }
    cached = {
      node,
      npm: versionOf('npm'),
      git: versionOf('git'),
      python: versionOf('python') ?? versionOf('python3') ?? versionOf('py'),
      docker: versionOf('docker')
    }
  }
  return cached
}

/** 返回可用的 Python 命令名（python / python3 / py），无则 null */
export function pythonExe(): string | null {
  if (pyExe !== undefined) return pyExe
  pyExe = versionOf('python') ? 'python' : versionOf('python3') ? 'python3' : versionOf('py') ? 'py' : null
  return pyExe
}

export function hasGit(): boolean {
  return envInfo().git !== null
}
