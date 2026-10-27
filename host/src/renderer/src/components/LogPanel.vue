<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{ logs: string[] }>()
defineEmits<{ (e: 'close'): void }>()

const box = ref<HTMLPreElement | null>(null)

watch(
  () => props.logs.length,
  async () => {
    await nextTick()
    if (box.value) box.value.scrollTop = box.value.scrollHeight
  }
)
</script>

<template>
  <section class="logpanel">
    <header>
      <span>运行日志</span>
      <button class="btn ghost" @click="$emit('close')">收起</button>
    </header>
    <pre ref="box">{{ logs.slice(-400).join('\n') }}</pre>
  </section>
</template>
