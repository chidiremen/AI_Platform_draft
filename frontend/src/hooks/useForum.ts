import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { USE_MOCK } from '../config'
import * as api from '../api'
import { useApp } from '../store'
import { isAdminRole } from '../data/users'
import type { ForumCategory, ForumPost, ForumThread } from '../types'
import {
  MOCK_FORUM_AUTHORS,
  MOCK_THREADS,
  anonNameForThread,
  mockPosterId,
  resolveDisplayName,
} from '../data/docs/mockForum'

const KEY = 'aitc_forum_threads_v1'

function loadPersisted(): ForumThread[] {
  if (!USE_MOCK) return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return MOCK_THREADS
    return JSON.parse(raw) as ForumThread[]
  } catch {
    return MOCK_THREADS
  }
}
function savePersisted(v: ForumThread[]) {
  if (!USE_MOCK) return
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

/**
 * 一覧レスポンスを既存 state にマージする。
 *
 * 一覧 API は各スレッドの ``posts`` を返さない（詳細のみ）。素朴に置き換えると、
 * 既に詳細取得済みのスレッドの ``posts`` が消えて「>>1 しか表示されない」状態に
 * なる（一覧 fetch と詳細 fetch が競合し、一覧が後に着いたときに発生。
 * ページを F5 すると両方同時に走るため高確率で踏む）。
 * そこで:
 *   - 受信側に posts が無ければ、既存の posts を引き継ぐ
 *   - 一覧に含まれないが詳細取得済みのスレッドは捨てずに残す
 *     （一覧はページネーションされるため、直リンクで開いたスレが消えないように）
 */
export function mergeThreadList(
  prev: ForumThread[],
  incoming: ForumThread[],
): ForumThread[] {
  const prevById = new Map(prev.map((t) => [t.id, t]))
  const incomingIds = new Set(incoming.map((t) => t.id))
  const merged = incoming.map((t) => {
    const old = prevById.get(t.id)
    return t.posts === undefined && old?.posts !== undefined
      ? { ...t, posts: old.posts }
      : t
  })
  const keep = prev.filter(
    (t) => !incomingIds.has(t.id) && t.posts !== undefined,
  )
  return [...merged, ...keep]
}

export const FORUM_CATEGORIES: { value: ForumCategory; label: string; icon: string }[] = [
  { value: 'idea', label: 'ほしいツール', icon: '💡' },
  { value: 'discussion', label: '相談・議論', icon: '🗣️' },
  { value: 'share', label: '事例共有', icon: '📣' },
  { value: 'other', label: '雑談', icon: '💬' },
]

export const FORUM_CATEGORY_MAP = Object.fromEntries(
  FORUM_CATEGORIES.map((c) => [c.value, c]),
) as Record<ForumCategory, { value: ForumCategory; label: string; icon: string }>

/**
 * フォーラムのストア本体。mock は localStorage、実API は fetch。
 *
 * ⚠️ 直接呼ばないこと。この hook は state を「生成」するため、複数箇所から
 * 呼ぶとコンポーネントごとに別インスタンスになり、一覧側と詳細側で状態が
 * 食い違う（詳細で取得したレスが一覧側の state に入らず消える）。
 * 利用側は必ず Context 経由の {@link useForumStore} を使う。
 */
function useForumStoreState() {
  const { currentUser, toast } = useApp()
  const isAdmin = isAdminRole(currentUser?.role)
  const [threads, setThreads] = useState<ForumThread[]>(() => loadPersisted())
  const [loading, setLoading] = useState<boolean>(!USE_MOCK)

  useEffect(() => savePersisted(threads), [threads])

  useEffect(() => {
    if (USE_MOCK) return
    if (!currentUser) return
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const list = await api.listThreads()
        // 置き換えではなくマージ（詳細取得済みの posts を消さない）
        if (active) setThreads((prev) => mergeThreadList(prev, list))
      } catch (e) {
        toast?.(`フォーラム取得失敗: ${e instanceof Error ? e.message : ''}`)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [currentUser, toast])

  /** 詳細（レス含む）を取得してストアへ反映。実APIモードのみ意味を持つ。 */
  const loadThread = useCallback(async (id: string) => {
    if (USE_MOCK) return
    try {
      const t = await api.getThread(id)
      setThreads((prev) => {
        const found = prev.some((x) => x.id === id)
        return found ? prev.map((x) => (x.id === id ? t : x)) : [t, ...prev]
      })
    } catch {
      /* ignore */
    }
  }, [])

  const addThread = useCallback(
    async (input: {
      title: string
      body: string
      category: ForumCategory
      tags: string[]
      /** 名乗る名前。空欄なら名無し、@付きなら固定ハンドル */
      posterName?: string
    }): Promise<string> => {
      if (!USE_MOCK) {
        const t = await api.createThread({
          title: input.title,
          body: input.body,
          category: input.category,
          tags: input.tags.join(','),
          posterName: input.posterName ?? '',
        })
        setThreads((prev) => [t, ...prev])
        toast?.('🧵 スレッドを立てました')
        return t.id
      }
      const id = `t${Date.now()}`
      const now = new Date().toISOString()
      const author = currentUser?.name ?? '名無しさん'
      const posterName = (input.posterName ?? '').trim()
      // 実体は UI に載せず、特定用のマップにだけ記録する（API モードと同じ扱い）
      MOCK_FORUM_AUTHORS[id] = author
      const t: ForumThread = {
        id,
        title: input.title,
        body: input.body,
        category: input.category,
        tags: input.tags,
        displayName: resolveDisplayName(posterName, id),
        isHandle: posterName.startsWith('@'),
        posterId: mockPosterId(author, id, now.slice(0, 10)),
        anonName: anonNameForThread(id),
        canEdit: true,
        isMine: true,
        isPinned: false,
        isClosed: false,
        viewCount: 0,
        postCount: 0,
        voteCount: 0,
        votedByMe: false,
        posts: [],
        lastPostedAt: null,
        createdAt: now,
        updatedAt: now,
      }
      setThreads((prev) => [t, ...prev])
      toast?.('🧵 スレッドを立てました')
      return id
    },
    [currentUser, toast],
  )

  const updateThread = useCallback(
    async (
      id: string,
      patch: Partial<{ title: string; body: string; category: ForumCategory; tags: string[] }>,
    ) => {
      if (!USE_MOCK) {
        const t = await api.updateThread(id, {
          title: patch.title,
          body: patch.body,
          category: patch.category,
          tags: patch.tags?.join(','),
        })
        setThreads((prev) => prev.map((x) => (x.id === id ? t : x)))
        toast?.('💾 スレッドを更新しました')
        return
      }
      setThreads((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                title: patch.title ?? x.title,
                body: patch.body ?? x.body,
                category: patch.category ?? x.category,
                tags: patch.tags ?? x.tags,
                updatedAt: new Date().toISOString(),
              }
            : x,
        ),
      )
      toast?.('💾 スレッドを更新しました')
    },
    [toast],
  )

  const deleteThread = useCallback(
    async (id: string) => {
      if (!USE_MOCK) await api.deleteThread(id)
      setThreads((prev) => prev.filter((x) => x.id !== id))
      toast?.('🗑️ スレッドを削除しました')
    },
    [toast],
  )

  const voteThread = useCallback(
    async (id: string) => {
      // 楽観更新
      setThreads((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                votedByMe: !x.votedByMe,
                voteCount: x.voteCount + (x.votedByMe ? -1 : 1),
              }
            : x,
        ),
      )
      if (!USE_MOCK) {
        try {
          const t = await api.voteThread(id)
          setThreads((prev) => prev.map((x) => (x.id === id ? t : x)))
        } catch {
          // 失敗時は戻す
          setThreads((prev) =>
            prev.map((x) =>
              x.id === id
                ? {
                    ...x,
                    votedByMe: !x.votedByMe,
                    voteCount: x.voteCount + (x.votedByMe ? -1 : 1),
                  }
                : x,
            ),
          )
        }
      }
    },
    [],
  )

  const toggleClosed = useCallback(
    async (id: string) => {
      if (!USE_MOCK) {
        const t = await api.toggleThreadClosed(id)
        setThreads((prev) => prev.map((x) => (x.id === id ? t : x)))
        return
      }
      setThreads((prev) =>
        prev.map((x) => (x.id === id ? { ...x, isClosed: !x.isClosed } : x)),
      )
    },
    [],
  )

  const togglePinned = useCallback(
    async (id: string) => {
      if (!USE_MOCK) {
        const t = await api.toggleThreadPinned(id)
        setThreads((prev) => prev.map((x) => (x.id === id ? t : x)))
        return
      }
      setThreads((prev) =>
        prev.map((x) => (x.id === id ? { ...x, isPinned: !x.isPinned } : x)),
      )
    },
    [],
  )

  const addPost = useCallback(
    async (threadId: string, body: string, posterName = '') => {
      if (!USE_MOCK) {
        const p = await api.createForumPost(threadId, body, posterName)
        setThreads((prev) =>
          prev.map((x) =>
            x.id === threadId
              ? {
                  ...x,
                  posts: [...(x.posts ?? []), p],
                  postCount: x.postCount + 1,
                  lastPostedAt: p.createdAt,
                }
              : x,
          ),
        )
        toast?.('✍️ レスしました')
        return
      }
      const now = new Date().toISOString()
      const author = currentUser?.name ?? '名無しさん'
      const name = (posterName || '').trim()
      setThreads((prev) =>
        prev.map((x) => {
          if (x.id !== threadId) return x
          const nextNumber =
            Math.max(1, ...(x.posts ?? []).map((p) => p.number)) + 1
          const pid = `p${Date.now()}`
          // 実体は UI に載せず、特定用のマップにだけ記録する
          MOCK_FORUM_AUTHORS[pid] = author
          const p: ForumPost = {
            id: pid,
            threadId,
            number: nextNumber,
            body,
            displayName: resolveDisplayName(name, threadId),
            isHandle: name.startsWith('@'),
            posterId: mockPosterId(author, threadId, now.slice(0, 10)),
            canEdit: true,
            isMine: true,
            createdAt: now,
            updatedAt: now,
          }
          return {
            ...x,
            posts: [...(x.posts ?? []), p],
            postCount: x.postCount + 1,
            lastPostedAt: now,
          }
        }),
      )
      toast?.('✍️ レスしました')
    },
    [currentUser, toast],
  )

  const updatePost = useCallback(
    async (threadId: string, postId: string, body: string) => {
      if (!USE_MOCK) {
        const p = await api.updateForumPost(postId, body)
        setThreads((prev) =>
          prev.map((x) =>
            x.id === threadId
              ? { ...x, posts: (x.posts ?? []).map((y) => (y.id === postId ? p : y)) }
              : x,
          ),
        )
        toast?.('💾 レスを更新しました')
        return
      }
      setThreads((prev) =>
        prev.map((x) =>
          x.id === threadId
            ? {
                ...x,
                posts: (x.posts ?? []).map((y) =>
                  y.id === postId
                    ? { ...y, body, updatedAt: new Date().toISOString() }
                    : y,
                ),
              }
            : x,
        ),
      )
      toast?.('💾 レスを更新しました')
    },
    [toast],
  )

  const deletePost = useCallback(
    async (threadId: string, postId: string) => {
      if (!USE_MOCK) await api.deleteForumPost(postId)
      setThreads((prev) =>
        prev.map((x) =>
          x.id === threadId
            ? {
                ...x,
                posts: (x.posts ?? []).filter((y) => y.id !== postId),
                postCount: Math.max(0, x.postCount - 1),
              }
            : x,
        ),
      )
      toast?.('🗑️ レスを削除しました')
    },
    [toast],
  )


  /**
   * モックモードでの canEdit / isMine の補完。
   * 実 API モードではサーバが計算した値がそのまま入っているので何もしない。
   * （MOCK_FORUM_AUTHORS が投稿者の実体を持つ = サーバの author 相当）
   */
  const decorated = useMemo(() => {
    if (!USE_MOCK) return threads
    const me = currentUser?.name
    const mine = (id: string) => !!me && MOCK_FORUM_AUTHORS[id] === me
    return threads.map((t) => ({
      ...t,
      isMine: mine(t.id),
      canEdit: isAdmin || mine(t.id),
      posts: (t.posts ?? []).map((p) => ({
        ...p,
        isMine: mine(p.id),
        canEdit: isAdmin || mine(p.id),
      })),
    }))
  }, [threads, currentUser, isAdmin])

  /**
   * 【管理者限定】匿名投稿の投稿者を特定する。
   * 実 API では専用エンドポイントを叩き、サーバ側で監査ログに記録される。
   * モックでは MOCK_FORUM_AUTHORS から引く。
   */
  const revealPoster = useCallback(
    async (
      target: 'thread' | 'post',
      id: string,
      reason = '',
    ): Promise<{ displayName: string; posterId: string; user: string } | null> => {
      if (!isAdmin) return null
      if (!USE_MOCK) {
        const r =
          target === 'thread'
            ? await api.revealForumThread(id, reason)
            : await api.revealForumPost(id, reason)
        return {
          displayName: r.displayName,
          posterId: r.posterId,
          user: r.userDisplayName || r.username || '不明',
        }
      }
      const found =
        target === 'thread'
          ? threads.find((t) => t.id === id)
          : threads.flatMap((t) => t.posts ?? []).find((p) => p.id === id)
      return {
        displayName: found?.displayName ?? '不明',
        posterId: found?.posterId ?? '',
        user: MOCK_FORUM_AUTHORS[id] ?? '不明',
      }
    },
    [isAdmin, threads],
  )

  return {
    isAdmin,
    loading,
    threads: decorated,
    revealPoster,
    loadThread,
    addThread,
    updateThread,
    deleteThread,
    voteThread,
    toggleClosed,
    togglePinned,
    addPost,
    updatePost,
    deletePost,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Context — アプリ全体で単一のフォーラムストアを共有する
// ─────────────────────────────────────────────────────────────────────

type ForumStore = ReturnType<typeof useForumStoreState>

const ForumContext = createContext<ForumStore | null>(null)

/** フォーラムストアの Provider。App のルート付近で1回だけマウントする。 */
export function ForumProvider({ children }: { children: ReactNode }) {
  const value = useForumStoreState()
  return createElement(ForumContext.Provider, { value }, children)
}

/**
 * フォーラムストアを取得する（アプリ全体で共有された単一インスタンス）。
 * `ForumProvider` の外で呼ぶと例外を投げる。
 */
export function useForumStore(): ForumStore {
  const ctx = useContext(ForumContext)
  if (!ctx) {
    throw new Error('useForumStore must be used within <ForumProvider>')
  }
  return ctx
}
