<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api'
import type { HostUpdateInfo, WizardStatus } from '../../../common/types'

const token = ref('')
const releaseRepo = ref('')
const saving = ref(false)
const saveMsg = ref('')
const msMsg = ref('')
const msBusy = ref(false)
const upd = ref<HostUpdateInfo | null>(null)
const updBusy = ref(false)
const wizard = ref<WizardStatus | null>(null)
const changingDir = ref(false)

onMounted(async () => {
  const p = await api.getPrefs()
  token.value = p.githubToken ?? ''
  releaseRepo.value = p.releaseRepo ?? ''
  wizard.value = await api.wizardStatus()
})

async function save(): Promise<void> {
  saving.value = true
  try {
    const p = await api.getPrefs()
    await api.setPrefs({ ...p, githubToken: token.value.trim() || undefined, releaseRepo: releaseRepo.value.trim() || undefined })
    saveMsg.value = '已保存'
  } finally {
    saving.value = false
  }
}

async function syncManifests(): Promise<void> {
  msBusy.value = true
  msMsg.value = '同步中…'
  try {
    const r = await api.syncManifests()
    msMsg.value = `完成：新增 ${r.added}，更新 ${r.updated}，远端共 ${r.total} 份清单`
  } catch (e) {
    msMsg.value = `失败：${(e as Error).message}`
  } finally {
    msBusy.value = false
  }
}

async function checkUpdate(): Promise<void> {
  updBusy.value = true
  try {
    upd.value = await api.checkHostUpdate()
    if (upd.value.hasUpdate && upd.value.releaseUrl) {
      await api.openExternal(upd.value.releaseUrl)
    }
  } finally {
    updBusy.value = false
  }
}

async function changeDataDir(): Promise<void> {
  if (
    !confirm(
      '迁移数据目录？将停止所有运行中的工具，并把 tools/、data/ 复制到新目录（数据量较大时耗时较长）。完成后需重启应用。'
    )
  )
    return
  changingDir.value = true
  try {
    const dir = await api.chooseDirectory()
    if (!dir) return
    const r = await api.migrateDataRoot(dir)
    wizard.value = await api.wizardStatus()
    alert(`迁移完成（已复制：${r.moved.join('、') || '无'}）。\n请重启应用后生效。`)
  } catch (e) {
    alert(`迁移失败：${(e as Error).message}`)
  } finally {
    changingDir.value = false
  }
}

async function doExport(): Promise<void> {
  try {
    const file = await api.backupExport()
    if (file) alert(`备份已导出：\n${file}`)
  } catch (e) {
    alert(`导出失败：${(e as Error).message}`)
  }
}

async function doImport(): Promise<void> {
  if (!confirm('导入备份？将覆盖收藏/最近使用/适配覆盖/目录缓存（不影响已下载的工具）。导入后建议重启应用。')) return
  try {
    const r = await api.backupImport()
    if (r) alert(`导入完成，已恢复：${r.restored.join('、')}`)
  } catch (e) {
    alert(`导入失败：${(e as Error).message}`)
  }
}

function fmtGb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(0)} GB`
}
</script>

<template>
  <section class="storage">
    <header class="storage-head">
      <h2>设置</h2>
    </header>

    <div class="settings-block">
      <h3>GitHub</h3>
      <label class="field">
        <span>Personal Access Token（可选）</span>
        <input v-model="token" class="settings-input" placeholder="ghp_… 提升采集配额至 5000 次/小时" />
      </label>
      <label class="field">
        <span>发布仓库 owner/repo（可选）</span>
        <input v-model="releaseRepo" class="settings-input" placeholder="例：yourname/all-tools，用于清单远程同步与宿主更新检查" />
      </label>
      <div class="wizard-row">
        <button class="btn primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        <span v-if="saveMsg" class="settings-msg">{{ saveMsg }}</span>
      </div>
    </div>

    <div class="settings-block">
      <h3>工具适配清单</h3>
      <p class="settings-tip">从发布仓库拉取官方 Manifest 增量（需先配置上方发布仓库）。</p>
      <div class="wizard-row">
        <button class="btn" :disabled="msBusy" @click="syncManifests">{{ msBusy ? '同步中…' : '同步官方清单' }}</button>
        <span v-if="msMsg" class="settings-msg">{{ msMsg }}</span>
      </div>
    </div>

    <div class="settings-block">
      <h3>宿主更新</h3>
      <div class="wizard-row">
        <button class="btn" :disabled="updBusy" @click="checkUpdate">{{ updBusy ? '检查中…' : '检查更新' }}</button>
        <span v-if="upd" class="settings-msg">
          当前 v{{ upd.current }}
          <template v-if="upd.latest">｜最新 v{{ upd.latest }}</template>
          ｜{{ upd.message }}
        </span>
      </div>
    </div>

    <div v-if="wizard?.isPackaged" class="settings-block">
      <h3>数据目录</h3>
      <p class="settings-tip">当前：{{ wizard.currentRoot }}</p>
      <div class="wizard-row">
        <button class="btn" :disabled="changingDir" @click="changeDataDir">
          {{ changingDir ? '迁移中…' : '迁移数据目录…' }}
        </button>
      </div>
    </div>

    <div class="settings-block">
      <h3>备份与恢复</h3>
      <p class="settings-tip">
        备份包含：收藏、最近使用、GitHub Token、适配覆盖、目录缓存。已下载的工具本体不含在内（换机后需重新获取）。
      </p>
      <div class="wizard-row">
        <button class="btn" @click="doExport">导出备份…</button>
        <button class="btn" @click="doImport">导入备份…</button>
      </div>
    </div>

    <div v-if="wizard" class="settings-block">
      <h3>本机磁盘</h3>
      <p v-for="d in wizard.drives" :key="d.path" class="settings-tip">{{ d.path }} 剩余 {{ fmtGb(d.free) }}</p>
    </div>
  </section>
</template>
