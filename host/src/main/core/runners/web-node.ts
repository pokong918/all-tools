import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { spawnShellCmd } from './util'

/** 安装依赖（web-node 类工具获取阶段调用；npm 经 sidecar PATH 注入自动解析到内置版本） */
export async function npmInstall(dir: string, onLog: (s: string) => void): Promise<void> {
  const cmd = process.platform === 'win32' ? 'npm.cmd install --no-audit --no-fund' : 'npm install --no-audit --no-fund'
  await new Promise<void>((resolve, reject) => {
    const child = spawnShellCmd(cmd, dir, process.env, onLog)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        onLog('[宿主] 依赖安装完成')
        resolve()
      } else {
        reject(new Error(`npm install 退出码 ${code}`))
      }
    })
  })
}

/**
 * 启动 Node Web 工具。
 * cmd 为 manifest.start（已替换 {port} 占位）；同时注入端口环境变量（默认 PORT），
 * 以兼容 react-scripts（PORT env）与 vite/next（命令行端口参数）两类形态。
 */
export function startNodeApp(
  cmd: string,
  dir: string,
  portEnv: { name: string; value: number } | undefined,
  onLog: (s: string) => void
): ChildProcess {
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (portEnv) env[portEnv.name] = String(portEnv.value)
  return spawnShellCmd(cmd, dir, env, onLog)
}

/** 终止整棵进程树（Windows: taskkill /T /F） */
export async function killTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const c = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
      c.on('close', () => resolve())
      c.on('error', () => resolve())
    })
  } else {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // 进程已退出
      }
    }
  }
}
