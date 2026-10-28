#!/usr/bin/env node
/**
 * GitHub Release 发布脚本（宿主自更新 FR-DIST-07 的配套发布渠道）。
 *
 * 用法（在仓库根目录）：
 *   node host/scripts/release.mjs --notes-file docs/release-notes/v0.4.0.md
 *
 * 行为（幂等，可重跑）：
 *  1. 读取 host/package.json 的 version，tag 固定 vX.Y.Z；
 *  2. 凭证：环境变量 GITHUB_TOKEN 优先，否则 `git credential fill`（GCM 存储的令牌）；
 *  3. Release 不存在则创建（已存在则复用），Notes 已存在时以 --notes-file 为准更新；
 *  4. 上传资产：All-Tools-Setup-*.exe / All-Tools-Portable-*.exe / latest.yml；
 *     同名资产先删后传（覆盖语义）；latest.yml 必须上传，electron-updater 依赖它。
 *
 * 说明：不上传 .blockmap（与既有发布保持一致；无 blockmap 时更新为全量下载）。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, createReadStream } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = fileURLToPath(new URL('..', import.meta.url)) // host/
const REPO = 'pokong918/all-tools'
const DIST = resolve(HOST, '..', 'dist')

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

function ghToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8'
  })
  const m = /^password=(.+)$/m.exec(out)
  if (!m) throw new Error('未找到 GitHub 凭证（GITHUB_TOKEN 或 git credential 均不可用）')
  return m[1].trim()
}

function api(token, path, opts = {}) {
  const res = fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'all-tools-release',
      ...(opts.headers ?? {})
    }
  })
  return res
}

const version = JSON.parse(readFileSync(join(HOST, 'package.json'), 'utf8')).version
const tag = `v${version}`
const setupExe = join(DIST, `All-Tools-Setup-${version}.exe`)
const portableExe = join(DIST, `All-Tools-Portable-${version}.exe`)
const latestYml = join(DIST, 'latest.yml')
const notesFile = arg('--notes-file', null)

for (const f of [setupExe, portableExe, latestYml]) {
  if (!existsSync(f)) {
    console.error(`缺少产物：${f}\n请先在 host/ 下运行 npm run dist`)
    process.exit(1)
  }
}

const token = ghToken()
console.log(`发布 ${REPO} @ ${tag}`)

// 1. 查找/创建 Release
let rel = null
const found = await api(token, `/repos/${REPO}/releases/tags/${tag}`)
if (found.ok) {
  rel = await found.json()
  console.log(`Release 已存在（id=${rel.id}）`)
} else {
  const notes = notesFile && existsSync(resolve(notesFile)) ? readFileSync(resolve(notesFile), 'utf8') : `All-Tools ${tag}`
  const created = await api(token, `/repos/${REPO}/releases`, {
    method: 'POST',
    body: JSON.stringify({ tag_name: tag, name: tag, body: notes, draft: false, prerelease: false })
  })
  if (!created.ok) throw new Error(`创建 Release 失败：HTTP ${created.status} ${await created.text()}`)
  rel = await created.json()
  console.log(`Release 已创建（id=${rel.id}）`)
}

// 2. Notes 以 --notes-file 为准（覆盖更新）
if (notesFile && existsSync(resolve(notesFile)) && rel.body !== readFileSync(resolve(notesFile), 'utf8')) {
  const patched = await api(token, `/repos/${REPO}/releases/${rel.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: readFileSync(resolve(notesFile), 'utf8') })
  })
  if (!patched.ok) throw new Error(`更新 Notes 失败：HTTP ${patched.status}`)
  console.log('Notes 已更新')
}

// 3. 同名资产先删后传
const assetsRes = await api(token, `/repos/${REPO}/releases/${rel.id}/assets?per_page=100`)
const assets = assetsRes.ok ? await assetsRes.json() : []
for (const f of [setupExe, portableExe, latestYml]) {
  const name = basename(f)
  const old = assets.find((a) => a.name === name)
  if (old) {
    const del = await api(token, `/repos/${REPO}/releases/assets/${old.id}`, { method: 'DELETE' })
    if (!del.ok && del.status !== 204) throw new Error(`删除旧资产 ${name} 失败：HTTP ${del.status}`)
    console.log(`已删除旧资产 ${name}`)
  }
  const sizeMB = (statSync(f).size / 1024 / 1024).toFixed(1)
  process.stdout.write(`上传 ${name}（${sizeMB} MB）…`)
  const up = await fetch(
    `https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': statSync(f).size,
        'User-Agent': 'all-tools-release'
      },
      // Node fetch 支持 ReadableStream 作为 body；File 流需转 Web 流
      duplex: 'half',
      body: createReadStream(f)
    }
  )
  if (!up.ok) throw new Error(`上传 ${name} 失败：HTTP ${up.status} ${await up.text()}`)
  console.log(' 完成')
}

console.log(`\n发布完成：https://github.com/${REPO}/releases/tag/${tag}`)
