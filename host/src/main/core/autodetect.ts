import fs from 'node:fs'
import path from 'node:path'
import type { CatalogEntry, ToolManifest, ToolType } from '../../common/types'

/**
 * 下载后本地自动适配（FR-CAT-03 精判 / FR-DL-05 兜底）：
 * 直接读取仓库内容判定运行类型并生成 Manifest，零 API 消耗。
 */

function readJsonSafe<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

interface PkgJson {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export function slugifyId(repo: string): string {
  return repo
    .split('/')
    .pop()!
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']

/** 从 compose 文件文本中解析宿主端口（"HOST:CONTAINER" 的 HOST 部分） */
export function parseComposePorts(dir: string): number[] {
  for (const f of COMPOSE_FILES) {
    const file = path.join(dir, f)
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    const ports: number[] = []
    for (const m of text.matchAll(/-\s*["']?(\d+):(\d+)["']?/g)) {
      const host = Number(m[1])
      if (host && !ports.includes(host)) ports.push(host)
    }
    return ports
  }
  return []
}

interface PythonApp {
  entry: string
  framework: string
  start: string
  portEnv?: string
  portDefault?: number
}

function detectPythonApp(dir: string): PythonApp | null {
  const candidates = ['app.py', 'main.py', 'server.py', 'run.py', 'webui.py', 'gui.py', 'streamlit_app.py']
  for (const c of candidates) {
    const file = path.join(dir, c)
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    if (/import\s+streamlit|from\s+streamlit/.test(text)) {
      return {
        entry: c,
        framework: 'streamlit',
        start: `{venv-py} -m streamlit run ${c} --server.port {port} --server.headless true`,
        portDefault: 8501
      }
    }
    if (/import\s+gradio|from\s+gradio/.test(text)) {
      return { entry: c, framework: 'gradio', start: `{venv-py} ${c}`, portEnv: 'GRADIO_SERVER_PORT' }
    }
    if (/from\s+fastapi|import\s+uvicorn/.test(text)) {
      const mod = c.replace(/\.py$/, '')
      return {
        entry: c,
        framework: 'fastapi',
        start: `{venv-py} -m uvicorn ${mod}:app --host 127.0.0.1 --port {port}`,
        portDefault: 8000
      }
    }
    if (/from\s+flask|import\s+flask/.test(text)) {
      const mod = c.replace(/\.py$/, '')
      return { entry: c, framework: 'flask', start: `{venv-py} -m flask --app ${mod} run --port {port}` }
    }
    return { entry: c, framework: 'python', start: `{venv-py} ${c}` }
  }
  return null
}

/** 判定优先级：Node Web > Docker > Python Web > 纯静态 > Node CLI */
export function detectAndBuildManifest(dir: string, entry: CatalogEntry): ToolManifest {
  const id = slugifyId(entry.repo)
  const base = {
    id,
    name: entry.name,
    description: entry.description,
    repo: `https://github.com/${entry.repo}`,
    category: entry.category,
    stars: entry.stars,
    origin: 'auto' as const,
    homepage: entry.homepage,
    tags: ['自动适配'] as string[]
  }

  // 1) Node Web 应用
  const pkgPath = path.join(dir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = readJsonSafe<PkgJson>(pkgPath, {})
    const scripts = pkg.scripts ?? {}
    if (scripts.start || scripts.dev || scripts.preview || scripts.serve) {
      const start = scripts.start
        ? 'npm start'
        : scripts.dev
          ? 'npm run dev -- --port {port}'
          : scripts.preview
            ? 'npm run preview -- --port {port}'
            : 'npm run serve -- --port {port}'
      const hasVite = !!(pkg.devDependencies && 'vite' in pkg.devDependencies)
      return {
        ...base,
        type: 'web-node',
        tags: [...base.tags, '需 Node'],
        start,
        port: { default: hasVite ? 5173 : 3000, env: 'PORT' },
        healthCheck: { path: '/', timeoutMs: 180000 },
        openUrl: '/',
        notes: '由宿主自动识别生成；如启动失败请查看日志。'
      }
    }
  }

  // 2) Docker 自部署
  const composePorts = parseComposePorts(dir)
  if (composePorts.length) {
    return {
      ...base,
      type: 'docker',
      tags: [...base.tags, '需 Docker'],
      start: '{compose}',
      port: { default: composePorts[0], env: 'PORT' },
      healthCheck: { path: '/', timeoutMs: 300000 },
      openUrl: '/',
      notes: `compose 宿主端口：${composePorts.join(', ')}（固定，冲突需修改 compose 文件）。`
    }
  }

  // 3) Python Web 应用
  const py = detectPythonApp(dir)
  if (py) {
    return {
      ...base,
      type: 'web-python',
      tags: [...base.tags, '需 Python'],
      start: py.start,
      port: { default: py.portDefault ?? 8000, env: py.portEnv ?? 'PORT' },
      healthCheck: { path: '/', timeoutMs: 180000 },
      openUrl: '/',
      notes: `识别到 Python 入口 ${py.entry}（${py.framework}）。`
    }
  }

  // 4) 纯静态站点
  if (fs.existsSync(path.join(dir, 'index.html'))) {
    return {
      ...base,
      type: 'web-static',
      tags: [...base.tags, '免安装'],
      start: '#static',
      openUrl: '/',
      notes: '识别为纯静态站点，零依赖秒开。'
    }
  }

  // 5) Node CLI
  if (fs.existsSync(pkgPath)) {
    return {
      ...base,
      type: 'cli',
      tags: [...base.tags, '命令行', '需 Node'],
      start: '#terminal',
      openUrl: '/',
      notes: '识别为命令行工具：打开即在工具目录启动内嵌终端。'
    }
  }

  throw new Error('无法识别该项目结构（非 Node/Python/Docker/静态站点），暂不支持自动适配')
}

/** 供 UI 展示粗类型的中文标签 */
export const TYPE_LABEL: Record<ToolType | 'unknown', string> = {
  'web-node': 'Web 应用',
  'web-static': '静态工具',
  'web-python': 'Python 应用',
  docker: 'Docker 服务',
  cli: '命令行',
  desktop: '桌面程序',
  unknown: '待识别'
}
