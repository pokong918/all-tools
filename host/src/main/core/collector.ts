import type { CatalogEntry, SyncResult, ToolType } from '../../common/types'
import { broadcast } from './events'
import { getCatalogCache, getPrefs, saveCatalogCache } from './store'

/**
 * GitHub 目录采集（FR-CAT-01/03/04）：
 * 按 topics 搜索高星仓库，启发式粗标运行类型与分类，缓存到本地。
 * 获取时由 autodetect 在本地精判覆盖，粗标仅用于展示与排序。
 * 匿名配额 60 req/h：每次全量采集约 12 个请求，支持 Token（prefs.githubToken）。
 */

const QUERIES = [
  'topic:tool stars:>600',
  'topic:utility stars:>600',
  'topic:cli stars:>600',
  'topic:web-app stars:>700',
  'topic:self-hosted stars:>1200',
  'topic:tools stars:>800'
]

interface GhRepo {
  full_name: string
  name: string
  description: string | null
  stargazers_count: number
  language: string | null
  topics?: string[]
  pushed_at: string
  homepage: string | null
  archived: boolean
}

export function guessToolType(r: {
  language: string | null
  topics?: string[]
  description?: string | null
}): ToolType | 'unknown' {
  const t = (r.topics ?? []).join(' ').toLowerCase()
  const d = (r.description ?? '').toLowerCase()
  const lang = r.language ?? ''
  if (/cli|command-line|commandline|terminal/.test(`${t} ${d}`)) return 'cli'
  if (lang === 'HTML' || lang === 'CSS') return 'web-static'
  if (lang === 'JavaScript' || lang === 'TypeScript') {
    return /self-host|selfhost/.test(t) ? 'docker' : 'web-node'
  }
  if (lang === 'Python') {
    return /streamlit|gradio|flask|fastapi|django|web|server|ui|dashboard|app/.test(`${t} ${d}`)
      ? 'web-python'
      : 'cli'
  }
  if (['Go', 'Rust', 'C', 'C++', 'C#'].includes(lang)) {
    return /web|http|server/.test(`${t} ${d}`) ? 'docker' : 'cli'
  }
  return 'unknown'
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/\bai\b|llm|gpt|chatbot|machine-learning|deep-learning|agent|diffusion/, 'AI 与大模型'],
  [/image|photo|draw|design|icon|whiteboard|diagram|svg|font|3d/, '图像与设计'],
  [/pdf|markdown|note|doc|office|writ|slide|mind-map/, '文档与办公'],
  [/download|proxy|network|torrent|speed|vpn|firewall|dns/, '下载与网络'],
  [/security|password|privacy|encrypt|pentest|vuln|cve/, '安全与隐私'],
  [/monitor|system|hardware|benchmark|cleanup|driver|terminal|shell/, '系统与硬件'],
  [/database|sql|redis|postgres|mysql|mongo|kv/, '数据与数据库'],
  [/automat|scrap|crawl|workflow|raspberry|home-automation|bot/, '自动化与效率'],
  [/text|regex|json|yaml|csv|convert|format|snippet/, '文本与代码'],
  [/game|music|video|movie|fun|habit|todo|finance|health/, '生活实用']
]

export function guessCategory(name: string, description: string, topics: string[]): string {
  const s = `${name} ${description} ${topics.join(' ')}`.toLowerCase()
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(s)) return cat
  }
  return '开发工具'
}

export async function collectCatalog(): Promise<SyncResult> {
  const token = getPrefs().githubToken
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'all-tools-host'
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const cache = getCatalogCache()
  let requests = 0
  let added = 0
  let updated = 0

  for (const q of QUERIES) {
    for (let page = 1; page <= 2; page++) {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=${page}`
      requests++
      broadcast('sync-log', { line: `请求 ${q} 第 ${page} 页…` })
      const res = await fetch(url, { headers })
      if (res.status === 403 || res.status === 429) {
        throw new Error('GitHub API 配额不足（匿名 60 次/小时）。稍后再试，或配置 GitHub Token。')
      }
      if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`)
      const data = (await res.json()) as { items?: GhRepo[] }
      const items = data.items ?? []
      for (const r of items) {
        if (r.archived) continue
        const prev = cache[r.full_name]
        const entry: CatalogEntry = {
          repo: r.full_name,
          name: r.name,
          description: r.description ?? '',
          stars: r.stargazers_count,
          language: r.language,
          topics: r.topics ?? [],
          pushedAt: r.pushed_at,
          toolType: guessToolType(r),
          category: guessCategory(r.name, r.description ?? '', r.topics ?? []),
          homepage: r.homepage ?? undefined,
          collectedAt: new Date().toISOString()
        }
        if (!prev) {
          added++
        } else if (prev.stars !== entry.stars || prev.pushedAt !== entry.pushedAt) {
          updated++
        }
        cache[r.full_name] = entry
      }
      if (items.length < 100) break
    }
  }

  saveCatalogCache(cache)
  const result: SyncResult = { added, updated, total: Object.keys(cache).length, requests }
  broadcast('sync-log', { line: `采集完成：新增 ${added}，更新 ${updated}，总计 ${result.total}` })
  return result
}
