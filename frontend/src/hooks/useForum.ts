import { useCallback, useEffect, useMemo, useState } from 'react'
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

export const FORUM_CATEGORIES: { value: ForumCategory; label: string; icon: string }[] = [
  { value: 'idea', label: 'ほしいツール', icon: '💡' },
  { value: 'discussion', label: '相談・議論', icon: '🗣️' },
  { value: 'share', label: '事例共有', icon: '📣' },
  { value: 'other', label: '雑談', icon: '💬' },
]

export const FORUM_CATEGORY_MAP = Object.fromEntries(
  FORUM_CATEGORIES.map((c) => [c.value, c]),
) as Record<ForumCategory, { value: ForumCategory; label: string; icon: string }>

/** フォーラムのストア。mock は localStorage、実API は fetch。 */
export function useForumStore() {
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
        if (active) setThreads(list)
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
