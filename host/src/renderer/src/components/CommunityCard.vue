<script setup lang="ts">
import type { CatalogEntry } from '../../../common/types'

defineProps<{ entry: CatalogEntry; busy: boolean }>()
defineEmits<{ (e: 'acquire'): void }>()

const TYPE_LABEL: Record<string, string> = {
  'web-node': 'Web 应用',
  'web-static': '静态工具',
  'web-python': 'Python 应用',
  docker: 'Docker 服务',
  cli: '命令行',
  desktop: '桌面程序',
  unknown: '待识别'
}

function fmtStars(n: number): string {
  return n >= 1000 ? `★${(n / 1000).toFixed(0)}k` : `★${n}`
}
</script>

<template>
  <div class="card card-community">
    <div class="card-head">
      <span class="avatar">{{ entry.name.slice(0, 1) }}</span>
      <div class="title">
        <strong>{{ entry.name }}</strong>
        <span class="meta">
          <em class="type">{{ TYPE_LABEL[entry.toolType] ?? entry.toolType }}</em>
          <em>{{ fmtStars(entry.stars) }}</em>
          <em v-if="entry.language">{{ entry.language }}</em>
          <em>{{ entry.category }}</em>
        </span>
      </div>
    </div>
    <p class="desc">{{ entry.description || '（无简介）' }}</p>
    <div class="card-foot">
      <span class="state">GitHub 社区条目 · 下载后自动识别适配</span>
      <span class="actions">
        <button class="btn primary" :disabled="busy" @click="$emit('acquire')">
          {{ busy ? '获取中…' : '获取' }}
        </button>
      </span>
    </div>
  </div>
</template>
