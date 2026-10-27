<script setup lang="ts">
import type { EnvInfo } from '../../../common/types'

defineProps<{
  view: string
  env: EnvInfo
  runningCount: number
  recent: { id: string; name: string }[]
}>()
defineEmits<{
  (e: 'select', v: 'my' | 'catalog' | 'favorites' | 'storage' | 'settings'): void
  (e: 'open-recent', id: string): void
}>()
</script>

<template>
  <aside class="sidebar">
    <div class="brand">🧰 All-Tools</div>
    <nav>
      <button :class="{ on: view === 'my' }" @click="$emit('select', 'my')">
        我的工具<span v-if="runningCount" class="dot">{{ runningCount }}</span>
      </button>
      <button :class="{ on: view === 'catalog' }" @click="$emit('select', 'catalog')">工具目录</button>
      <button :class="{ on: view === 'favorites' }" @click="$emit('select', 'favorites')">收藏</button>
      <button :class="{ on: view === 'storage' }" @click="$emit('select', 'storage')">存储管理</button>
      <button :class="{ on: view === 'settings' }" @click="$emit('select', 'settings')">⚙ 设置</button>
    </nav>
    <div v-if="recent.length" class="recent">
      <p class="recent-title">最近使用</p>
      <button v-for="r in recent" :key="r.id" class="recent-item" @click="$emit('open-recent', r.id)">
        {{ r.name }}
      </button>
    </div>
    <div class="env">
      <p :class="{ ok: env.node }">Node：{{ env.node ?? '未检测到' }}</p>
      <p :class="{ ok: env.git }">Git：{{ env.git ?? '未检测到（用 zip 下载）' }}</p>
      <p :class="{ ok: env.python }">Python：{{ env.python ?? '未检测到' }}</p>
      <p :class="{ ok: env.docker }">Docker：{{ env.docker ?? '未检测到' }}</p>
    </div>
  </aside>
</template>
