// 共通型定義

export type ToolType =
  | 'copilot_agent'
  | 'notebook_lm'
  | 'github_repo'
  | 'zip_upload'
  | 'other'

export type VModelPosition = 'left' | 'bottom' | 'right' | 'support'

export type AspiceCategory = 'SYS' | 'SWE' | 'SUP' | 'MAN' | 'ACQ'

/** A-SPICE プロセス定義（V字モデル上の配置情報を含む） */
export interface AspiceProcess {
  id: string // 例: "SWE.1"
  name: string // 例: "ソフトウェア要件分析"
  category: AspiceCategory
  position: VModelPosition
  displayOrder: number
  /** SVG 上の座標（V字モデル描画用） */
  x: number
  y: number
}

/** ツール（モックデータ） */
export interface Tool {
  id: string
  title: string
  summary: string
  readme?: string
  toolType: ToolType
  aspiceProcesses: string[] // process id の配列
  tags?: string[]
  accessUrl?: string
  author: string
  forkedFrom?: string // フォーク元ツール id
  createdAt: string
  updatedAt?: string
  effectQualitative?: string
  effectHoursPerMonth?: number
  // メトリクス
  likes: number
  views: number
  impressions: number
  accessRequests?: number
  downloads?: number
  forks?: number
}

export type SortKey = 'newest' | 'likes' | 'requests' | 'views'
