/**
 * 業務カテゴリ定義。
 * Automotive SPICE プロセスとは別軸の「業務シーン」分類。
 * 日々の会議・メール・チャット処理など、A-SPICE では拾えない雑務系も
 * 登録できるようにするため、独立した軸として設計する。
 * 「AI活用促進」はメタ枠（AI活用そのものを支援するツール）。
 */

export type WorkCategoryId =
  | 'meeting'
  | 'mail'
  | 'chat'
  | 'document'
  | 'knowledge'
  | 'task_mgmt'
  | 'translation'
  | 'ai_enablement'

export interface WorkCategory {
  id: WorkCategoryId
  name: string
  icon: string
  color: string
  description: string
}

export const WORK_CATEGORIES: WorkCategory[] = [
  { id: 'meeting', name: '会議効率化', icon: '🗣️', color: '#5b9bd5', description: '議事録・要約・アクション抽出' },
  { id: 'mail', name: 'メール処理', icon: '✉️', color: '#7eb87e', description: '返信ドラフト・要約・振り分け' },
  { id: 'chat', name: 'チャット支援', icon: '💬', color: '#41c7b9', description: 'Teams/Slack 等の応答補助' },
  { id: 'document', name: '文書作成', icon: '📝', color: '#e0a458', description: 'ドラフト生成・体裁整え・校正' },
  { id: 'knowledge', name: 'ナレッジ検索', icon: '🔎', color: '#b88ad6', description: '社内文書・規格・過去事例の検索' },
  { id: 'task_mgmt', name: 'タスク管理', icon: '✅', color: '#e07a8b', description: 'TODO抽出・進捗集計・リマインド' },
  { id: 'translation', name: '翻訳・多言語', icon: '🌐', color: '#8a98ad', description: '専門用語対応の翻訳・通訳' },
  { id: 'ai_enablement', name: 'AI活用促進', icon: '🚀', color: '#f0c987', description: 'プロンプト集・プラットフォーム・教材など、AI活用そのものを支援するメタツール' },
]

export const WORK_CATEGORY_MAP: Record<WorkCategoryId, WorkCategory> = Object.fromEntries(
  WORK_CATEGORIES.map((c) => [c.id, c]),
) as Record<WorkCategoryId, WorkCategory>
