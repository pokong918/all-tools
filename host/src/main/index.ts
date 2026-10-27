import { app, BrowserWindow, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { paths } from './core/paths'
import { ensureManifests, loadManifests } from './core/catalog'
import { registerIpc } from './ipc'
import { getRunningIds, initLifecycle, stopAll } from './core/lifecycle'
import { addBroadcastHook } from './core/events'
import { rebuildTrayMenu, setupTray } from './core/tray'

/** 开发态窗口图标（安装态自动使用 exe 图标） */
function devWindowIcon() {
  if (app.isPackaged) return undefined
  const file = join(__dirname, '../../build/icon.ico')
  try {
    return nativeImage.createFromPath(file)
  } catch {
    return undefined
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'All-Tools',
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    icon: devWindowIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: false
    }
  })

  // 工具页面中的新窗口一律交给系统浏览器（FR-SEC-03）
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function refreshTray(): void {
  const names = new Map(loadManifests().map((m) => [m.id, m.name]))
  const running = getRunningIds().map((id) => ({ id, name: names.get(id) ?? id }))
  rebuildTrayMenu(running)
}

app.whenReady().then(() => {
  paths.ensure()
  ensureManifests()
  initLifecycle()
  registerIpc()
  setupTray()
  refreshTray()
  addBroadcastHook((channel) => {
    if (channel === 'tool-state') refreshTray()
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  stopAll()
})
