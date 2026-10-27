import fs from 'node:fs'
import path from 'node:path'
import { runCmd } from './util'

const isWin = (): boolean => process.platform === 'win32'

export function venvPythonPath(dir: string): string {
  return path.join(dir, '.venv', isWin() ? 'Scripts/python.exe' : 'bin/python')
}

/** 创建 venv（若不存在），返回带引号的 venv python 路径（供 shell 命令串拼接） */
export async function ensureVenv(dir: string, pythonExe: string, onLog: (s: string) => void): Promise<string> {
  const vpy = venvPythonPath(dir)
  if (!fs.existsSync(vpy)) {
    onLog(`[venv] ${pythonExe} -m venv .venv`)
    await runCmd(`${pythonExe} -m venv .venv`, dir, onLog)
  }
  return `"${vpy}"`
}

export async function pipInstall(dir: string, vpyQuoted: string, onLog: (s: string) => void): Promise<void> {
  if (fs.existsSync(path.join(dir, 'requirements.txt'))) {
    onLog('[venv] pip install -r requirements.txt')
    await runCmd(`${vpyQuoted} -m pip install -r requirements.txt`, dir, onLog)
  } else if (fs.existsSync(path.join(dir, 'pyproject.toml'))) {
    onLog('[venv] pip install .')
    await runCmd(`${vpyQuoted} -m pip install .`, dir, onLog)
  } else {
    onLog('[venv] 未发现 requirements.txt / pyproject.toml，跳过依赖安装')
  }
}
