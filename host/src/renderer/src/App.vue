<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Sidebar from './components/Sidebar.vue'
import ToolCard from './components/ToolCard.vue'
import CommunityCard from './components/CommunityCard.vue'
import UseView from './components/UseView.vue'
import StorageView from './components/StorageView.vue'
import SettingsView from './components/SettingsView.vue'
import Wizard from './components/Wizard.vue'
import { api } from './api'
import type { CatalogEntry, EnvInfo, ToolListItem, ToolManifest } from '../../common/types'

type View = 'my' | 'catalog' | 'favorites' | 'storage' | 'settings'

const view = ref<View>('catalog')
const wizard = ref(false)
const tools = ref<ToolListItem[]>([])
const community = ref<CatalogEntry[]>([])
const env = ref<EnvInfo>({ node: null, npm: null, git: null, python: null, docker: null })
const search = ref('')
const activeCategory = ref('')
const favorites = ref<string[]>([])
const recentIds = ref<string[]>([])
const useTarget = ref<{ id: string; name: string; openUrl: string; terminal: boolean } | null>(null)
const busy = ref('')
const syncing = ref(false)
const syncMsg = ref('')

async function refresh(): Promise<void> {
  const r = await api.catalog()
  tools.value = r.tools
  community.value = r.community
}

onMounted(async () => {
  const ws = await api.wizardStatus()
  wizard.value = ws.need
  await refresh()
  env.value = await api.envInfo()
  const p = await api.getPrefs()
  favorites.value = p.favorites
  recentIds.value = p.recent
  api.onToolState((s) => {
    const it = tools.value.find((i) => i.manifest.id === s.id)
    if (!it) return
    it.state = (s.state as ToolListItem['state']) ?? 'not-downloaded'
    it.port = s.port
    it.installed = s.state !== 'not-downloaded'
  })
  api.onFocusTool((v) => {
    const it = tools.value.find((i) => i.manifest.id === v.id)
    if (it) void openTool(it.manifest)
  })
})

const categories = computed(() => {
  const set = new Set<string>()
  for (const i of tools.value) set.add(i.manifest.category)
  for (const c of community.value) set.add(c.category)
  return [...set]
})

const recentNames = computed(() =>
  recentIds.value
    .map((id) => tools.value.find((t) => t.manifest.id === id))
    .filter((t): t is ToolListItem => !!t)
    .slice(0, 5)
    .map((t) => ({ id: t.manifest.id, name: t.manifest.name }))
)

function matchSearch(text: string): boolean {
  const q = search.value.trim().toLowerCase()
  return !q || text.toLowerCase().includes(q)
}

const shownTools = computed(() => {
  let list = tools.value
  if (view.value === 'my') list = list.filter((i) => i.installed)
  if (view.value === 'favorites') list = list.filter((i) => favorites.value.includes(i.manifest.id))
  if (activeCategory.value) list = list.filter((i) => i.manifest.category === activeCategory.value)
  return list.filter((i) =>
    matchSearch(
      [
        i.manifest.name,
        i.manifest.description,
        i.manifest.descriptionZh ?? '',
        i.manifest.repo,
        ...(i.manifest.tags ?? [])
      ].join(' ')
    )
  )
})

// 社区条目仅目录视图展示；默认渲染前 60 条防卡顿，用搜索缩小范围
const shownCommunity = computed(() => {
  if (view.value !== 'catalog') return []
  let list = community.value
  if (activeCategory.value) list = list.filter((c) => c.category === activeCategory.value)
  return list.filter((c) => matchSearch([c.name, c.description, c.repo, ...c.topics].join(' '))).slice(0, 60)
})

async function onAcquire(m: ToolManifest): Promise<void> {
  busy.value = m.id
  try {
    await api.acquire(m)
  } catch (e) {
    alert(`获取失败：${(e as Error).message}（详情可在打开后查看日志）`)
  } finally {
    busy.value = ''
    await refresh()
  }
}

async function onAcquireEntry(e: CatalogEntry): Promise<void> {
  busy.value = e.repo
  try {
    await api.acquireEntry(e)
  } catch (err) {
    alert(`获取失败：${(err as Error).message}`)
  } finally {
    busy.value = ''
    await refresh()
  }
}

async function openTool(m: ToolManifest): Promise<void> {
  busy.value = m.id
  try {
    const r = await api.start(m)
    useTarget.value = { id: m.id, name: m.name, openUrl: r.openUrl, terminal: m.type === 'cli' }
  } catch (e) {
    alert(`启动失败：${(e as Error).message}`)
  } finally {
    busy.value = ''
  }
}

async function onUpdate(m: ToolManifest): Promise<void> {
  if (!confirm(`检查并更新「${m.name}」？运行中将被停止。`)) return
  busy.value = m.id
  try {
    const r = await api.updateTool(m)
    syncMsg.value = `${m.name}：${r.message}`
  } catch (e) {
    alert(`更新失败：${(e as Error).message}`)
  } finally {
    busy.value = ''
    await refresh()
  }
}

async function onStop(id: string): Promise<void> {
  await api.stop(id)
  await refresh()
}

async function onRemove(id: string): Promise<void> {
  if (!confirm('确认移除该工具？其本地目录（含依赖与本地数据）将被删除。')) return
  busy.value = id
  try {
    await api.remove(id)
  } finally {
    busy.value = ''
    await refresh()
  }
}

async function toggleFav(id: string): Promise<void> {
  favorites.value = favorites.value.includes(id)
    ? favorites.value.filter((f) => f !== id)
    : [...favorites.value, id]
  await api.setPrefs({ ...(await api.getPrefs()), favorites: favorites.value })
}

async function syncCatalog(): Promise<void> {
  syncing.value = true
  syncMsg.value = '同步中…（使用 GitHub API，匿名配额 60 次/小时）'
  try {
    const r = await api.syncCatalog()
    syncMsg.value = `同步完成：新增 ${r.added}，更新 ${r.updated}，共 ${r.total} 条（${r.requests} 次请求）`
    await refresh()
  } catch (e) {
    syncMsg.value = `同步失败：${(e as Error).message}`
  } finally {
    syncing.value = false
  }
}

async function openRecent(id: string): Promise<void> {
  const it = tools.value.find((t) => t.manifest.id === id)
  if (it) await openTool(it.manifest)
}
</script>

<template>
  <div class="app">
    <Wizard v-if="wizard" @done="wizard = false" />
    <Sidebar
      :view="view"
      :env="env"
      :running-count="tools.filter((i) => i.state === 'running').length"
      :recent="recentNames"
      @select="(v) => (view = v)"
      @open-recent="openRecent"
    />
    <main class="main">
      <UseView v-if="useTarget" :tool="useTarget" @back="useTarget = null" @stopped="refresh" />
      <SettingsView v-else-if="view === 'settings'" />
      <StorageView v-else-if="view === 'storage'" />
      <template v-else>
        <header class="toolbar">
          <div class="toolbar-row">
            <input v-model="search" class="search" placeholder="搜索工具名称 / 用途 / 标签…" />
            <button class="btn" :disabled="syncing" @click="syncCatalog">
              {{ syncing ? '同步中…' : '⟳ 同步 GitHub 目录' }}
            </button>
          </div>
          <div class="chips">
            <button class="chip" :class="{ on: !activeCategory }" @click="activeCategory = ''">全部</button>
            <button
              v-for="c in categories"
              :key="c"
              class="chip"
              :class="{ on: activeCategory === c }"
              @click="activeCategory = c"
            >
              {{ c }}
            </button>
          </div>
          <p v-if="syncMsg" class="syncmsg">{{ syncMsg }}</p>
        </header>
        <div class="grid">
          <ToolCard
            v-for="it in shownTools"
            :key="it.manifest.id"
            :item="it"
            :busy="busy === it.manifest.id"
            :fav="favorites.includes(it.manifest.id)"
            @acquire="onAcquire(it.manifest)"
            @open="openTool(it.manifest)"
            @stop="onStop(it.manifest.id)"
            @remove="onRemove(it.manifest.id)"
            @update="onUpdate(it.manifest)"
            @toggle-fav="toggleFav(it.manifest.id)"
          />
          <CommunityCard
            v-for="c in shownCommunity"
            :key="c.repo"
            :entry="c"
            :busy="busy === c.repo"
            @acquire="onAcquireEntry(c)"
          />
        </div>
        <p v-if="!shownTools.length && !shownCommunity.length" class="empty">暂无内容</p>
        <p v-else-if="community.length > shownCommunity.length" class="more-hint">
          社区目录共 {{ community.length }} 条，当前展示 {{ shownCommunity.length }} 条，可用搜索缩小范围
        </p>
      </template>
    </main>
  </div>
</template>
