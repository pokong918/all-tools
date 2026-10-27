import fs from 'node:fs'
import path from 'node:path'
import { paths } from './paths'
import { loadAutoManifests, loadOverrides } from './store'
import type { ManifestOverride, ToolManifest } from '../../common/types'

const REQUIRED_FIELDS: (keyof ToolManifest)[] = ['id', 'name', 'description', 'repo', 'category', 'type', 'start', 'openUrl']

export function validateManifest(m: ToolManifest): string[] {
  const errs: string[] = []
  const rec = m as unknown as Record<string, unknown>
  for (const k of REQUIRED_FIELDS) {
    if (!rec[k as string]) errs.push(`缺少字段 ${k}`)
  }
  if (m.repo && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(m.repo)) {
    errs.push('repo 必须形如 https://github.com/{owner}/{repo}')
  }
  return errs
}

function loadFromDir(dir: string, origin: 'preset' | 'auto'): ToolManifest[] {
  if (!fs.existsSync(dir)) return []
  const list: ToolManifest[] = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as ToolManifest
      const errs = validateManifest(m)
      if (errs.length) {
        console.warn(`[manifest] ${f} 无效：${errs.join('；')}`)
        continue
      }
      m.origin = m.origin ?? origin
      list.push(m)
    } catch (e) {
      console.warn(`[manifest] ${f} 解析失败：`, e)
    }
  }
  return list
}

function applyOverride(m: ToolManifest, o: ManifestOverride | undefined): ToolManifest {
  if (!o) return m
  return {
    ...m,
    ...(o.start !== undefined && { start: o.start }),
    ...(o.port !== undefined && { port: { ...m.port, ...o.port } }),
    ...(o.openUrl !== undefined && { openUrl: o.openUrl }),
    ...(o.healthCheck !== undefined && { healthCheck: { ...m.healthCheck, ...o.healthCheck } }),
    ...(o.notes !== undefined && { notes: o.notes })
  }
}

/**
 * 全部 Manifest = 官方预置（manifests/tools/）+ 自动适配生成（data/auto-manifests/）
 * + 本地覆盖（data/manifest-overrides/，可视化编辑产物）。每份清单即唯一事实源，按 star 降序。
 */
export function loadManifests(): ToolManifest[] {
  const preset = loadFromDir(path.join(paths.manifestsDir, 'tools'), 'preset')
  const auto = loadAutoManifests().map((m) => ({ ...m, origin: 'auto' as const }))
  const overrides = loadOverrides()
  return [...preset, ...auto]
    .map((m) => applyOverride(m, overrides[m.id]))
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
}

/** 安装态首次启动：从安装包资源拷贝内置清单（M2 打包时配置 extraResources） */
export function ensureManifests(): void {
  if (paths.isDev) return
  const target = paths.manifestsDir
  if (fs.existsSync(target)) return
  const bundled = path.join(process.resourcesPath ?? '', 'manifests')
  if (fs.existsSync(bundled)) {
    fs.cpSync(bundled, target, { recursive: true })
  } else {
    fs.mkdirSync(path.join(target, 'tools'), { recursive: true })
  }
}
