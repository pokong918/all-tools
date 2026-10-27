import fs from 'node:fs'
import path from 'node:path'
import { runCmd } from './util'

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']

function composeFile(dir: string): string | null {
  return COMPOSE_FILES.find((f) => fs.existsSync(path.join(dir, f))) ?? null
}

/** docker compose up -d --wait：等待容器健康后返回 */
export async function composeUp(dir: string, onLog: (s: string) => void): Promise<void> {
  const f = composeFile(dir)
  if (!f) throw new Error('未找到 docker-compose 文件')
  onLog(`[docker] docker compose -f ${f} up -d --wait（拉取镜像可能较慢）`)
  await runCmd(`docker compose -f ${f} up -d --wait`, dir, onLog)
}

export async function composeDown(dir: string, onLog?: (s: string) => void): Promise<void> {
  const f = composeFile(dir)
  if (!f) return
  onLog?.(`[docker] docker compose -f ${f} down`)
  await runCmd(`docker compose -f ${f} down`, dir, onLog)
}
