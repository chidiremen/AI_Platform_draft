/**
 * テーマ / アイデアのストア。
 *
 * 状態を「作る」フック（useState を持つフック）を複数コンポーネントから
 * 呼ぶと、それぞれ別インスタンスになって同期しなくなる。このリポジトリでは
 * docs / forum で3回踏んでいるので、ここも最初から Context 前提で作る。
 * 取得は必ず `useThemeStore()` 経由で行い、`useThemeStoreState()` は
 * Provider からしか呼ばないこと。
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import * as api from '../api'
import { USE_MOCK } from '../config'
import { MOCK_IDEAS, MOCK_STALLED_AFTER_DAYS, MOCK_THEMES } from '../data/docs/mockThemes'
import { useApp } from '../store'
import type {
  Idea,
  Theme,
  ThemeEntry,
  ThemeEntryKind,
  ThemeJoinRequest,
  ThemeSummary,
} from '../types'

const THEME_KEY = 'aitc_themes_v1'
const IDEA_KEY = 'aitc_ideas_v1'

function loadPersisted<T>(key: string, fallback: T[]): T[] {
  if (!USE_MOCK) return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : fallback
  } catch {
    return fallback
  }
}

function savePersisted<T>(key: string, value: T[]) {
  if (!USE_MOCK) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

/**
 * 一覧レスポンスを既存 state にマージする。
 *
 * 一覧 API は members / entries を返さない（詳細のみ）。素朴に置き換えると
 * 詳細取得済みのテーマからタイムラインが消える。フォーラムで踏んだのと
 * 同じ罠なので、最初から同じ対策を入れてある。
 *   - 受信側に entries が無ければ、既存の entries / members を引き継ぐ
 *   - 一覧に含まれないが詳細取得済みのテーマは捨てずに残す
 */
export function mergeThemeList(prev: Theme[], incoming: Theme[]): Theme[] {
  const prevById = new Map(prev.map((t) => [t.id, t]))
  const incomingIds = new Set(incoming.map((t) => t.id))
  const merged = incoming.map((t) => {
    const old = prevById.get(t.id)
    if (!old) return t
    return {
      ...t,
      entries: t.entries === undefined ? old.entries : t.entries,
      members: t.members === undefined ? old.members : t.members,
    }
  })
  const keep = prev.filter((t) => !incomingIds.has(t.id) && t.entries !== undefined)
  return [...merged, ...keep]
}

/** モックモードでの停滞判定。実APIモードではサーバの値をそのまま使う。 */
export function computeStalled(theme: Theme): boolean {
  if (theme.status !== 'active' && theme.status !== 'recruiting') return false
  const ref = theme.lastProgressAt ?? theme.createdAt
  if (!ref) return false
  const days = (Date.now() - new Date(ref).getTime()) / 86400000
  return days > (theme.stalledAfterDays || MOCK_STALLED_AFTER_DAYS)
}

function nowIso() {
  return new Date().toISOString()
}

function useThemeStoreState() {
  const { currentUser, toast } = useApp()
  const [themes, setThemes] = useState<Theme[]>(() =>
    loadPersisted(THEME_KEY, MOCK_THEMES),
  )
  const [ideas, setIdeas] = useState<Idea[]>(() => loadPersisted(IDEA_KEY, MOCK_IDEAS))
  const [loading, setLoading] = useState<boolean>(!USE_MOCK)

  useEffect(() => {
    savePersisted(THEME_KEY, themes)
  }, [themes])
  useEffect(() => {
    savePersisted(IDEA_KEY, ideas)
  }, [ideas])

  const me = currentUser?.name ?? ''

  // ── 読み込み ──────────────────────────────────────────────
  const reload = useCallback(async () => {
    if (USE_MOCK) return
    setLoading(true)
    try {
      const [t, i] = await Promise.all([api.listThemes(), api.listIdeas()])
      setThemes((prev) => mergeThemeList(prev, t))
      setIdeas(i)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (USE_MOCK || !currentUser) return
    void reload()
  }, [currentUser, reload])

  const loadTheme = useCallback(async (id: string) => {
    if (USE_MOCK) return
    const full = await api.getTheme(id)
    setThemes((prev) => mergeThemeList(prev, [full]))
  }, [])

  const loadIdea = useCallback(async (id: string) => {
    if (USE_MOCK) return
    const full = await api.getIdea(id)
    setIdeas((prev) => {
      const exists = prev.some((x) => x.id === id)
      return exists ? prev.map((x) => (x.id === id ? full : x)) : [...prev, full]
    })
  }, [])

  const patchTheme = useCallback((id: string, patch: Partial<Theme>) => {
    setThemes((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  // ── テーマ ────────────────────────────────────────────────
  const addTheme = useCallback(
    async (input: api.ThemeInput): Promise<Theme> => {
      if (!USE_MOCK) {
        const created = await api.createTheme(input)
        setThemes((prev) => [created, ...prev])
        toast?.('📌 テーマを登録しました')
        return created
      }
      const id = `th-${Date.now()}`
      const created: Theme = {
        id,
        title: input.title,
        summary: input.summary,
        body: input.body ?? '',
        status: input.status ?? 'active',
        tags: input.tags ?? [],
        workCategories: input.workCategories ?? [],
        owner: me,
        ownerId: currentUser?.id ?? 0,
        freezeReason: '',
        frozenAt: null,
        resultingTool: null,
        resultingToolTitle: null,
        mergedInto: null,
        mergedIntoTitle: null,
        mergedAt: null,
        originIdea: null,
        originIdeaTitle: null,
        lastProgressAt: null,
        daysSinceProgress: 0,
        isStalled: false,
        stalledAfterDays: MOCK_STALLED_AFTER_DAYS,
        memberCount: 1,
        entryCount: 0,
        latestProgress: null,
        latestProgressPercent: null,
        isMember: true,
        canEdit: true,
        myJoinRequestStatus: null,
        pendingJoinCount: 0,
        members: [
          {
            id: Date.now(),
            userId: currentUser?.id ?? 0,
            name: me,
            role: 'owner',
            joinedAt: nowIso(),
          },
        ],
        entries: [
          {
            id: `${id}-sys`,
            themeId: id,
            kind: 'system',
            body: 'テーマを登録しました。',
            progressPercent: null,
            statusAtPost: input.status ?? 'active',
            author: null,
            authorId: null,
            canEdit: false,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
        ],
        viewCount: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      setThemes((prev) => [created, ...prev])
      toast?.('📌 テーマを登録しました')
      return created
    },
    [currentUser, me, toast],
  )

  const editTheme = useCallback(
    async (id: string, patch: Partial<api.ThemeInput>) => {
      if (!USE_MOCK) {
        const updated = await api.updateTheme(id, patch)
        setThemes((prev) => mergeThemeList(prev, [updated]))
      } else {
        patchTheme(id, {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          ...(patch.workCategories !== undefined
            ? { workCategories: patch.workCategories }
            : {}),
          updatedAt: nowIso(),
        })
      }
      toast?.('💾 テーマを更新しました')
    },
    [patchTheme, toast],
  )

  const removeTheme = useCallback(
    async (id: string) => {
      if (!USE_MOCK) await api.deleteTheme(id)
      setThemes((prev) => prev.filter((t) => t.id !== id))
      toast?.('🗑️ テーマを削除しました')
    },
    [toast],
  )

  /** 登録前の重複チェック。似たテーマを返す。 */
  const findSimilar = useCallback(
    async (params: { title?: string; tags?: string[]; exclude?: string }) => {
      if (!USE_MOCK) return api.similarThemes(params)
      const words = (params.title ?? '')
        .split(/[\s　]+/)
        .filter((w) => w.length >= 2)
      const tags = (params.tags ?? []).map((t) => t.toLowerCase())
      if (!words.length && !tags.length) return []
      return themes
        .filter((t) => t.id !== params.exclude && t.status !== 'merged')
        .map((t) => {
          const hay = `${t.title} ${t.summary} ${t.tags.join(' ')}`.toLowerCase()
          let score = 0
          for (const w of words) if (hay.includes(w.toLowerCase())) score += 3
          for (const tag of tags)
            if (t.tags.some((x) => x.toLowerCase() === tag)) score += 2
          return { t, score }
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((x) => x.t)
    },
    [themes],
  )

  // ── タイムライン ───────────────────────────────────────────
  const addEntry = useCallback(
    async (
      themeId: string,
      input: { kind: ThemeEntryKind; body: string; progressPercent?: number | null },
    ) => {
      if (!USE_MOCK) {
        const entry = await api.createThemeEntry(themeId, input)
        setThemes((prev) =>
          prev.map((t) =>
            t.id === themeId
              ? {
                  ...t,
                  entries: [...(t.entries ?? []), entry],
                  entryCount: t.entryCount + 1,
                  ...(entry.kind === 'progress'
                    ? {
                        lastProgressAt: entry.createdAt,
                        daysSinceProgress: 0,
                        isStalled: false,
                        latestProgress: entry.body.slice(0, 140),
                        latestProgressPercent: entry.progressPercent ?? null,
                      }
                    : {}),
                }
              : t,
          ),
        )
        toast?.(input.kind === 'progress' ? '📈 進捗を記録しました' : '💬 コメントしました')
        return
      }
      const entry: ThemeEntry = {
        id: `e-${Date.now()}`,
        themeId,
        kind: input.kind,
        body: input.body,
        progressPercent: input.progressPercent ?? null,
        statusAtPost: themes.find((t) => t.id === themeId)?.status ?? 'active',
        author: me,
        authorId: currentUser?.id ?? 0,
        canEdit: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      setThemes((prev) =>
        prev.map((t) =>
          t.id === themeId
            ? {
                ...t,
                entries: [...(t.entries ?? []), entry],
                entryCount: t.entryCount + 1,
                ...(input.kind === 'progress'
                  ? {
                      lastProgressAt: entry.createdAt,
                      daysSinceProgress: 0,
                      isStalled: false,
                      latestProgress: input.body.slice(0, 140),
                      latestProgressPercent: input.progressPercent ?? null,
                    }
                  : {}),
                updatedAt: nowIso(),
              }
            : t,
        ),
      )
      toast?.(input.kind === 'progress' ? '📈 進捗を記録しました' : '💬 コメントしました')
    },
    [currentUser, me, themes, toast],
  )

  const removeEntry = useCallback(
    async (themeId: string, entryId: string) => {
      if (!USE_MOCK) await api.deleteThemeEntry(entryId)
      setThemes((prev) =>
        prev.map((t) =>
          t.id === themeId
            ? {
                ...t,
                entries: (t.entries ?? []).filter((e) => e.id !== entryId),
                entryCount: Math.max(0, t.entryCount - 1),
              }
            : t,
        ),
      )
      toast?.('🗑️ 記録を削除しました')
    },
    [toast],
  )

  // ── 合流 ─────────────────────────────────────────────────
  const requestJoin = useCallback(
    async (themeId: string, message: string) => {
      if (!USE_MOCK) await api.requestJoinTheme(themeId, message)
      patchTheme(themeId, { myJoinRequestStatus: 'pending' })
      toast?.('🙋 参加を申請しました')
    },
    [patchTheme, toast],
  )

  const fetchJoinRequests = useCallback(
    async (themeId: string): Promise<ThemeJoinRequest[]> => {
      if (!USE_MOCK) return api.listJoinRequests(themeId)
      return []
    },
    [],
  )

  const resolveJoin = useCallback(
    async (themeId: string, requestId: string, decision: 'approved' | 'rejected') => {
      if (!USE_MOCK) {
        await api.resolveJoinRequest(themeId, requestId, decision)
        await loadTheme(themeId)
      }
      toast?.(decision === 'approved' ? '🤝 合流を承認しました' : '見送りました')
    },
    [loadTheme, toast],
  )

  const leave = useCallback(
    async (themeId: string) => {
      if (!USE_MOCK) await api.leaveTheme(themeId)
      patchTheme(themeId, { isMember: false, myJoinRequestStatus: null })
      toast?.('テーマから離脱しました')
    },
    [patchTheme, toast],
  )

  const merge = useCallback(
    async (themeId: string, targetId: string) => {
      if (!USE_MOCK) {
        const res = await api.mergeTheme(themeId, targetId)
        setThemes((prev) => mergeThemeList(prev, [res.merged, res.target]))
      } else {
        const target = themes.find((t) => t.id === targetId)
        patchTheme(themeId, {
          status: 'merged',
          mergedInto: targetId,
          mergedIntoTitle: target?.title ?? null,
          mergedAt: nowIso(),
        })
      }
      toast?.('🔗 テーマを統合しました')
    },
    [patchTheme, themes, toast],
  )

  // ── 凍結 / 再開 ───────────────────────────────────────────
  const freeze = useCallback(
    async (themeId: string, reason: string) => {
      if (!USE_MOCK) {
        const updated = await api.freezeTheme(themeId, reason)
        setThemes((prev) => mergeThemeList(prev, [updated]))
      } else {
        patchTheme(themeId, {
          status: 'frozen',
          freezeReason: reason,
          frozenAt: nowIso(),
        })
      }
      toast?.('🧊 テーマを凍結しました')
    },
    [patchTheme, toast],
  )

  const reopen = useCallback(
    async (themeId: string) => {
      if (!USE_MOCK) {
        const updated = await api.reopenTheme(themeId)
        setThemes((prev) => mergeThemeList(prev, [updated]))
      } else {
        // freezeReason は残す。なぜ一度止まったのかは知見として価値がある。
        patchTheme(themeId, { status: 'active', frozenAt: null })
      }
      toast?.('▶️ テーマを再開しました')
    },
    [patchTheme, toast],
  )

  // ── アイデア ──────────────────────────────────────────────
  const addIdea = useCallback(
    async (input: api.IdeaInput): Promise<Idea> => {
      if (!USE_MOCK) {
        const created = await api.createIdea(input)
        setIdeas((prev) => [created, ...prev])
        toast?.('💡 アイデアを投稿しました')
        return created
      }
      const created: Idea = {
        id: `id-${Date.now()}`,
        title: input.title,
        body: input.body ?? '',
        tags: input.tags ?? [],
        workCategories: input.workCategories ?? [],
        status: 'open',
        author: me,
        authorId: currentUser?.id ?? 0,
        promotedTheme: null,
        promotedThemeTitle: null,
        voteCount: 0,
        votedByMe: false,
        commentCount: 0,
        comments: [],
        canEdit: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      setIdeas((prev) => [created, ...prev])
      toast?.('💡 アイデアを投稿しました')
      return created
    },
    [currentUser, me, toast],
  )

  const removeIdea = useCallback(
    async (id: string) => {
      if (!USE_MOCK) await api.deleteIdea(id)
      setIdeas((prev) => prev.filter((i) => i.id !== id))
      toast?.('🗑️ アイデアを削除しました')
    },
    [toast],
  )

  const voteIdea = useCallback(async (id: string) => {
    if (!USE_MOCK) {
      const r = await api.toggleIdeaVote(id)
      setIdeas((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, votedByMe: r.votedByMe, voteCount: r.voteCount } : i,
        ),
      )
      return
    }
    setIdeas((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              votedByMe: !i.votedByMe,
              voteCount: i.voteCount + (i.votedByMe ? -1 : 1),
            }
          : i,
      ),
    )
  }, [])

  const addIdeaComment = useCallback(
    async (ideaId: string, body: string) => {
      if (!USE_MOCK) {
        const c = await api.createIdeaComment(ideaId, body)
        setIdeas((prev) =>
          prev.map((i) =>
            i.id === ideaId
              ? {
                  ...i,
                  comments: [...(i.comments ?? []), c],
                  commentCount: i.commentCount + 1,
                }
              : i,
          ),
        )
        return
      }
      setIdeas((prev) =>
        prev.map((i) =>
          i.id === ideaId
            ? {
                ...i,
                comments: [
                  ...(i.comments ?? []),
                  {
                    id: `ic-${Date.now()}`,
                    ideaId,
                    author: me,
                    body,
                    canEdit: true,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                  },
                ],
                commentCount: i.commentCount + 1,
              }
            : i,
        ),
      )
    },
    [me],
  )

  /** アイデアをテーマに昇格させる。手を挙げた人が発起人になる。 */
  const promoteIdea = useCallback(
    async (ideaId: string): Promise<Theme> => {
      const idea = ideas.find((i) => i.id === ideaId)
      if (!USE_MOCK) {
        const theme = await api.promoteIdea(ideaId)
        setThemes((prev) => [theme, ...prev])
        setIdeas((prev) =>
          prev.map((i) =>
            i.id === ideaId
              ? {
                  ...i,
                  status: 'adopted',
                  promotedTheme: theme.id,
                  promotedThemeTitle: theme.title,
                }
              : i,
          ),
        )
        toast?.('🚀 テーマとして着手しました')
        return theme
      }
      const theme = await addTheme({
        title: idea?.title ?? '新しいテーマ',
        summary: idea?.title ?? '',
        body: idea?.body ?? '',
        status: 'active',
        tags: idea?.tags ?? [],
        workCategories: idea?.workCategories ?? [],
      })
      setIdeas((prev) =>
        prev.map((i) =>
          i.id === ideaId
            ? {
                ...i,
                status: 'adopted',
                promotedTheme: theme.id,
                promotedThemeTitle: theme.title,
              }
            : i,
        ),
      )
      return theme
    },
    [addTheme, ideas, toast],
  )

  // ── 集計 ─────────────────────────────────────────────────
  const [summary, setSummary] = useState<ThemeSummary | null>(null)
  const loadSummary = useCallback(async (): Promise<ThemeSummary> => {
    if (!USE_MOCK) {
      const s = await api.themeSummary()
      setSummary(s)
      return s
    }
    const byStatus = {
      recruiting: 0,
      active: 0,
      frozen: 0,
      done: 0,
      merged: 0,
    } as ThemeSummary['byStatus']
    for (const t of themes) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1
    const s: ThemeSummary = {
      total: themes.length,
      byStatus,
      stalled: themes.filter(computeStalled).length,
      stalledAfterDays: MOCK_STALLED_AFTER_DAYS,
      ideaOpen: ideas.filter((i) => i.status === 'open').length,
      frozenReasons: themes
        .filter((t) => t.status === 'frozen')
        .map((t) => ({
          id: t.id,
          title: t.title,
          reason: t.freezeReason,
          owner: t.owner,
          frozenAt: t.frozenAt,
        })),
    }
    setSummary(s)
    return s
  }, [ideas, themes])

  return {
    loading,
    themes,
    ideas,
    summary,
    reload,
    loadTheme,
    loadIdea,
    addTheme,
    editTheme,
    removeTheme,
    findSimilar,
    addEntry,
    removeEntry,
    requestJoin,
    fetchJoinRequests,
    resolveJoin,
    leave,
    merge,
    freeze,
    reopen,
    addIdea,
    removeIdea,
    voteIdea,
    addIdeaComment,
    promoteIdea,
    loadSummary,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Context — アプリ全体で単一のテーマストアを共有する
// ─────────────────────────────────────────────────────────────────────

type ThemeStore = ReturnType<typeof useThemeStoreState>

const ThemeContext = createContext<ThemeStore | null>(null)

/** テーマストアの Provider。App のルート付近で1回だけマウントする。 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeStoreState()
  return createElement(ThemeContext.Provider, { value }, children)
}

/**
 * テーマストアを取得する（アプリ全体で共有された単一インスタンス）。
 * `ThemeProvider` の外で呼ぶと例外を投げる。
 */
export function useThemeStore(): ThemeStore {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useThemeStore must be used within <ThemeProvider>')
  }
  return ctx
}
