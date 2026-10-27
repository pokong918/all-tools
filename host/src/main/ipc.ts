import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import type { CatalogEntry, CatalogView, ManifestOverride, Prefs, ToolManifest, ToolState, WizardStatus } from '../common/types'
import { ensureManifests, loadManifests } from './core/catalog'
import { envInfo } from './core/env'
import { getCatalogCache, getInstalledAll, getPrefs, loadOverrides, resetOverride, savePrefs, saveOverride, touchRecent } from './core/store'
import { acquire, acquireEntry, getLogs, reinstall, remove, start, stop } from './core/lifecycle'
import { collectCatalog } from './core/collector'
import { updateTool } from './core/update'
import { clearDeps, storageOverview } from './core/disk'
import { closeTerminal, openTerminal, writeTerminal } from './core/runners/cli'
import { listDrives } from './core/disks'
import { paths, setDataRoot } from './core/paths'
import { syncManifests } from './core/manifest-sync'
import { checkHostUpdate } from './core/host-update'

export function registerIpc(): void {
  ipcMain.handle('catalog:list', (): CatalogView => {
    const installed = getInstalledAll()
    const manifests = loadManifests()
    const cache = getCatalogCache()

    const tools = manifests.map((m) => {
      const inst = installed[m.id]
      return {
        manifest: m,
        installed: !!inst,
        state: (inst?.state ?? 'not-downloaded') as ToolState,
        port: inst?.port,
        lastError: inst?.lastError,
        official: m.origin !== 'auto'
      }
    })

    // 社区条目 = 采集缓存中尚未有 Manifest 的仓库（已适配/已获取的在 tools 里展示）
    const knownRepos = new Set(manifests.map((m) => m.repo.toLowerCase()))
    const community = Object.values(cache)
      .filter((e) => !knownRepos.has(`https://github.com/${e.repo}`.toLowerCase()))
      .sort((a, b) => b.stars - a.stars)

    return { tools, community }
  })

  ipcMain.handle('catalog:sync', () => collectCatalog())
  ipcMain.handle('env:info', () => envInfo())

  ipcMain.handle('tool:acquire', (_e, manifest: ToolManifest) => acquire(manifest))
  ipcMain.handle('tool:acquire-entry', (_e, entry: CatalogEntry) => acquireEntry(entry))
  ipcMain.handle('tool:start', (_e, manifest: ToolManifest) => {
    touchRecent(manifest.id)
    return start(manifest)
  })
  ipcMain.handle('tool:stop', (_e, id: string) => stop(id))
  ipcMain.handle('tool:remove', (_e, id: string) => remove(id))
  ipcMain.handle('tool:update', (_e, manifest: ToolManifest) => updateTool(manifest))
  ipcMain.handle('tool:reinstall', (_e, manifest: ToolManifest) => reinstall(manifest))
  ipcMain.handle('tool:logs', (_e, id: string) => getLogs(id))

  // Manifest 本地覆盖（可视化编辑）
  ipcMain.handle('tool:save-override', (_e, patch: ManifestOverride) => {
    saveOverride(patch)
    return loadManifests().find((m) => m.id === patch.id) ?? null
  })
  ipcMain.handle('tool:reset-override', (_e, id: string) => {
    resetOverride(id)
    return loadManifests().find((m) => m.id === id) ?? null
  })
  ipcMain.handle('tool:overrides', () => loadOverrides())

  ipcMain.handle('term:open', (_e, id: string) => {
    openTerminal(id)
  })
  ipcMain.handle('term:write', (_e, id: string, data: string) => {
    writeTerminal(id, data)
  })
  ipcMain.handle('term:close', (_e, id: string) => {
    closeTerminal(id)
  })

  ipcMain.handle('storage:list', () => {
    const nameOf = new Map(loadManifests().map((m) => [m.id, m.name]))
    return storageOverview().map((s) => ({ ...s, name: nameOf.get(s.id) ?? s.name }))
  })
  ipcMain.handle('storage:clear-deps', async (_e, id: string) => {
    clearDeps(id)
    const manifest = loadManifests().find((m) => m.id === id)
    if (manifest) await reinstall(manifest)
  })

  ipcMain.handle('prefs:get', () => getPrefs())
  ipcMain.handle('prefs:set', (_e, prefs: Prefs) => {
    savePrefs(prefs)
    return getPrefs()
  })

  ipcMain.handle('open:external', (_e, url: string) => {
    void shell.openExternal(url)
  })

  // ---- 首次启动向导（FR-DIST-06）----

  ipcMain.handle('wizard:status', (): WizardStatus => {
    const prefs = getPrefs()
    return {
      need: !prefs.wizardDone && !paths.isDev,
      isPackaged: !paths.isDev,
      defaultRoot: app.getPath('userData'),
      currentRoot: paths.projectRoot,
      drives: listDrives()
    }
  })

  ipcMain.handle(
    'wizard:complete',
    (_e, payload: { dataRoot?: string; token?: string; syncNow: boolean }) => {
      if (payload.dataRoot && payload.dataRoot !== app.getPath('userData')) {
        setDataRoot(payload.dataRoot)
      }
      const p = getPrefs()
      if (payload.token?.trim()) p.githubToken = payload.token.trim()
      p.wizardDone = true
      savePrefs(p)
      paths.ensure()
      ensureManifests()
      if (payload.syncNow) {
        void collectCatalog().catch(() => {
          // 向导里同步失败不打断，用户可稍后在目录页手动同步
        })
      }
    }
  )

  ipcMain.handle('dirs:choose', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = win ? dialog.showOpenDialogSync(win, { properties: ['openDirectory'] }) : dialog.showOpenDialogSync({ properties: ['openDirectory'] })
    return r && r.length ? r[0] : null
  })

  // Manifest 远程同步与宿主更新 ----

  ipcMain.handle('manifests:sync', () => syncManifests())
  ipcMain.handle('app:check-update', () => checkHostUpdate())

  // ---- 数据迁移与备份 ----

  ipcMain.handle('data:migrate', async (_e, target: string) => {
    const { migrateDataRoot } = await import('./core/migrate')
    return migrateDataRoot(target)
  })

  ipcMain.handle('backup:export', async (e) => {
    const { buildBackup } = await import('./core/backup')
    const win = BrowserWindow.fromWebContents(e.sender)
    const file = win
      ? dialog.showSaveDialogSync(win, {
          title: '导出备份',
          defaultPath: `all-tools-backup-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
      : undefined
    if (!file) return null
    const { writeFileSync } = await import('node:fs')
    writeFileSync(file, JSON.stringify(buildBackup(), null, 2), 'utf8')
    return file
  })

  ipcMain.handle('backup:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = win
      ? dialog.showOpenDialogSync(win, {
          title: '导入备份',
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile']
        })
      : undefined
    if (!r || !r.length) return null
    const { readFileSync } = await import('node:fs')
    const { applyBackup } = await import('./core/backup')
    const data = JSON.parse(readFileSync(r[0], 'utf8'))
    return applyBackup(data)
  })
}
