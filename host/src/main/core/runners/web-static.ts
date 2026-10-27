import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import type { Server } from 'node:http'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm'
}

/**
 * web-static Runner：宿主内置静态服务。
 * 统一以 http://127.0.0.1:{port} 暴露，使静态工具与 web-node 工具
 * 共享同一套「启动-健康检查-打开-停止」生命周期，渲染层零特判。
 */
export function startStaticServer(dir: string, port: number): Promise<Server> {
  const root = path.normalize(dir)
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
        let file = path.normalize(path.join(root, urlPath))
        if (!file.startsWith(root)) {
          res.writeHead(403).end('forbidden')
          return
        }
        // 目录或不存在的路径回退 index.html（兼容 SPA 路由）
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          file = path.join(root, 'index.html')
        }
        if (!fs.existsSync(file)) {
          res.writeHead(404).end('not found')
          return
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' })
        fs.createReadStream(file).pipe(res)
      } catch (e) {
        res.writeHead(500).end(String(e))
      }
    })
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}
