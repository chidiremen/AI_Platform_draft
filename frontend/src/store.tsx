import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Tool } from './types'
import { MOCK_TOOLS } from './data/tools'
import { MOCK_USERS, type Role, type User } from './data/users'

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
}

interface AppState {
  // 認証
  currentUser: User | null
  login: (loginId: string, password: string) => boolean
  logout: () => void
  // ユーザー管理（管理者）
  users: User[]
  addUser: (u: User) => { ok: boolean; error?: string }
  updateUserRole: (loginId: string, role: Role) => void
  // ツール
  tools: Tool[]
  addTool: (input: NewToolInput) => string
  updateTool: (id: string, input: NewToolInput) => void
  deleteTool: (id: string) => void
  // アクション
  likedIds: Set<string>
  requests: AccessRequestRecord[]
  toggleLike: (toolId: string) => void
  submitRequest: (tool: Tool, reason: string) => void
  recordDownload: (toolId: string) => void
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>(MOCK_USERS)
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadSession(MOCK_USERS))
  const [tools, setTools] = useState<Tool[]>(MOCK_TOOLS)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [requests, setRequests] = useState<AccessRequestRecord[]>([
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
  ])
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    window.setTimeout(() => setToastMsg(null), 2600)
  }, [])

  // ── 認証 ──
  const login = useCallback(
    (loginId: string, password: string) => {
      const u = users.find((x) => x.loginId === loginId && x.password === password)
      if (!u) return false
      setCurrentUser(u)
      try {
        localStorage.setItem(SESSION_KEY, u.loginId)
      } catch {
        /* ignore */
      }
      return true
    },
    [users],
  )

  const logout = useCallback(() => {
    setCurrentUser(null)
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  // ── ユーザー管理 ──
  const addUser = useCallback(
    (u: User) => {
      if (users.some((x) => x.loginId === u.loginId)) {
        return { ok: false, error: 'このログインIDは既に使われています' }
      }
      setUsers((prev) => [...prev, u])
      toast(`👤 ユーザー「${u.name}」を登録しました`)
      return { ok: true }
    },
    [users, toast],
  )

  const updateUserRole = useCallback(
    (loginId: string, role: Role) => {
      setUsers((prev) => prev.map((u) => (u.loginId === loginId ? { ...u, role } : u)))
      // ログイン中ユーザー自身のロールが変わった場合は反映
      setCurrentUser((cu) => (cu && cu.loginId === loginId ? { ...cu, role } : cu))
    },
    [],
  )

  // ── 権限 ──
  const canEdit = useCallback(
    (tool: Tool) =>
      !!currentUser && (currentUser.role === 'admin' || tool.author === currentUser.name),
    [currentUser],
  )

  // ── ツール CRUD ──
  const addTool = useCallback(
    (input: NewToolInput) => {
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
    (id: string, input: NewToolInput) => {
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
    (id: string) => {
      setTools((prev) => prev.filter((t) => t.id !== id))
      toast('🗑️ ツールを削除しました')
    },
    [toast],
  )

  // ── いいね ──
  const toggleLike = useCallback(
    (toolId: string) => {
      setLikedIds((prev) => {
        const liked = prev.has(toolId)
        const next = new Set(prev)
        if (liked) next.delete(toolId)
        else next.add(toolId)
        return next
      })
      setTools((ts) =>
        ts.map((t) => {
          if (t.id !== toolId) return t
          const delta = likedIds.has(toolId) ? -1 : 1
          return { ...t, likes: t.likes + delta }
        }),
      )
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
      toast('📬 アクセス権申請を送信しました（登録者へTeams通知）')
    },
    [currentUser, toast],
  )

  const recordDownload = useCallback(
    (toolId: string) => {
      setTools((ts) =>
        ts.map((t) => (t.id === toolId ? { ...t, downloads: (t.downloads ?? 0) + 1 } : t)),
      )
      toast('📥 ダウンロードを開始しました（デモ）')
    },
    [toast],
  )

  const value = useMemo<AppState>(
    () => ({
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
      canEdit,
      toast,
    }),
    [
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
