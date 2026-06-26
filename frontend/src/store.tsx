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
import type { Tool } from './types'
import { MOCK_TOOLS } from './data/tools'
import { MOCK_USERS, type Role, type User } from './data/users'
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
  // 権限ヘルパ
  canEdit: (tool: Tool) => boolean
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>(USE_MOCK ? MOCK_USERS : [])
  const [currentUser, setCurrentUser] = useState<User | null>(
    USE_MOCK ? loadSession(MOCK_USERS) : null,
  )
  const [tools, setTools] = useState<Tool[]>(USE_MOCK ? MOCK_TOOLS : [])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [requests, setRequests] = useState<AccessRequestRecord[]>(
    USE_MOCK ? SEED_REQUESTS : [],
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
      const [likes, reqs, incoming] = await Promise.all([
        api.myLikes(),
        api.myRequests(),
        api.incomingRequests(me.name),
      ])
      setLikedIds(new Set(likes.map((t) => t.id)))
      const byId = new Map<string, AccessRequestRecord>()
      for (const r of reqs) byId.set(r.id, r)
      for (const r of incoming) byId.set(r.id, r) // author 入りで上書き
      setRequests([...byId.values()])
      if (me.role === 'admin') {
        try {
          setUsers(await api.listUsers())
        } catch {
          /* 管理者でなければ無視 */
        }
      }
    } else {
      setLikedIds(new Set())
      setRequests([])
    }
  }, [])

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

  // ── 権限 ──
  const canEdit = useCallback(
    (tool: Tool) =>
      !!currentUser && (currentUser.role === 'admin' || tool.author === currentUser.name),
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
      canEdit,
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
      canEdit,
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
