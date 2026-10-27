<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { api } from '../api'

const props = defineProps<{ toolId: string }>()
const host = ref<HTMLDivElement | null>(null)
let term: Terminal | null = null
let fit: FitAddon | null = null
let unsub: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!host.value) return
  term = new Terminal({
    fontSize: 13,
    cursorBlink: true,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: {
      background: '#0b0d12',
      foreground: '#c8d1e0'
    }
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(host.value)
  fit.fit()
  term.writeln('\x1b[36m[All-Tools]\x1b[0m 已进入工具目录，可直接运行命令（如 npm start / dir）\r')
  unsub = api.onTermData((v) => {
    if (v.id === props.toolId) term?.write(v.data)
  })
  term.onData((d) => api.termWrite(props.toolId, d))
  resizeObserver = new ResizeObserver(() => fit?.fit())
  resizeObserver.observe(host.value)
  void api.termOpen(props.toolId)
})

onUnmounted(() => {
  unsub?.()
  resizeObserver?.disconnect()
  term?.dispose()
})
</script>

<template>
  <div ref="host" class="term" />
</template>
