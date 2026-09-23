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
  /** 登録者のメールアドレス（フィードバックメールの宛先に使う） */
  authorEmail?: string
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

// ── ドキュメント / Q&A ──

export type DocKind = 'guide' | 'qa'

export interface DocCategory {
  id: number
  kind: DocKind
  name: string
  slug: string
  parent: number | null
  order: number
  icon: string
  /** kind='guide' の場合のみ意味あり */
  articleCount?: number
  /** kind='qa' の場合のみ意味あり */
  questionCount?: number
}

export interface GuideArticle {
  id: string
  categoryId: number
  categorySlug: string
  categoryName: string
  title: string
  slug: string
  body: string
  order: number
  author: string
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export interface Answer {
  id: string
  questionId: string
  body: string
  author: string
  isAccepted: boolean
  createdAt: string
  updatedAt: string
}

export interface Question {
  id: string
  categoryId: number | null
  categorySlug: string | null
  categoryName: string | null
  title: string
  body: string
  tags: string[]
  asker: string
  isResolved: boolean
  viewCount: number
  answerCount: number
  answers?: Answer[]
  createdAt: string
  updatedAt: string
}

// ── フォーラム（2ch 風スレッド掲示板） ──

export type ForumCategory = 'idea' | 'discussion' | 'share' | 'other'

/** フォーラムのレス1件（スレ本文は number=1 として仮想的に扱う） */
export interface ForumPost {
  id: string
  threadId: string
  /** スレッド内のレス番号（>>N の N）。スレ本文は 1 */
  number: number
  body: string
  /** 表示名。空欄投稿ならスレッド毎の「名無し」表記、@付きなら固定ハンドル */
  displayName: string
  /** 固定ハンドル（@付き）で名乗っているか */
  isHandle: boolean
  /** 2ch 風の匿名ID（日付+ユーザー+スレで決まる 8桁 base62） */
  posterId: string
  /** 編集/削除できるか（サーバ判定。投稿者本人 or 管理者） */
  canEdit: boolean
  /** 自分の投稿か */
  isMine: boolean
  createdAt: string
  updatedAt: string
}

export interface ForumThread {
  id: string
  title: string
  body: string
  category: ForumCategory
  tags: string[]
  /** 表示名（名無し表記 or 名乗った名前 / 固定ハンドル） */
  displayName: string
  isHandle: boolean
  posterId: string
  /** このスレッドで使われる「名無し」表記 */
  anonName: string
  canEdit: boolean
  isMine: boolean
  isPinned: boolean
  isClosed: boolean
  viewCount: number
  postCount: number
  voteCount: number
  votedByMe: boolean
  /** 詳細取得時のみ入る */
  posts?: ForumPost[]
  lastPostedAt: string | null
  createdAt: string
  updatedAt: string
}

// ── テーマ / アイデア（進行中の取り組みの管理） ──

/** テーマの状態。「停滞」は保存値ではなく派生値なのでここには含めない。 */
export type ThemeStatus =
  | 'recruiting' // 仲間募集中
  | 'active' // 着手中
  | 'frozen' // 凍結（課題により中断）
  | 'done' // 完了
  | 'merged' // 別テーマへ統合済み

export type ThemeEntryKind = 'progress' | 'comment' | 'system'

export type ThemeMemberRole = 'owner' | 'member'

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected'

export type IdeaStatus = 'open' | 'adopted' | 'declined'

/** テーマのタイムライン1件（進捗・コメント・システム記録） */
export interface ThemeEntry {
  id: string
  themeId: string
  kind: ThemeEntryKind
  body: string
  /** 進捗率（0-100、任意） */
  progressPercent?: number | null
  /** 投稿時点のステータス。後から読んでも文脈が失われないように残す */
  statusAtPost: string
  /** システム記録の場合は null */
  author: string | null
  authorId: number | null
  canEdit: boolean
  createdAt: string
  updatedAt: string
}

export interface ThemeMember {
  id: number
  userId: number
  name: string
  role: ThemeMemberRole
  joinedAt: string
}

export interface ThemeJoinRequest {
  id: string
  themeId: string
  userId: number
  userName: string
  message: string
  status: JoinRequestStatus
  decidedBy: string | null
  decidedAt: string | null
  createdAt: string
}

export interface Theme {
  id: string
  title: string
  summary: string
  body: string
  status: ThemeStatus
  tags: string[]
  workCategories: string[]
  owner: string
  ownerId: number

  /** 凍結理由。再開しても消さない（なぜ一度止まったかは残す価値がある） */
  freezeReason: string
  frozenAt: string | null

  /** 完了時の成果物（ツールカタログ） */
  resultingTool: string | null
  resultingToolTitle: string | null

  /** 合流先（このテーマが吸収された場合） */
  mergedInto: string | null
  mergedIntoTitle: string | null
  mergedAt: string | null

  /** 昇格元のアイデア */
  originIdea: string | null
  originIdeaTitle: string | null

  lastProgressAt: string | null
  daysSinceProgress: number | null
  /** 一定期間進捗が無い「着手中/仲間募集中」か。サーバ側の派生値 */
  isStalled: boolean
  /** 停滞と見なすまでの日数（サーバ設定） */
  stalledAfterDays: number

  memberCount: number
  entryCount: number
  latestProgress: string | null
  latestProgressPercent: number | null

  isMember: boolean
  canEdit: boolean
  myJoinRequestStatus: JoinRequestStatus | null
  /** 承認待ちの件数（発起人にのみ意味がある） */
  pendingJoinCount: number

  /** 詳細取得時のみ入る */
  members?: ThemeMember[]
  entries?: ThemeEntry[]

  viewCount: number
  createdAt: string
  updatedAt: string
}

export interface IdeaComment {
  id: string
  ideaId: string
  author: string
  body: string
  canEdit: boolean
  createdAt: string
  updatedAt: string
}

export interface Idea {
  id: string
  title: string
  body: string
  tags: string[]
  workCategories: string[]
  status: IdeaStatus
  author: string
  authorId: number
  promotedTheme: string | null
  promotedThemeTitle: string | null
  voteCount: number
  votedByMe: boolean
  commentCount: number
  /** 詳細取得時のみ入る */
  comments?: IdeaComment[]
  canEdit: boolean
  createdAt: string
  updatedAt: string
}

/** 部門としての「いま何が動いているか」 */
export interface ThemeSummary {
  total: number
  byStatus: Record<ThemeStatus, number>
  stalled: number
  stalledAfterDays: number
  ideaOpen: number
  frozenReasons: {
    id: string
    title: string
    reason: string
    owner: string
    frozenAt: string | null
  }[]
}
