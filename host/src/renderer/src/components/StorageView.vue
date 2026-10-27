<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import type { StorageInfo } from '../../../common/types'

const list = ref<StorageInfo[]>([])
const loading = ref(false)
const busyId = ref('')

async function load(): Promise<void> {
  loading.value = true
  try {
    list.value = await api.storageList()
  } finally {
    loading.value = false
  }
}

onMounted(load)

function fmt(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

const totalBytes = computed(() => list.value.reduce((s, i) => s + i.total, 0))
const depsBytes = computed(() => list.value.reduce((s, i) => s + i.deps, 0))

async function onClearDeps(id: string, name: string): Promise<void> {
  if (!confirm(`清理「${name}」的依赖目录（node_modules/.venv 等）？清理后将自动重新安装。`)) return
  busyId.value = id
  try {
    await api.clearDeps(id)
    await load()
  } catch (e) {
    alert(`清理/重装失败：${(e as Error).message}`)
  } finally {
    busyId.value = ''
  }
}
</script>

<template>
  <section class="storage">
    <header class="storage-head">
      <h2>存储管理</h2>
      <p v-if="list.length">
        共 {{ list.length }} 个工具，总计 {{ fmt(totalBytes) }}，其中依赖 {{ fmt(depsBytes) }}（可清理重装）
      </p>
      <button class="btn" :disabled="loading" @click="load">{{ loading ? '统计中…' : '刷新统计' }}</button>
    </header>
    <p v-if="!list.length" class="empty">还没有已获取的工具</p>
    <table v-else class="storage-table">
      <thead>
        <tr>
          <th>工具</th>
          <th>总计</th>
          <th>依赖</th>
          <th>代码</th>
          <th>位置</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in list" :key="s.id">
          <td>{{ s.name }}</td>
          <td>{{ fmt(s.total) }}</td>
          <td>{{ fmt(s.deps) }}</td>
          <td>{{ fmt(s.code) }}</td>
          <td class="path" :title="s.dir">{{ s.dir }}</td>
          <td>
            <button
              v-if="s.deps > 0"
              class="btn"
              :disabled="busyId === s.id"
              @click="onClearDeps(s.id, s.name)"
            >
              {{ busyId === s.id ? '处理中…' : '清理依赖' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
