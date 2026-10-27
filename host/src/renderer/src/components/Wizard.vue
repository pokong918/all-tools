<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { WizardStatus } from '../../../common/types'

const emit = defineEmits<{ (e: 'done'): void }>()

const status = ref<WizardStatus | null>(null)
const step = ref(0)
const useDefault = ref(true)
const customRoot = ref('')
const token = ref('')
const syncNow = ref(true)
const finishing = ref(false)

onMounted(async () => {
  status.value = await api.wizardStatus()
})

function fmtGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(0)} GB`
}

async function browse(): Promise<void> {
  const dir = await api.chooseDirectory()
  if (dir) {
    customRoot.value = dir
    useDefault.value = false
  }
}

async function finish(): Promise<void> {
  finishing.value = true
  try {
    await api.completeWizard({
      dataRoot: useDefault.value ? undefined : customRoot.value || undefined,
      token: token.value || undefined,
      syncNow: syncNow.value
    })
    emit('done')
  } finally {
    finishing.value = false
  }
}
</script>

<template>
  <div v-if="status" class="wizard">
    <div class="wizard-card">
      <h1>🧰 欢迎使用 All-Tools</h1>

      <!-- 第 1 步：数据目录 -->
      <section v-if="step === 0">
        <p class="wizard-lead">
          工具将下载到本机数据目录。默认使用系统盘应用数据目录；工具往往体积较大（单个可达数百 MB），建议选择空间充裕的分区。
        </p>
        <label class="wizard-option" :class="{ on: useDefault }">
          <input v-model="useDefault" type="radio" :value="true" />
          <div>
            <strong>默认位置</strong>
            <p class="wizard-path">{{ status.defaultRoot }}</p>
          </div>
        </label>
        <label class="wizard-option" :class="{ on: !useDefault }">
          <input v-model="useDefault" type="radio" :value="false" />
          <div>
            <strong>自定义目录</strong>
            <p class="wizard-path">{{ customRoot || '（点击右侧「浏览」选择）' }}</p>
          </div>
        </label>
        <div class="wizard-row">
          <button class="btn" :disabled="useDefault" @click="browse">浏览…</button>
          <span class="spacer" />
          <button class="btn primary" :disabled="!useDefault && !customRoot" @click="step = 1">下一步</button>
        </div>
        <div class="wizard-drives">
          <p>本机磁盘剩余空间：</p>
          <p v-for="d in status.drives" :key="d.path">
            {{ d.path }} — 剩余 {{ fmtGb(d.free) }}
          </p>
        </div>
      </section>

      <!-- 第 2 步：可选配置 -->
      <section v-else>
        <p class="wizard-lead">
          GitHub Token（可选）：提升目录采集的 API 配额（匿名 60 次/小时 → 5000 次/小时）。可稍后在「设置」中填写。
        </p>
        <input v-model="token" class="wizard-input" placeholder="ghp_…（可选，留空跳过）" />
        <label class="wizard-check">
          <input v-model="syncNow" type="checkbox" />
          立即同步 GitHub 工具目录（推荐，约 12 次 API 请求）
        </label>
        <div class="wizard-row">
          <button class="btn" @click="step = 0">上一步</button>
          <span class="spacer" />
          <button class="btn primary" :disabled="finishing" @click="finish">
            {{ finishing ? '正在准备…' : '完成，进入工具箱' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
