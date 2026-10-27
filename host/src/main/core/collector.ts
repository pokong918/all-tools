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

/** GitHub search API 匿名限速 10 次/分钟（带 Token 30 次/分钟），单次全量 12 个请求必须限速，否则 403 */
const SEARCH_INTERVAL_MS_TOKEN = 2200
const SEARCH_INTERVAL_MS_ANON = 6500

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

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
  const intervalMs = token ? SEARCH_INTERVAL_MS_TOKEN : SEARCH_INTERVAL_MS_ANON

  const cache = getCatalogCache()
  let requests = 0
  let okRequests = 0
  let added = 0
  let updated = 0
  let aborted = ''

  for (const q of QUERIES) {
    for (let page = 1; page <= 2; page++) {
      if (requests > 0) await sleep(intervalMs)
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=${page}`
      requests++
      broadcast('sync-log', { line: `请求 ${q} 第 ${page} 页…` })
      let res: Response
      try {
        res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) })
      } catch (e) {
        aborted = `网络错误：${(e as Error).message}`
        break
      }
      if (res.status === 403 || res.status === 429) {
        aborted = token
          ? 'GitHub 搜索配额受限，已保留本次已获取的部分，稍后再试。'
          : 'GitHub 搜索配额受限（匿名 10 次/分钟），已保留已获取的部分；可在设置中配置 Token 提升配额。'
        break
      }
      if (!res.ok) {
        aborted = `GitHub API HTTP ${res.status}`
        break
      }
      okRequests++
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
    if (aborted) break
  }

  // 中途受限也保留已拉到的部分（含全量完成），缓存只增不丢
  saveCatalogCache(cache)
  const result: SyncResult = {
    added,
    updated,
    total: Object.keys(cache).length,
    requests,
    ...(aborted && okRequests > 0 ? { note: aborted } : {})
  }
  broadcast('sync-log', {
    line: aborted
      ? `采集中止：${aborted}`
      : `采集完成：新增 ${added}，更新 ${updated}，总计 ${result.total}`
  })
  // 一个请求都没成功（配额耗尽/断网）才视为失败，让界面明确报错
  if (!okRequests && aborted) throw new Error(aborted)
  return result
}
