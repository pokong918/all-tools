import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { broadcast } from './events'

// 1x1 PNG（后续替换为正式图标资源）
const ICON_PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAf8/9hAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

let tray: Tray | null = null

export interface TrayTool {
  id: string
  name: string
}

export function setupTray(): void {
  tray = new Tray(nativeImage.createFromDataURL(ICON_PNG_1X1))
  tray.setToolTip('All-Tools')
  rebuildTrayMenu([])
}

export function rebuildTrayMenu(running: TrayTool[]): void {
  if (!tray) return
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '显示主窗口',
      click: () => {
        const w = BrowserWindow.getAllWindows()[0]
        if (w) {
          w.show()
          w.focus()
        }
      }
    },
    { type: 'separator' }
  ]
  if (running.length) {
    template.push({ label: '运行中', enabled: false })
    for (const t of running) {
      template.push({
        label: `▸ ${t.name}`,
        click: () => {
          const w = BrowserWindow.getAllWindows()[0]
          if (w) {
            w.show()
            w.focus()
          }
          broadcast('focus-tool', { id: t.id })
        }
      })
    }
    template.push({ type: 'separator' })
  }
  template.push({ label: '退出（将停止所有工具进程）', click: () => app.quit() })
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
