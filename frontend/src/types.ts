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

/** ツール内に保持するスクリーンショット情報 */
export interface ScreenshotInfo {
  id: string
  /** 表示用URL（実APIモードでは絶対URL、モックではObjectURLまたはdata URL） */
  url: string
  displayOrder: number
}

/** ツール（モックデータ） */
export interface Tool {
  id: string
  title: string
  summary: string
  readme?: string
  toolType: ToolType
  aspiceProcesses: string[] // process id の配列（A-SPICE。空可）
  workCategories?: string[] // 業務カテゴリ id の配列（A-SPICEと別軸の業務シーン分類）
  tags?: string[]
  accessUrl?: string
  /** zipの元ファイル名（表示用、実APIモードのみ） */
  zipFileName?: string
  /** スクリーンショット一覧 */
  screenshots?: ScreenshotInfo[]
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

export type SortKey = 'newest' | 'likes' | 'requests' | 'views' | 'name_asc' | 'downloads'

/** コメント種別（バックエンドの Comment.Kind と一致） */
export type CommentType = 'bug' | 'feature' | 'question' | 'general'

/** コメント1件 */
export interface ToolComment {
  id: string
  toolId: string
  author: string
  body: string
  commentType: CommentType
  parent?: string | null
  createdAt: string
  likeCount: number
  likedByMe: boolean
}
