import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { CommentType, Tool, ToolComment } from './types'
import { MOCK_TOOLS } from './data/tools'
import { MOCK_USERS, isAdminRole, type Role, type User } from './data/users'
import { USE_MOCK } from './config'
import * as api from './api'

const SESSION_KEY = 'aitc_session'

export interface AccessRequestRecord {
  id: string
  toolId: string
  toolTitle: string
  requester: string
  author: string
  reason: string
  status: 'pending' | 'granted' | 'rejected'
  createdAt: string
}

export interface NewToolInput {
  title: string
  summary: string
  readme: string
  toolType: Tool['toolType']
  accessUrl?: string
  tags: string[]
  aspiceProcesses: string[]
  workCategories: string[]
  forkedFrom?: string
  effectQualitative?: string
  effectHoursPerMonth?: number | null
  /** zipファイル（ある場合 multipart 送信） */
  zipFile?: File | null
  /** 新規追加するスクリーンショット（複数） */
  newScreenshots?: File[]
}

interface AppState {
  // データソース状態
  mode: 'mock' | 'api'
  loading: boolean
  // 認証
  currentUser: User | null
  login: (loginId: string, password: string) => Promise<boolean>
  logout: () => void
  // ユーザー管理（管理者）
  users: User[]
  addUser: (u: User) => Promise<{ ok: boolean; error?: string }>
  updateUserRole: (loginId: string, role: Role) => void
  updateUser: (
    loginId: string,
    patch: { name?: string; email?: string; role?: Role; password?: string },
  ) => Promise<{ ok: boolean; error?: string }>
  deleteUser: (loginId: string) => Promise<{ ok: boolean; error?: string }>
  // 自分のプロフィール
  updateMyProfile: (patch: {
    name?: string
    email?: string
  }) => Promise<{ ok: boolean; error?: string }>
  changeMyPassword: (
    oldPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>
  // ツール
  tools: Tool[]
  addTool: (input: NewToolInput) => Promise<string>
  updateTool: (id: string, input: NewToolInput) => Promise<void>
  deleteTool: (id: string) => Promise<void>
  // アクション
  likedIds: Set<string>
  requests: AccessRequestRecord[]
  toggleLike: (toolId: string) => void
  submitRequest: (tool: Tool, reason: string) => void
  /** zipダウンロード（モック=カウント増、API=実ダウンロード+カウント） */
  recordDownload: (tool: Tool) => void
  /** ファネル計測（impression/view/readme_scroll）。セッション内で重複排除。 */
  recordActivity: (toolId: string, action: 'impression' | 'view' | 'readme_scroll') => void
  /** 申請の承認/却下（登録者本人または管理者）。 */
  resolveRequest: (requestId: string, status: 'granted' | 'rejected') => Promise<void>
  /** 解決済み申請を履歴から削除（申請者・登録者・管理者）。 */
  deleteRequest: (requestId: string) => Promise<{ ok: boolean; error?: string }>
  /** 自分のツールに付いた他人のコメント（マイページの通知用）。 */
  incomingComments: ToolComment[]
  /** 既読化された通知（コメントID / 申請ID）。localStorage に永続化。 */
  readNotificationIds: Set<string>
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  // コメント
  getComments: (toolId: string) => ToolComment[]
  loadComments: (toolId: string) => Promise<void>
  addComment: (
    toolId: string,
    input: { body: string; commentType: CommentType; parent?: string | null },
  ) => Promise<void>
  removeComment: (commentId: string) => Promise<void>
  toggleCommentLike: (commentId: string) => Promise<void>
  // 権限ヘルパ
  canEdit: (tool: Tool) => boolean
  canDeleteComment: (comment: ToolComment) => boolean
  toast: (msg: string) => void
}

const Ctx = createContext<AppState | null>(null)

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function loadSession(users: User[]): User | null {
  try {
    const id = localStorage.getItem(SESSION_KEY)
    if (!id) return null
    return users.find((u) => u.loginId === id) ?? null
  } catch {
    return null
  }
}

const SEED_COMMENTS: ToolComment[] = [
  {
    id: 'c1',
    toolId: '1',
    author: '鈴木花子',
    body: 'CSV取り込み時に文字コードSJISだとエラーになります。UTF-8だと問題ありません。',
    commentType: 'bug',
    parent: null,
    createdAt: '2026-06-18T09:30:00Z',
    likeCount: 3,
    likedByMe: false,
  },
  {
    id: 'c2',
    toolId: '1',
    author: '田中太郎',
    body: '報告ありがとうございます。次のリリースでSJIS自動判別を入れる予定です。',
    commentType: 'general',
    parent: 'c1',
    createdAt: '2026-06-18T11:00:00Z',
    likeCount: 1,
    likedByMe: false,
  },
  {
    id: 'c3',
    toolId: '1',
    author: '佐藤一郎',
    body: '出力フォーマットにJSONも対応してほしいです。',
    commentType: 'feature',
    parent: null,
    createdAt: '2026-06-20T15:10:00Z',
    likeCount: 5,
    likedByMe: false,
  },
]

const SEED_REQUESTS: AccessRequestRecord[] = [
  {
    id: 'r0',
    toolId: '3',
    toolTitle: 'MISRA-C準拠コードレビューアシスタント',
    requester: '田中太郎',
    author: '佐藤一郎',
    reason: '担当ECUのコードレビュー自動化に利用したいため',
    status: 'granted',
    createdAt: '2026-06-05',
  },
  // tool 1 (田中太郎 = 管理者) への保留中の申請。マイページ「被申請一覧」で
  // 承認/却下フローを動かすために初期投入する。
  {
    id: 'r1',
    toolId: '1',
    toolTitle: 'A-SPICE要件トレーサビリティチェッカー',
    requester: '鈴木花子',
    author: '田中太郎',
    reason: '要件レビュー会の準備に使いたい',
    status: 'pending',
    createdAt: '2026-06-12',
  },
]

// ── モックモードの永続化キー ──
// 実APIモードでは常にサーバから取得するため使用しない。モックデモを開いたまま
// ブラウザを再読み込みしても、ユーザー生成データ（コメント・申請・いいね・
// 編集済みツール）を失わないようにする。
const MOCK_KEYS = {
  tools: 'aitc_mock_tools_v1',
  comments: 'aitc_mock_comments_v1',
  requests: 'aitc_mock_requests_v1',
  likes: 'aitc_mock_likes_v1',
} as const

function loadPersisted<T>(key: string, fallback: T): T {
  if (!USE_MOCK) return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
function savePersisted(key: string, value: unknown) {
  if (!USE_MOCK) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota exceeded, private mode, etc. */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>(USE_MOCK ? MOCK_USERS : [])
  const [currentUser, setCurrentUser] = useState<User | null>(
    USE_MOCK ? loadSession(MOCK_USERS) : null,
  )
  const [tools, setTools] = useState<Tool[]>(
    USE_MOCK ? loadPersisted<Tool[]>(MOCK_KEYS.tools, MOCK_TOOLS) : [],
  )
  const [likedIds, setLikedIds] = useState<Set<string>>(
    () => new Set(loadPersisted<string[]>(MOCK_KEYS.likes, [])),
  )
  const [requests, setRequests] = useState<AccessRequestRecord[]>(
    USE_MOCK ? loadPersisted<AccessRequestRecord[]>(MOCK_KEYS.requests, SEED_REQUESTS) : [],
  )
  const [comments, setComments] = useState<ToolComment[]>(
    USE_MOCK ? loadPersisted<ToolComment[]>(MOCK_KEYS.comments, SEED_COMMENTS) : [],
  )
  // 自分のツールに付いた他人のコメント（マイページ通知用）
  const [incomingComments, setIncomingComments] = useState<ToolComment[]>([])
  // API モードで「すでにフェッチ済みの toolId」を覚えておき、再描画ごとに
  // 再取得しないようにする。
  const commentsLoaded = useRef<Set<string>>(new Set())
  // 既読化された通知IDセット（localStorage 永続化）
  const READ_KEY = 'aitc_read_notif_v1'
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(
    () => {
      try {
        const raw = localStorage.getItem(READ_KEY)
        if (!raw) return new Set()
        return new Set(JSON.parse(raw) as string[])
      } catch {
        return new Set()
      }
    },
  )
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(!USE_MOCK)
  // ファネル計測の重複排除（action:toolId をセッション内で一度だけ計上）
  const activitySeen = useRef<Set<string>>(new Set())

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    window.setTimeout(() => setToastMsg(null), 2600)
  }, [])

  // ── 実APIモード: ログインユーザーに紐づくデータをまとめて取得 ──
  const hydrate = useCallback(async (me: User | null) => {
    const list = await api.listTools()
    setTools(list)
    if (me) {
      const [likes, reqs, incoming, incomingCmts] = await Promise.all([
        api.myLikes(),
        api.myRequests(),
        api.incomingRequests(me.name),
        api.listIncomingComments().catch(() => [] as ToolComment[]),
      ])
      setLikedIds(new Set(likes.map((t) => t.id)))
      const byId = new Map<string, AccessRequestRecord>()
      for (const r of reqs) byId.set(r.id, r)
      for (const r of incoming) byId.set(r.id, r) // author 入りで上書き
      setRequests([...byId.values()])
      setIncomingComments(incomingCmts)
      if (isAdminRole(me.role)) {
        try {
          setUsers(await api.listUsers())
        } catch {
          /* 管理者でなければ無視 */
        }
      }
    } else {
      setLikedIds(new Set())
      setRequests([])
      setIncomingComments([])
    }
  }, [])

  // モックモード: 各状態を localStorage に永続化してリロード耐性を持たせる
  useEffect(() => { savePersisted(MOCK_KEYS.tools, tools) }, [tools])
  useEffect(() => { savePersisted(MOCK_KEYS.comments, comments) }, [comments])
  useEffect(() => { savePersisted(MOCK_KEYS.requests, requests) }, [requests])
  useEffect(() => {
    savePersisted(MOCK_KEYS.likes, [...likedIds])
  }, [likedIds])

  // モックモード: 自分のツールに付いた他人のコメントを comments から導出
  useEffect(() => {
    if (!USE_MOCK) return
    if (!currentUser) {
      setIncomingComments([])
      return
    }
    const myToolIds = new Set(
      tools.filter((t) => t.author === currentUser.name).map((t) => t.id),
    )
    const incoming = comments.filter(
      (c) => myToolIds.has(c.toolId) && c.author !== currentUser.name,
    )
    // 新しい順
    incoming.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    setIncomingComments(incoming)
  }, [currentUser, tools, comments])

  // 実APIモードの初期ロード（セッション復元＋データ取得）
  useEffect(() => {
    if (USE_MOCK) return
    let active = true
    ;(async () => {
      try {
        const me = await api.getMe()
        if (!active) return
        setCurrentUser(me)
        await hydrate(me)
      } catch {
        /* 取得失敗時は未ログイン扱い */
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [hydrate])

  // ── 認証 ──
  const login = useCallback(
    async (loginId: string, password: string) => {
      if (USE_MOCK) {
        const u = users.find((x) => x.loginId === loginId && x.password === password)
        if (!u) return false
        setCurrentUser(u)
        try {
          localStorage.setItem(SESSION_KEY, u.loginId)
        } catch {
          /* ignore */
        }
        return true
      }
      try {
        const u = await api.login(loginId, password)
        setCurrentUser(u)
        await hydrate(u)
        return true
      } catch {
        return false
      }
    },
    [users, hydrate],
  )

  const logout = useCallback(() => {
    setCurrentUser(null)
    if (USE_MOCK) {
      try {
        localStorage.removeItem(SESSION_KEY)
      } catch {
        /* ignore */
      }
    } else {
      setLikedIds(new Set())
      setRequests([])
      void api.logout()
    }
  }, [])

  // ── ユーザー管理 ──
  const addUser = useCallback(
    async (u: User) => {
      if (users.some((x) => x.loginId === u.loginId)) {
        return { ok: false, error: 'このログインIDは既に使われています' }
      }
      if (USE_MOCK) {
        setUsers((prev) => [...prev, u])
      } else {
        try {
          const created = await api.createUser({
            loginId: u.loginId,
            name: u.name,
            password: u.password ?? '',
            role: u.role,
            email: u.email,
          })
          setUsers((prev) => [...prev, created])
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : '登録に失敗しました' }
        }
      }
      toast(`👤 ユーザー「${u.name}」を登録しました`)
      return { ok: true }
    },
    [users, toast],
  )

  const updateUserRole = useCallback(
    (loginId: string, role: Role) => {
      const target = users.find((u) => u.loginId === loginId)
      setUsers((prev) => prev.map((u) => (u.loginId === loginId ? { ...u, role } : u)))
      setCurrentUser((cu) => (cu && cu.loginId === loginId ? { ...cu, role } : cu))
      if (!USE_MOCK && target?.id != null) {
        void api.updateUserRole(target.id, role)
      }
    },
    [users],
  )

  const updateUser = useCallback(
    async (
      loginId: string,
      patch: { name?: string; email?: string; role?: Role; password?: string },
    ) => {
      const target = users.find((u) => u.loginId === loginId)
      if (!target) return { ok: false, error: 'ユーザーが見つかりません' }
      if (!USE_MOCK) {
        if (target.id == null) {
          return { ok: false, error: 'ユーザーIDが不明です' }
        }
        try {
          const updated = await api.updateUserByAdmin(target.id, patch)
          setUsers((prev) => prev.map((u) => (u.loginId === loginId ? updated : u)))
          setCurrentUser((cu) =>
            cu && cu.loginId === loginId ? { ...cu, ...updated } : cu,
          )
          toast(`✏️ ユーザー「${updated.name}」を更新しました`)
          return { ok: true }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : '更新に失敗しました' }
        }
      }
      // モック: 表示名/メール/ロール/PWを更新
      setUsers((prev) =>
        prev.map((u) =>
          u.loginId === loginId
            ? {
                ...u,
                name: patch.name ?? u.name,
                email: patch.email ?? u.email,
                role: patch.role ?? u.role,
                password: patch.password ?? u.password,
              }
            : u,
        ),
      )
      setCurrentUser((cu) =>
        cu && cu.loginId === loginId
          ? {
              ...cu,
              name: patch.name ?? cu.name,
              email: patch.email ?? cu.email,
              role: patch.role ?? cu.role,
            }
          : cu,
      )
      // モックではツールのauthor名（表示名）も同期して書き換える
      if (patch.name && patch.name !== target.name) {
        const newName = patch.name
        setTools((prev) =>
          prev.map((t) => (t.author === target.name ? { ...t, author: newName } : t)),
        )
      }
      toast(`✏️ ユーザー「${patch.name ?? target.name}」を更新しました`)
      return { ok: true }
    },
    [users, toast],
  )

  const deleteUser = useCallback(
    async (loginId: string) => {
      const target = users.find((u) => u.loginId === loginId)
      if (!target) return { ok: false, error: 'ユーザーが見つかりません' }
      if (currentUser && target.loginId === currentUser.loginId) {
        return { ok: false, error: '自分自身は削除できません' }
      }
      if (!USE_MOCK) {
        if (target.id == null) {
          return { ok: false, error: 'ユーザーIDが不明です' }
        }
        try {
          await api.deleteUserByAdmin(target.id)
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : '削除に失敗しました' }
        }
      }
      setUsers((prev) => prev.filter((u) => u.loginId !== loginId))
      toast(`🗑️ ユーザー「${target.name}」を削除しました`)
      return { ok: true }
    },
    [users, currentUser, toast],
  )

  const updateMyProfile = useCallback(
    async (patch: { name?: string; email?: string }) => {
      if (!currentUser) return { ok: false, error: '未ログインです' }
      const oldName = currentUser.name
      if (!USE_MOCK) {
        try {
          const updated = await api.updateMe(patch)
          setCurrentUser(updated)
          setUsers((prev) =>
            prev.map((u) => (u.loginId === currentUser.loginId ? updated : u)),
          )
          toast('✅ プロフィールを更新しました')
          return { ok: true }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : '更新に失敗しました' }
        }
      }
      setCurrentUser((cu) =>
        cu ? { ...cu, name: patch.name ?? cu.name, email: patch.email ?? cu.email } : cu,
      )
      setUsers((prev) =>
        prev.map((u) =>
          u.loginId === currentUser.loginId
            ? { ...u, name: patch.name ?? u.name, email: patch.email ?? u.email }
            : u,
        ),
      )
      if (patch.name && patch.name !== oldName) {
        const newName = patch.name
        setTools((prev) =>
          prev.map((t) => (t.author === oldName ? { ...t, author: newName } : t)),
        )
      }
      toast('✅ プロフィールを更新しました')
      return { ok: true }
    },
    [currentUser, toast],
  )

  const changeMyPassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      if (!currentUser) return { ok: false, error: '未ログインです' }
      if (!USE_MOCK) {
        try {
          await api.changePassword(oldPassword, newPassword)
          // 既存トークンは無効化されたので、ローカルセッションも破棄
          setCurrentUser(null)
          toast('🔐 パスワードを更新しました。再ログインしてください。')
          return { ok: true }
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : '変更に失敗しました' }
        }
      }
      // モック: 旧PW検証 → 更新
      if (currentUser.password !== oldPassword) {
        return { ok: false, error: '現在のパスワードが正しくありません' }
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.loginId === currentUser.loginId ? { ...u, password: newPassword } : u,
        ),
      )
      setCurrentUser((cu) => (cu ? { ...cu, password: newPassword } : cu))
      toast('🔐 パスワードを更新しました')
      return { ok: true }
    },
    [currentUser, toast],
  )

  // ── 権限 ──
  const canEdit = useCallback(
    (tool: Tool) =>
      !!currentUser && (isAdminRole(currentUser.role) || tool.author === currentUser.name),
    [currentUser],
  )

  // ── ツール CRUD ──
  const addTool = useCallback(
    async (input: NewToolInput) => {
      if (!USE_MOCK) {
        const created = await api.createTool(input)
        setTools((prev) => [created, ...prev])
        toast('✅ ツールを登録しました')
        return created.id
      }
      const id = `t${Date.now()}`
      const newTool: Tool = {
        id,
        title: input.title,
        summary: input.summary,
        readme: input.readme,
        toolType: input.toolType,
        aspiceProcesses: input.aspiceProcesses,
        workCategories: input.workCategories,
        tags: input.tags,
        accessUrl: input.accessUrl,
        forkedFrom: input.forkedFrom,
        effectQualitative: input.effectQualitative || undefined,
        effectHoursPerMonth: input.effectHoursPerMonth ?? undefined,
        author: currentUser?.name ?? '不明',
        createdAt: todayISO(),
        likes: 0,
        views: 0,
        impressions: 0,
        accessRequests: 0,
        downloads: input.toolType === 'zip_upload' ? 0 : undefined,
      }
      setTools((prev) => [newTool, ...prev])
      toast('✅ ツールを登録しました')
      return id
    },
    [currentUser, toast],
  )

  const updateTool = useCallback(
    async (id: string, input: NewToolInput) => {
      if (!USE_MOCK) {
        const updated = await api.updateTool(id, input)
        setTools((prev) => prev.map((t) => (t.id === id ? updated : t)))
        toast('💾 ツールを更新しました')
        return
      }
      setTools((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                title: input.title,
                summary: input.summary,
                readme: input.readme,
                toolType: input.toolType,
                aspiceProcesses: input.aspiceProcesses,
                workCategories: input.workCategories,
                tags: input.tags,
                accessUrl: input.accessUrl,
                effectQualitative: input.effectQualitative || undefined,
                effectHoursPerMonth: input.effectHoursPerMonth ?? undefined,
                updatedAt: todayISO(),
              }
            : t,
        ),
      )
      toast('💾 ツールを更新しました')
    },
    [toast],
  )

  const deleteTool = useCallback(
    async (id: string) => {
      if (!USE_MOCK) {
        await api.deleteTool(id)
      }
      setTools((prev) => prev.filter((t) => t.id !== id))
      toast('🗑️ ツールを削除しました')
    },
    [toast],
  )

  // ── いいね ──
  const toggleLike = useCallback(
    (toolId: string) => {
      const wasLiked = likedIds.has(toolId)
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (wasLiked) next.delete(toolId)
        else next.add(toolId)
        return next
      })
      setTools((ts) =>
        ts.map((t) =>
          t.id === toolId ? { ...t, likes: t.likes + (wasLiked ? -1 : 1) } : t,
        ),
      )
      if (!USE_MOCK) {
        api
          .toggleLike(toolId)
          .then(({ likeCount }) =>
            setTools((ts) => ts.map((t) => (t.id === toolId ? { ...t, likes: likeCount } : t))),
          )
          .catch(() => {
            /* 失敗時は楽観更新のまま */
          })
      }
    },
    [likedIds],
  )

  const submitRequest = useCallback(
    (tool: Tool, reason: string) => {
      const rec: AccessRequestRecord = {
        id: `r${Date.now()}`,
        toolId: tool.id,
        toolTitle: tool.title,
        requester: currentUser?.name ?? '不明',
        author: tool.author,
        reason,
        status: 'pending',
        createdAt: todayISO(),
      }
      setRequests((prev) => [rec, ...prev])
      setTools((ts) =>
        ts.map((t) =>
          t.id === tool.id ? { ...t, accessRequests: (t.accessRequests ?? 0) + 1 } : t,
        ),
      )
      if (!USE_MOCK) {
        // 楽観追加した rec.id (フェイク `r${Date.now()}`) を、サーバ採番の
        // 実 UUID に置き換える。これをやらないと後段の resolve が 404 になる。
        api
          .requestAccess(tool.id, reason)
          .then((created) => {
            setRequests((prev) =>
              prev.map((r) => (r.id === rec.id ? { ...r, id: created.id } : r)),
            )
          })
          .catch((e) => {
            // 失敗時は楽観追加を取り消す
            setRequests((prev) => prev.filter((r) => r.id !== rec.id))
            setTools((ts) =>
              ts.map((t) =>
                t.id === tool.id
                  ? { ...t, accessRequests: Math.max(0, (t.accessRequests ?? 1) - 1) }
                  : t,
              ),
            )
            toast(`⚠️ 申請の送信に失敗しました: ${e instanceof Error ? e.message : ''}`)
          })
      }
      toast('📬 アクセス権申請を送信しました（登録者へTeams通知）')
    },
    [currentUser, toast],
  )

  const recordDownload = useCallback(
    (tool: Tool) => {
      setTools((ts) =>
        ts.map((t) => (t.id === tool.id ? { ...t, downloads: (t.downloads ?? 0) + 1 } : t)),
      )
      if (!USE_MOCK) {
        const filename = tool.zipFileName || `${tool.title}.zip`
        api
          .downloadZip(tool.id, filename)
          .then(() => api.postActivity([{ tool: tool.id, action: 'download' }]))
          .catch((e) =>
            toast(`📥 ダウンロードに失敗しました: ${e instanceof Error ? e.message : ''}`),
          )
      } else {
        toast('📥 ダウンロードを開始しました（デモ）')
      }
    },
    [toast],
  )

  // ── アクセス権申請の承認/却下 ──
  const resolveRequest = useCallback(
    async (requestId: string, status: 'granted' | 'rejected') => {
      try {
        if (!USE_MOCK) await api.resolveAccessRequest(requestId, status)
        setRequests((prev) =>
          prev.map((r) => (r.id === requestId ? { ...r, status } : r)),
        )
        toast(status === 'granted' ? '✅ 申請を承認しました' : '🚫 申請を却下しました')
      } catch (e) {
        // API失敗時に無反応（ボタンが効かないように見える）にならないよう通知する
        toast(`⚠️ 処理に失敗しました: ${e instanceof Error ? e.message : ''}`)
      }
    },
    [toast],
  )

  const deleteRequest = useCallback(
    async (requestId: string) => {
      const target = requests.find((r) => r.id === requestId)
      if (!target) return { ok: false, error: '対象の申請が見つかりません' }
      if (target.status === 'pending') {
        return { ok: false, error: '未処理の申請は削除できません' }
      }
      if (!USE_MOCK) {
        try {
          await api.deleteAccessRequest(requestId)
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : '削除に失敗しました' }
        }
      }
      setRequests((prev) => prev.filter((r) => r.id !== requestId))
      toast('🗑️ 申請履歴を削除しました')
      return { ok: true }
    },
    [requests, toast],
  )

  // ── 通知の既読管理 ──
  const persistRead = useCallback((ids: Set<string>) => {
    try {
      localStorage.setItem(READ_KEY, JSON.stringify([...ids]))
    } catch {
      /* ignore */
    }
  }, [])

  const markNotificationRead = useCallback(
    (id: string) => {
      setReadNotificationIds((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        persistRead(next)
        return next
      })
    },
    [persistRead],
  )

  const markAllNotificationsRead = useCallback(() => {
    setReadNotificationIds((prev) => {
      const next = new Set(prev)
      for (const c of incomingComments) next.add(c.id)
      for (const r of requests) {
        if (r.author === (currentUser?.name ?? '') && r.status === 'pending') {
          next.add(r.id)
        }
      }
      persistRead(next)
      return next
    })
  }, [incomingComments, requests, currentUser, persistRead])

  // ── コメント ──
  const getComments = useCallback(
    (toolId: string) => comments.filter((c) => c.toolId === toolId),
    [comments],
  )

  const loadComments = useCallback(async (toolId: string) => {
    if (USE_MOCK) return // モックは初期投入済み
    if (commentsLoaded.current.has(toolId)) return
    commentsLoaded.current.add(toolId)
    try {
      const fetched = await api.listComments(toolId)
      setComments((prev) => {
        const others = prev.filter((c) => c.toolId !== toolId)
        return [...others, ...fetched]
      })
    } catch {
      // 失敗時は次回再試行可能にする
      commentsLoaded.current.delete(toolId)
    }
  }, [])

  const addComment = useCallback(
    async (
      toolId: string,
      input: { body: string; commentType: CommentType; parent?: string | null },
    ) => {
      if (!currentUser) return
      if (!USE_MOCK) {
        const created = await api.createComment(toolId, input)
        setComments((prev) => [...prev, created])
        toast('💬 コメントを投稿しました')
        return
      }
      const local: ToolComment = {
        id: `c${Date.now()}`,
        toolId,
        author: currentUser.name,
        body: input.body,
        commentType: input.commentType,
        parent: input.parent ?? null,
        createdAt: new Date().toISOString(),
        likeCount: 0,
        likedByMe: false,
      }
      setComments((prev) => [...prev, local])
      toast('💬 コメントを投稿しました')
    },
    [currentUser, toast],
  )

  const removeComment = useCallback(
    async (commentId: string) => {
      if (!USE_MOCK) {
        await api.deleteComment(commentId)
      }
      // 子コメント（replies）も連鎖削除
      setComments((prev) => {
        const toDelete = new Set<string>([commentId])
        let changed = true
        while (changed) {
          changed = false
          for (const c of prev) {
            if (c.parent && toDelete.has(c.parent) && !toDelete.has(c.id)) {
              toDelete.add(c.id)
              changed = true
            }
          }
        }
        return prev.filter((c) => !toDelete.has(c.id))
      })
      toast('🗑️ コメントを削除しました')
    },
    [toast],
  )

  const toggleCommentLike = useCallback(
    async (commentId: string) => {
      // 楽観更新
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                likedByMe: !c.likedByMe,
                likeCount: c.likedByMe ? Math.max(0, c.likeCount - 1) : c.likeCount + 1,
              }
            : c,
        ),
      )
      if (!USE_MOCK) {
        try {
          const { liked, likeCount } = await api.toggleCommentLike(commentId)
          setComments((prev) =>
            prev.map((c) =>
              c.id === commentId ? { ...c, likedByMe: liked, likeCount } : c,
            ),
          )
        } catch {
          /* 楽観のまま */
        }
      }
    },
    [],
  )

  const canDeleteComment = useCallback(
    (comment: ToolComment) =>
      !!currentUser &&
      (isAdminRole(currentUser.role) || comment.author === currentUser.name),
    [currentUser],
  )

  // ── ファネル計測（impression / view / readme_scroll）──
  const recordActivity = useCallback(
    (toolId: string, action: 'impression' | 'view' | 'readme_scroll') => {
      const key = `${action}:${toolId}`
      if (activitySeen.current.has(key)) return // セッション内で重複排除
      activitySeen.current.add(key)
      // 閲覧・インプレッションはローカルカウントも楽観更新（一覧/詳細を「ライブ」に）
      if (action === 'view' || action === 'impression') {
        setTools((ts) =>
          ts.map((t) =>
            t.id === toolId
              ? action === 'view'
                ? { ...t, views: t.views + 1 }
                : { ...t, impressions: t.impressions + 1 }
              : t,
          ),
        )
      }
      if (!USE_MOCK) void api.postActivity([{ tool: toolId, action }])
    },
    [],
  )

  const value = useMemo<AppState>(
    () => ({
      mode: USE_MOCK ? 'mock' : 'api',
      loading,
      currentUser,
      login,
      logout,
      users,
      addUser,
      updateUserRole,
      updateUser,
      deleteUser,
      updateMyProfile,
      changeMyPassword,
      tools,
      addTool,
      updateTool,
      deleteTool,
      likedIds,
      requests,
      toggleLike,
      submitRequest,
      recordDownload,
      recordActivity,
      resolveRequest,
      deleteRequest,
      incomingComments,
      readNotificationIds,
      markNotificationRead,
      markAllNotificationsRead,
      getComments,
      loadComments,
      addComment,
      removeComment,
      toggleCommentLike,
      canEdit,
      canDeleteComment,
      toast,
    }),
    [
      loading,
      currentUser,
      login,
      logout,
      users,
      addUser,
      updateUserRole,
      updateUser,
      deleteUser,
      updateMyProfile,
      changeMyPassword,
      tools,
      addTool,
      updateTool,
      deleteTool,
      likedIds,
      requests,
      toggleLike,
      submitRequest,
      recordDownload,
      recordActivity,
      resolveRequest,
      deleteRequest,
      incomingComments,
      readNotificationIds,
      markNotificationRead,
      markAllNotificationsRead,
      getComments,
      loadComments,
      addComment,
      removeComment,
      toggleCommentLike,
      canEdit,
      canDeleteComment,
      toast,
    ],
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </Ctx.Provider>
  )
}

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
