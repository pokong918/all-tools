import net from 'node:net'

const allocated = new Map<string, number>()

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}

/** 供 docker 等固定端口场景做占用预检 */
export function isPortFree(port: number): Promise<boolean> {
  return isFree(port)
}

/** 优先使用 manifest 默认端口，被占用则从 41000 起分配空闲端口（FR-LC-03） */
export async function allocatePort(toolId: string, prefer?: number): Promise<number> {
  const existing = allocated.get(toolId)
  if (existing) return existing
  if (prefer && prefer > 0 && (await isFree(prefer))) {
    allocated.set(toolId, prefer)
    return prefer
  }
  const taken = new Set(allocated.values())
  for (let p = 41000; p < 41200; p++) {
    if (!taken.has(p) && (await isFree(p))) {
      allocated.set(toolId, p)
      return p
    }
  }
  throw new Error('未找到可用端口')
}

export function releasePort(toolId: string): void {
  allocated.delete(toolId)
}
