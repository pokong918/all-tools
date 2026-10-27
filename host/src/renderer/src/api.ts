import type { AllToolsApi } from '../../common/api'

/**
 * contextBridge 的参数序列化不支持 Vue 的响应式 Proxy（直接抛
 * "An object could not be cloned"），对象参数必须先在本层还原为纯 JSON 再跨桥。
 */
function plain<T>(v: T): T {
  return v && typeof v === 'object' ? (JSON.parse(JSON.stringify(v)) as T) : v
}

const bridge: AllToolsApi = (window as unknown as { allTools: AllToolsApi }).allTools

export const api: AllToolsApi = {
  ...bridge,
  acquire: (m) => bridge.acquire(plain(m)),
  acquireEntry: (e) => bridge.acquireEntry(plain(e)),
  start: (m) => bridge.start(plain(m)),
  updateTool: (m) => bridge.updateTool(plain(m)),
  saveOverride: (patch) => bridge.saveOverride(plain(patch)),
  setPrefs: (p) => bridge.setPrefs(plain(p)),
  completeWizard: (payload) => bridge.completeWizard(plain(payload))
}
