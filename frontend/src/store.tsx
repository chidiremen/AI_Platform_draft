import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Tool } from './types'
import { MOCK_TOOLS } from './data/tools'

/** デモ上のログインユーザー（モック） */
export const CURRENT_USER = '田中太郎'

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

interface AppState {
  tools: Tool[]
  likedIds: Set<string>
  requests: AccessRequestRecord[]
  toggleLike: (toolId: string) => void
  submitRequest: (tool: Tool, reason: string) => void
  toast: (msg: string) => void
}

const Ctx = createContext<AppState | null>(null)

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [tools, setTools] = useState<Tool[]>(MOCK_TOOLS)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [requests, setRequests] = useState<AccessRequestRecord[]>([
    // デモ用に初期申請を一件用意
    {
      id: 'r0',
      toolId: '3',
      toolTitle: 'MISRA-C準拠コードレビューアシスタント',
      requester: CURRENT_USER,
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

  const toggleLike = useCallback((toolId: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev)
      const liked = next.has(toolId)
      if (liked) next.delete(toolId)
      else next.add(toolId)
      setTools((ts) =>
        ts.map((t) =>
          t.id === toolId ? { ...t, likes: t.likes + (liked ? -1 : 1) } : t,
        ),
      )
      return next
    })
  }, [])

  const submitRequest = useCallback(
    (tool: Tool, reason: string) => {
      const rec: AccessRequestRecord = {
        id: `r${Date.now()}`,
        toolId: tool.id,
        toolTitle: tool.title,
        requester: CURRENT_USER,
        author: tool.author,
        reason,
        status: 'pending',
        createdAt: todayISO(),
      }
      setRequests((prev) => [rec, ...prev])
      setTools((ts) =>
        ts.map((t) =>
          t.id === tool.id
            ? { ...t, accessRequests: (t.accessRequests ?? 0) + 1 }
            : t,
        ),
      )
      toast('📬 アクセス権申請を送信しました（登録者へTeams通知）')
    },
    [toast],
  )

  const value = useMemo<AppState>(
    () => ({ tools, likedIds, requests, toggleLike, submitRequest, toast }),
    [tools, likedIds, requests, toggleLike, submitRequest, toast],
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
