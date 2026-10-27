import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'node:path'
import { broadcast } from './events'

/** 托盘图标：安装态 resources/build/icon-32.png；开发态 host/build/icon-32.png */
function trayIconPath(): string {
  if (app.isPackaged) return join(process.resourcesPath ?? '', 'build', 'icon-32.png')
  return join(__dirname, '..', '..', '..', 'build', 'icon-32.png')
}

let tray: Tray | null = null

export interface TrayTool {
  id: string
  name: string
}

export function setupTray(): void {
  const img = nativeImage.createFromPath(trayIconPath())
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
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
