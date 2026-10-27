import { BrowserWindow } from 'electron'

type BroadcastHook = (channel: string, payload: unknown) => void

const hooks = new Set<BroadcastHook>()

/** 注册主进程内的广播钩子（如托盘菜单随 tool-state 刷新） */
export function addBroadcastHook(h: BroadcastHook): void {
  hooks.add(h)
}

export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
  for (const h of hooks) {
    try {
      h(channel, payload)
    } catch (e) {
      console.warn('[broadcast-hook]', e)
    }
  }
}
