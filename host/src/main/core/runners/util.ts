import { spawn, type ChildProcess } from 'node:child_process'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 内置 Node sidecar（FR-DIST-08）：
 * 安装态从 resources/runtimes/node 提供 node/npm（fetch-node.mjs 打包时内置），
 * 通过 PATH 前置注入，使所有 npm 系命令（npm install / npm run / 终端内 npm）
 * 自动解析到内置版本，目标机器无需预装 Node。
 */

export function sidecarNodeDir(): string | null {
  if (!app.isPackaged) return null
  const dir = path.join(process.resourcesPath ?? '', 'runtimes', 'node')
  const exe = path.join(dir, process.platform === 'win32' ? 'node.exe' : 'bin/node')
  return fs.existsSync(exe) ? dir : null
}

export function envWithSidecar(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const dir = sidecarNodeDir()
  if (!dir) return env
  const bin = process.platform === 'win32' ? dir : path.join(dir, 'bin')
  return { ...env, PATH: `${bin}${path.delimiter}${env.PATH ?? ''}` }
}

/** 运行一次性 shell 命令并等待退出（输出经 onLog 流式转发） */
export function runCmd(cmdLine: string, cwd: string, onLog?: (s: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmdLine, {
      cwd,
      env: envWithSidecar(process.env),
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const hook = (d: Buffer): void => onLog?.(d.toString())
    child.stdout?.on('data', hook)
    child.stderr?.on('data', hook)
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmdLine.split(' ')[0]} 退出码 ${code}`))))
  })
}

/** 启动长驻 shell 命令（工具进程） */
export function spawnShellCmd(
  cmdLine: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  onLog: (s: string) => void
): ChildProcess {
  const child = spawn(cmdLine, {
    cwd,
    env: envWithSidecar(env),
    shell: true,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const hook = (d: Buffer): void => onLog(d.toString())
  child.stdout?.on('data', hook)
  child.stderr?.on('data', hook)
  return child
}
