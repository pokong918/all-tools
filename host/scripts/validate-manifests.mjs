/**
 * 校验 manifests/tools/*.json（CI 与提交前本地使用）。
 * 规则与主进程 catalog.ts 内置校验保持一致。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TOOLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'manifests', 'tools')

const REQUIRED = ['id', 'name', 'description', 'repo', 'category', 'type', 'start', 'openUrl']
const TYPES = ['web-node', 'web-static', 'web-python', 'docker', 'cli', 'desktop']
const REPO_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/

let failed = 0
let count = 0
const ids = new Set()

for (const f of fs.readdirSync(TOOLS_DIR)) {
  if (!f.endsWith('.json')) continue
  count++
  const errs = []
  let m
  try {
    m = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, f), 'utf8'))
  } catch (e) {
    console.error(`✗ ${f}: JSON 解析失败 — ${e.message}`)
    failed++
    continue
  }
  for (const k of REQUIRED) if (!m[k]) errs.push(`缺少字段 ${k}`)
  if (m.repo && !REPO_RE.test(m.repo)) errs.push('repo 必须形如 https://github.com/{owner}/{repo}')
  if (m.type && !TYPES.includes(m.type)) errs.push(`type 必须是 ${TYPES.join(' / ')} 之一`)
  if (m.id) {
    if (!/^[a-z0-9-]+$/.test(m.id)) errs.push('id 必须是小写 kebab-case')
    if (ids.has(m.id)) errs.push(`id 重复：${m.id}`)
    ids.add(m.id)
  }
  if (errs.length) {
    console.error(`✗ ${f}: ${errs.join('；')}`)
    failed++
  }
}

console.log(`${failed ? 'FAILED' : 'OK'}: ${count - failed}/${count} 份清单有效`)
process.exit(failed ? 1 : 0)
