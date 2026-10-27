<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import LogPanel from './LogPanel.vue'
import TermView from './TermView.vue'
import { api } from '../api'

const props = defineProps<{ tool: { id: string; name: string; openUrl: string; terminal: boolean } }>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'stopped'): void }>()

const logs = ref<string[]>([])
const showLogs = ref(true)
const stopped = ref(false)
const wv = ref<{ reload: () => void } | null>(null)
const logBox = ref<HTMLPreElement | null>(null)

let unsubLog: (() => void) | null = null
let unsubState: (() => void) | null = null

onMounted(async () => {
  logs.value = await api.logs(props.tool.id)
  unsubLog = api.onToolLog((v) => {
    if (v.id === props.tool.id) logs.value.push(v.line)
  })
  unsubState = api.onToolState((s) => {
    if (s.id === props.tool.id && (s.state === 'stopped' || s.state === 'error')) stopped.value = true
  })
})

onUnmounted(() => {
  unsubLog?.()
  unsubState?.()
})

watch(
  () => logs.value.length,
  async () => {
    await nextTick()
    if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight
  }
)

async function stopTool(): Promise<void> {
  await api.stop(props.tool.id)
  emit('stopped')
  emit('back')
}
</script>

<template>
  <div class="useview">
    <header class="usebar">
      <button class="btn" @click="emit('back')">← 返回</button>
      <strong>{{ tool.name }}</strong>
      <span v-if="tool.terminal" class="url">内嵌终端 · 工具目录</span>
      <span v-else-if="!tool.openUrl" class="url">桌面程序 · 独立窗口</span>
      <span v-else class="url">{{ tool.openUrl }}</span>
      <span class="spacer" />
      <button v-if="tool.openUrl" class="btn" @click="wv?.reload()">刷新</button>
      <button v-if="tool.openUrl" class="btn" @click="api.openExternal(tool.openUrl)">外部打开</button>
      <button class="btn danger" @click="stopTool">停止</button>
    </header>
    <div class="usebody" :class="{ 'usebody-term': tool.terminal || !tool.openUrl }">
      <TermView v-if="tool.terminal" :tool-id="tool.id" />
      <div v-else-if="!tool.openUrl" class="desktop-tip">
        <template v-if="!stopped">
          <p class="big">🖥️ 桌面程序已启动</p>
          <p>桌面程序以独立窗口运行，无法嵌入宿主窗口；可在此停止或重新启动它。</p>
        </template>
        <template v-else>
          <p class="big">桌面程序已退出</p>
          <p>返回列表后可重新「打开」。</p>
        </template>
      </div>
      <template v-else>
        <webview ref="wv" :src="tool.openUrl" class="wv" />
        <p v-if="stopped" class="stopped-tip">工具已停止，可返回列表重新启动</p>
      </template>
    </div>
    <LogPanel v-if="showLogs" :logs="logs" @close="showLogs = false" />
    <button v-else class="btn logtoggle" @click="showLogs = true">日志</button>
  </div>
</template>
