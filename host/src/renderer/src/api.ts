import type { AllToolsApi } from '../../common/api'

export const api: AllToolsApi = (window as unknown as { allTools: AllToolsApi }).allTools
