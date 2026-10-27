/**
 * 应用图标生成（零设计工具依赖）：
 * 纯 Node 像素绘制 + zlib PNG 编码 + ICO 封装。
 * 图案：蓝紫渐变圆角方块 + 白色 2x2 格子（工具箱隐喻）。
 *
 * 产物：
 *   build/icon.ico      多尺寸 ICO（256/48/32/16，PNG-in-ICO），electron-builder 自动用于 exe/快捷方式
 *   build/icon-32.png   托盘图标
 *   build/icon-256.png  窗口/预览图标
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build')

// ---------- 像素绘制 ----------

/** 圆角矩形有向距离：负值在内部 */
function roundedRectSDF(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r
  const qy = Math.abs(py - cy) - hh + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function mix(a, b, t) {
  return a + (b - a) * t
}

/** 渲染 size×size RGBA（4 子采样抗锯齿） */
function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4)
  const c0 = [0x4f, 0x7c, 0xff] // #4F7CFF
  const c1 = [0x9b, 0x59, 0xf5] // #9B59F5
  const white = [0xff, 0xff, 0xff]

  const m = size * 0.26 // 格子区域边距
  const gap = size * 0.1
  const cell = (size - 2 * m - gap) / 2
  const cellR = cell * 0.28
  const centers = [
    [m + cell / 2, m + cell / 2],
    [size - m - cell / 2, m + cell / 2],
    [m + cell / 2, size - m - cell / 2],
    [size - m - cell / 2, size - m - cell / 2]
  ]

  const bgR = size * 0.21 // 背景圆角半径
  const SS = 2 // 子采样倍数

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          const bgDist = roundedRectSDF(px, py, size / 2, size / 2, size / 2 - 1, size / 2 - 1, bgR)
          const bgA = Math.max(0, Math.min(1, 0.5 - bgDist))
          if (bgA <= 0) continue
          let cellA = 0
          for (const [ccx, ccy] of centers) {
            const d = roundedRectSDF(px, py, ccx, ccy, cell / 2, cell / 2, cellR)
            cellA = Math.max(cellA, Math.max(0, Math.min(1, 0.5 - d)))
          }
          const t = (px + py) / (2 * size)
          const [br, bg2, bb] = [mix(c0[0], c1[0], t), mix(c0[1], c1[1], t), mix(c0[2], c1[2], t)]
          const [fr, fg, fb] = [
            mix(br, white[0], cellA),
            mix(bg2, white[1], cellA),
            mix(bb, white[2], cellA)
          ]
          r += fr * bgA
          g += fg * bgA
          b += fb * bgA
          a += bgA
        }
      }
      const n = SS * SS
      const idx = (y * size + x) * 4
      if (a > 0) {
        buf[idx] = Math.round(r / a)
        buf[idx + 1] = Math.round(g / a)
        buf[idx + 2] = Math.round(b / a)
        buf[idx + 3] = Math.round((a / n) * 255)
      }
    }
  }
  return buf
}

// ---------- PNG 编码 ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(rgba, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- ICO 封装（PNG-in-ICO） ----------

function buildICO(sizes) {
  const pngs = sizes.map((s) => ({ size: s, png: encodePNG(renderIcon(s), s) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  const blobs = []
  let offset = 6 + pngs.length * 16
  for (const { size, png } of pngs) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bpp
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    blobs.push(png)
    offset += png.length
  }
  return Buffer.concat([header, ...entries, ...blobs])
}

// ---------- 输出 ----------

fs.mkdirSync(OUT_DIR, { recursive: true })
const png256 = encodePNG(renderIcon(256), 256)
const png32 = encodePNG(renderIcon(32), 32)
fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), buildICO([256, 48, 32, 16]))
fs.writeFileSync(path.join(OUT_DIR, 'icon-256.png'), png256)
fs.writeFileSync(path.join(OUT_DIR, 'icon-32.png'), png32)
console.log(`[gen-icon] build/icon.ico (${fs.statSync(path.join(OUT_DIR, 'icon.ico')).size} bytes)`)
console.log(`[gen-icon] build/icon-256.png (${png256.length} bytes), build/icon-32.png (${png32.length} bytes)`)
