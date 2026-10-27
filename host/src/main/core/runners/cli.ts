import { spawn, type ChildProcess } from 'node:child_process'
import { broadcast } from '../events'
import { getInstalled } from '../store'
import { envWithSidecar } from './util'
import { killTree } from './web-node'

/**
 * CLI Runner：内嵌终端会话（FR-RUN-03 简化实现）。
 * 以流式 stdin/stdout 承载（非 PTY），满足命令行工具交互；
 * 会话输出带回放缓存，切换视图再回来不丢历史。
 */

const sessions = new Map<string, ChildProcess>()
const replayBuffers = new Map<string, string>()

export function openTerminal(id: string): void {
  const existed = sessions.get(id)
  if (existed && existed.exitCode === null) return
  const inst = getInstalled(id)
  const cwd = inst?.dir || process.cwd()
  const shell =
    process.platform === 'win32' ? process.env.COMSPEC || 'cmd.exe' : process.env.SHELL || 'bash'
  const child = spawn(shell, process.platform === 'win32' ? [] : ['-i'], {
    cwd,
    windowsHide: true,
    env: envWithSidecar(process.env)
  })

  const hook = (d: Buffer): void => {
    const data = d.toString()
    const buf = replayBuffers.get(id) ?? ''
    replayBuffers.set(id, (buf + data).slice(-64_000))
    broadcast('term-data', { id, data })
  }
  child.stdout?.on('data', hook)
  child.stderr?.on('data', hook)
  child.on('exit', () => {
    sessions.delete(id)
    broadcast('term-data', { id, data: '\r\n\x1b[90m[会话已结束]\x1b[0m\r\n' })
  })
  sessions.set(id, child)

  // 回放历史输出（同会话重新打开视图时）
  const replay = replayBuffers.get(id)
  if (replay) broadcast('term-data', { id, data: replay })
}

export function writeTerminal(id: string, data: string): void {
  sessions.get(id)?.stdin?.write(data)
}

export function closeTerminal(id: string): void {
  const c = sessions.get(id)
  if (c?.pid) {
    void killTree(c.pid)
  } else {
    c?.kill()
  }
  sessions.delete(id)
}

export function closeAllTerminals(): void {
  for (const id of [...sessions.keys()]) closeTerminal(id)
}
