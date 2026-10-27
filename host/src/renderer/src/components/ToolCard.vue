<script setup lang="ts">
import { computed } from 'vue'
import type { ToolListItem } from '../../../common/types'

const props = defineProps<{ item: ToolListItem; busy: boolean; fav: boolean }>()
defineEmits<{ (e: 'acquire' | 'open' | 'stop' | 'remove' | 'update' | 'edit' | 'toggle-fav'): void }>()

const STATE_LABEL: Record<string, string> = {
  'not-downloaded': '',
  downloading: '下载中…',
  installing: '安装依赖中…',
  ready: '已就绪',
  starting: '启动中…',
  running: '● 运行中',
  stopped: '已停止',
  error: '失败'
}

const TYPE_LABEL: Record<string, string> = {
  'web-node': 'Web 应用',
  'web-static': '静态工具',
  'web-python': 'Python 应用',
  docker: 'Docker 服务',
  cli: '命令行',
  desktop: '桌面程序'
}

const stateText = computed(() => STATE_LABEL[props.item.state] ?? '')
const starsText = computed(() =>
  props.item.manifest.stars
    ? props.item.manifest.stars >= 1000
      ? `★${(props.item.manifest.stars / 1000).toFixed(0)}k`
      : `★${props.item.manifest.stars}`
    : ''
)
</script>

<template>
  <div class="card" :class="`s-${item.state}`">
    <div class="card-head">
      <span class="avatar">{{ item.manifest.name.slice(0, 1) }}</span>
      <div class="title">
        <strong>{{ item.manifest.name }}</strong>
        <span class="meta">
          <em class="type">{{ TYPE_LABEL[item.manifest.type] ?? item.manifest.type }}</em>
          <em v-if="starsText">{{ starsText }}</em>
          <em>{{ item.manifest.category }}</em>
        </span>
      </div>
      <button class="fav" :class="{ on: fav }" title="收藏" @click="$emit('toggle-fav')">
        {{ fav ? '★' : '☆' }}
      </button>
    </div>

    <p class="desc">{{ item.manifest.descriptionZh || item.manifest.description }}</p>

    <div class="card-foot">
      <span class="state" :class="`t-${item.state}`">
        {{ stateText }}
        <em v-if="item.official" class="badge-official" title="官方预置适配清单，经过验证">官方</em>
        <em v-else class="badge-auto" title="下载后由宿主自动识别生成">自动适配</em>
      </span>
      <span class="actions">
        <button v-if="!item.installed" class="btn primary" :disabled="busy" @click="$emit('acquire')">
          {{ busy ? '处理中…' : '获取' }}
        </button>
        <template v-else>
          <button v-if="item.state === 'running'" class="btn" :disabled="busy" @click="$emit('stop')">停止</button>
          <button
            v-else
            class="btn primary"
            :disabled="busy || item.state === 'downloading' || item.state === 'installing'"
            @click="$emit('open')"
          >
            {{ item.state === 'starting' ? '启动中…' : '打开' }}
          </button>
          <button
            class="btn"
            :disabled="busy || item.state === 'downloading' || item.state === 'installing'"
            title="检查上游更新"
            @click="$emit('update')"
          >
            更新
          </button>
          <button
            class="btn"
            :disabled="busy || item.state === 'downloading'"
            title="调整适配参数（启动命令/端口/健康检查）"
            @click="$emit('edit')"
          >
            调整
          </button>
          <button class="btn danger" :disabled="busy || item.state === 'downloading'" @click="$emit('remove')">移除</button>
        </template>
      </span>
    </div>
    <p v-if="item.lastError" class="err" :title="item.lastError">⚠ {{ item.lastError }}</p>
  </div>
</template>
