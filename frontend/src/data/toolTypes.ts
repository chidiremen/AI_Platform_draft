import type { ToolType } from '../types'

export interface ToolTypeInfo {
  value: ToolType
  label: string
  /** 詳細ページのプライマリアクション種別 */
  action: 'request_access' | 'download'
  icon: string
  color: string
}

export const TOOL_TYPES: ToolTypeInfo[] = [
  { value: 'copilot_agent', label: 'MS Copilotエージェント', action: 'request_access', icon: '🤖', color: '#4f9dde' },
  { value: 'notebook_lm', label: 'NotebookLM', action: 'request_access', icon: '📓', color: '#41c7b9' },
  { value: 'github_repo', label: 'GitHubリポジトリ', action: 'request_access', icon: '🐙', color: '#b88ad6' },
  { value: 'zip_upload', label: 'zipアップロード', action: 'download', icon: '📦', color: '#e0a458' },
  { value: 'other', label: 'その他', action: 'request_access', icon: '🔧', color: '#8a98ad' },
]

export const TOOL_TYPE_MAP: Record<ToolType, ToolTypeInfo> = Object.fromEntries(
  TOOL_TYPES.map((t) => [t.value, t]),
) as Record<ToolType, ToolTypeInfo>
