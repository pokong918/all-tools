<script setup lang="ts">
import { reactive, ref } from 'vue'
import { api } from '../api'
import type { ToolManifest } from '../../../common/types'

const props = defineProps<{ manifest: ToolManifest }>()
const emit = defineEmits<{ (e: 'close', updated: ToolManifest | null): void }>()

const saving = ref(false)
const form = reactive({
  start: props.manifest.start,
  portDefault: props.manifest.port?.default ?? '',
  portEnv: props.manifest.port?.env ?? 'PORT',
  openUrl: props.manifest.openUrl,
  hcPath: props.manifest.healthCheck?.path ?? '/',
  hcTimeout: props.manifest.healthCheck?.timeoutMs ?? 60000
})

async function save(): Promise<void> {
  saving.value = true
  try {
    const updated = await api.saveOverride({
      id: props.manifest.id,
      start: form.start.trim(),
      openUrl: form.openUrl.trim() || '/',
      port: {
        default: form.portDefault === '' ? undefined : Number(form.portDefault),
        env: form.portEnv.trim() || 'PORT'
      },
      healthCheck: {
        path: form.hcPath.trim() || '/',
        timeoutMs: Number(form.hcTimeout) || 60000
      }
    })
    emit('close', updated)
  } finally {
    saving.value = false
  }
}

async function reset(): Promise<void> {
  saving.value = true
  try {
    const updated = await api.resetOverride(props.manifest.id)
    emit('close', updated)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close', null)">
    <div class="modal">
      <h2>调整适配 — {{ manifest.name }}</h2>
      <p class="modal-tip">
        当工具启动失败（脚本名变化、端口约定不同等）时可在此覆盖适配参数，保存后重新打开工具即生效；
        「恢复默认」清除本地覆盖。
      </p>

      <label class="field">
        <span>启动命令（支持 {port} 占位符）</span>
        <input v-model="form.start" class="settings-input" placeholder="如 npm run dev -- --port {port}" />
      </label>

      <div class="field-row">
        <label class="field">
          <span>默认端口</span>
          <input v-model="form.portDefault" class="settings-input" type="number" placeholder="3000" />
        </label>
        <label class="field">
          <span>端口环境变量</span>
          <input v-model="form.portEnv" class="settings-input" placeholder="PORT" />
        </label>
      </div>

      <div class="field-row">
        <label class="field">
          <span>打开路径</span>
          <input v-model="form.openUrl" class="settings-input" placeholder="/" />
        </label>
        <label class="field">
          <span>健康检查路径</span>
          <input v-model="form.hcPath" class="settings-input" placeholder="/" />
        </label>
      </div>

      <label class="field">
        <span>健康检查超时（毫秒）</span>
        <input v-model="form.hcTimeout" class="settings-input" type="number" placeholder="60000" />
      </label>

      <div class="wizard-row">
        <button class="btn" :disabled="saving" @click="reset">恢复默认</button>
        <span class="spacer" />
        <button class="btn" :disabled="saving" @click="emit('close', null)">取消</button>
        <button class="btn primary" :disabled="saving || !form.start.trim()" @click="save">
          {{ saving ? '保存中…' : '保存并应用' }}
        </button>
      </div>
    </div>
  </div>
</template>
