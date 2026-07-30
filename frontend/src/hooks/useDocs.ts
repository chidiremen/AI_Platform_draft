import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { USE_MOCK } from '../config'
import * as api from '../api'
import { useApp } from '../store'
import type { Answer, DocCategory, GuideArticle, Question } from '../types'
import { isAdminRole } from '../data/users'
import {
  MOCK_CATEGORIES,
  MOCK_GUIDES,
  MOCK_QUESTIONS,
} from '../data/docs/mockDocs'

const KEYS = {
  cats: 'aitc_docs_categories_v1',
  guides: 'aitc_docs_guides_v1',
  questions: 'aitc_docs_questions_v1',
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
    /* ignore */
  }
}

/**
 * ガイド/Q&A のストア本体。
 *
 * ⚠️ 直接呼ばないこと。この hook は state を「生成」するため、複数箇所から
 * 呼ぶとコンポーネントごとに別インスタンスができてしまい、ある画面での投稿が
 * 別の画面に反映されない（例: 質問投稿 → 詳細ページで見つからず白紙）。
 * 利用側は必ず Context 経由の {@link useDocsStore} を使う。
 */
function useDocsStoreState() {
  const { currentUser, toast } = useApp()
  const isAdmin = isAdminRole(currentUser?.role)

  const [categories, setCategories] = useState<DocCategory[]>(() =>
    loadPersisted<DocCategory[]>(KEYS.cats, MOCK_CATEGORIES),
  )
  const [guides, setGuides] = useState<GuideArticle[]>(() =>
    loadPersisted<GuideArticle[]>(KEYS.guides, MOCK_GUIDES),
  )
  const [questions, setQuestions] = useState<Question[]>(() =>
    loadPersisted<Question[]>(KEYS.questions, MOCK_QUESTIONS),
  )
  const [loading, setLoading] = useState<boolean>(!USE_MOCK)

  // 永続化
  useEffect(() => savePersisted(KEYS.cats, categories), [categories])
  useEffect(() => savePersisted(KEYS.guides, guides), [guides])
  useEffect(() => savePersisted(KEYS.questions, questions), [questions])

  // 実API モード: 初期フェッチ
  useEffect(() => {
    if (USE_MOCK) return
    if (!currentUser) return
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const [cats, gs, qs] = await Promise.all([
          api.listCategories(),
          api.listGuides(),
          api.listQuestions(),
        ])
        if (!active) return
        setCategories(cats)
        setGuides(gs)
        setQuestions(qs)
      } catch (e) {
        toast?.(
          `ドキュメント取得失敗: ${e instanceof Error ? e.message : ''}`,
        )
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [currentUser, toast])

  // ── ヘルパ ──
  const refreshQuestion = useCallback(
    async (id: string) => {
      if (USE_MOCK) return
      try {
        const q = await api.getQuestion(id)
        setQuestions((prev) => {
          const found = prev.find((x) => x.id === id)
          return found ? prev.map((x) => (x.id === id ? q : x)) : [q, ...prev]
        })
      } catch {
        /* ignore */
      }
    },
    [],
  )

  /**
   * 指定 ID の質問がローカルに無ければ個別取得して補う。
   * 実APIモードの一覧はページネーションされるため、2ページ目以降の質問へ
   * 直接 URL でアクセスすると一覧に含まれない。その場合の救済措置。
   * 戻り値は「見つかった / 見つからなかった」の判定用。
   */
  const ensureQuestion = useCallback(
    async (id: string): Promise<'found' | 'missing'> => {
      if (questions.some((q) => q.id === id)) return 'found'
      if (USE_MOCK) return 'missing'
      try {
        const q = await api.getQuestion(id)
        setQuestions((prev) =>
          prev.some((x) => x.id === q.id) ? prev : [q, ...prev],
        )
        return 'found'
      } catch {
        return 'missing'
      }
    },
    [questions],
  )

  // ── Guide CRUD ──
  const addGuide = useCallback(
    async (input: {
      categoryId: number
      title: string
      slug: string
      body: string
    }): Promise<string> => {
      if (!USE_MOCK) {
        const g = await api.createGuide({
          category: input.categoryId,
          title: input.title,
          slug: input.slug,
          body: input.body,
        })
        setGuides((prev) => [g, ...prev])
        toast?.('📝 ガイドを作成しました')
        return g.id
      }
      const cat = categories.find((c) => c.id === input.categoryId)
      const g: GuideArticle = {
        id: `g${Date.now()}`,
        categoryId: input.categoryId,
        categorySlug: cat?.slug ?? '',
        categoryName: cat?.name ?? '',
        title: input.title,
        slug: input.slug,
        body: input.body,
        order: 0,
        author: currentUser?.name ?? '不明',
        isPublished: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setGuides((prev) => [g, ...prev])
      toast?.('📝 ガイドを作成しました')
      return g.id
    },
    [categories, currentUser, toast],
  )

  const updateGuide = useCallback(
    async (id: string, patch: Partial<{ title: string; body: string; slug: string; categoryId: number }>) => {
      if (!USE_MOCK) {
        const upd = await api.updateGuide(id, {
          title: patch.title,
          body: patch.body,
          slug: patch.slug,
          category: patch.categoryId,
        })
        setGuides((prev) => prev.map((g) => (g.id === id ? upd : g)))
        toast?.('💾 ガイドを更新しました')
        return
      }
      setGuides((prev) =>
        prev.map((g) =>
          g.id === id
            ? {
                ...g,
                title: patch.title ?? g.title,
                slug: patch.slug ?? g.slug,
                body: patch.body ?? g.body,
                categoryId: patch.categoryId ?? g.categoryId,
                updatedAt: new Date().toISOString(),
              }
            : g,
        ),
      )
      toast?.('💾 ガイドを更新しました')
    },
    [toast],
  )

  const deleteGuide = useCallback(
    async (id: string) => {
      if (!USE_MOCK) await api.deleteGuide(id)
      setGuides((prev) => prev.filter((g) => g.id !== id))
      toast?.('🗑️ ガイドを削除しました')
    },
    [toast],
  )

  // ── Question CRUD ──
  const addQuestion = useCallback(
    async (input: {
      categoryId: number | null
      title: string
      body: string
      tags?: string[]
    }): Promise<string> => {
      if (!USE_MOCK) {
        const q = await api.createQuestion({
          category: input.categoryId,
          title: input.title,
          body: input.body,
          tags: (input.tags ?? []).join(','),
        })
        setQuestions((prev) => [q, ...prev])
        toast?.('❓ 質問を投稿しました')
        return q.id
      }
      const cat = input.categoryId
        ? categories.find((c) => c.id === input.categoryId)
        : null
      const q: Question = {
        id: `q${Date.now()}`,
        categoryId: input.categoryId,
        categorySlug: cat?.slug ?? null,
        categoryName: cat?.name ?? null,
        title: input.title,
        body: input.body,
        tags: input.tags ?? [],
        asker: currentUser?.name ?? '不明',
        isResolved: false,
        viewCount: 0,
        answerCount: 0,
        answers: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setQuestions((prev) => [q, ...prev])
      toast?.('❓ 質問を投稿しました')
      return q.id
    },
    [categories, currentUser, toast],
  )

  const updateQuestion = useCallback(
    async (id: string, patch: Partial<{ title: string; body: string; categoryId: number | null; tags: string[] }>) => {
      if (!USE_MOCK) {
        const upd = await api.updateQuestion(id, {
          title: patch.title,
          body: patch.body,
          category: patch.categoryId,
          tags: patch.tags?.join(','),
        })
        setQuestions((prev) => prev.map((q) => (q.id === id ? upd : q)))
        toast?.('💾 質問を更新しました')
        return
      }
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                title: patch.title ?? q.title,
                body: patch.body ?? q.body,
                categoryId: patch.categoryId ?? q.categoryId,
                tags: patch.tags ?? q.tags,
                updatedAt: new Date().toISOString(),
              }
            : q,
        ),
      )
      toast?.('💾 質問を更新しました')
    },
    [toast],
  )

  const deleteQuestion = useCallback(
    async (id: string) => {
      if (!USE_MOCK) await api.deleteQuestion(id)
      setQuestions((prev) => prev.filter((q) => q.id !== id))
      toast?.('🗑️ 質問を削除しました')
    },
    [toast],
  )

  const toggleResolved = useCallback(
    async (id: string) => {
      if (!USE_MOCK) {
        const upd = await api.toggleResolved(id)
        setQuestions((prev) => prev.map((q) => (q.id === id ? upd : q)))
        return
      }
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === id ? { ...q, isResolved: !q.isResolved } : q,
        ),
      )
    },
    [],
  )

  // ── Answer ──
  const addAnswer = useCallback(
    async (questionId: string, body: string) => {
      if (!USE_MOCK) {
        const a = await api.createAnswer(questionId, body)
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId
              ? {
                  ...q,
                  answers: [...(q.answers ?? []), a],
                  answerCount: q.answerCount + 1,
                }
              : q,
          ),
        )
        toast?.('💬 回答を投稿しました')
        return
      }
      const a: Answer = {
        id: `a${Date.now()}`,
        questionId,
        body,
        author: currentUser?.name ?? '不明',
        isAccepted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId
            ? {
                ...q,
                answers: [...(q.answers ?? []), a],
                answerCount: q.answerCount + 1,
              }
            : q,
        ),
      )
      toast?.('💬 回答を投稿しました')
    },
    [currentUser, toast],
  )

  const updateAnswer = useCallback(
    async (questionId: string, answerId: string, body: string) => {
      if (!USE_MOCK) {
        const a = await api.updateAnswer(answerId, body)
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId
              ? {
                  ...q,
                  answers: (q.answers ?? []).map((x) => (x.id === answerId ? a : x)),
                }
              : q,
          ),
        )
        toast?.('💾 回答を更新しました')
        return
      }
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId
            ? {
                ...q,
                answers: (q.answers ?? []).map((x) =>
                  x.id === answerId ? { ...x, body, updatedAt: new Date().toISOString() } : x,
                ),
              }
            : q,
        ),
      )
      toast?.('💾 回答を更新しました')
    },
    [toast],
  )

  const deleteAnswer = useCallback(
    async (questionId: string, answerId: string) => {
      if (!USE_MOCK) await api.deleteAnswer(answerId)
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId
            ? {
                ...q,
                answers: (q.answers ?? []).filter((x) => x.id !== answerId),
                answerCount: Math.max(0, q.answerCount - 1),
              }
            : q,
        ),
      )
      toast?.('🗑️ 回答を削除しました')
    },
    [toast],
  )

  const acceptAnswer = useCallback(
    async (questionId: string, answerId: string) => {
      if (!USE_MOCK) {
        await api.acceptAnswer(answerId)
        // toggle 反映のため再取得
        await refreshQuestion(questionId)
        return
      }
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id !== questionId) return q
          const answers = (q.answers ?? []).map((a) =>
            a.id === answerId
              ? { ...a, isAccepted: !a.isAccepted }
              : { ...a, isAccepted: false },
          )
          const anyAccepted = answers.some((a) => a.isAccepted)
          return { ...q, answers, isResolved: anyAccepted || q.isResolved }
        }),
      )
    },
    [refreshQuestion],
  )

  return {
    isAdmin,
    loading,
    categories,
    guides,
    questions,
    // guide
    addGuide,
    updateGuide,
    deleteGuide,
    // question
    addQuestion,
    updateQuestion,
    deleteQuestion,
    toggleResolved,
    ensureQuestion,
    // answer
    addAnswer,
    updateAnswer,
    deleteAnswer,
    acceptAnswer,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Context — アプリ全体で単一の docs ストアを共有する
// ─────────────────────────────────────────────────────────────────────

type DocsStore = ReturnType<typeof useDocsStoreState>

const DocsContext = createContext<DocsStore | null>(null)

/** ガイド/Q&A ストアの Provider。App のルート付近で1回だけマウントする。 */
export function DocsProvider({ children }: { children: ReactNode }) {
  const value = useDocsStoreState()
  return createElement(DocsContext.Provider, { value }, children)
}

/**
 * ガイド/Q&A ストアを取得する（アプリ全体で共有された単一インスタンス）。
 * `DocsProvider` の外で呼ぶと例外を投げる。
 */
export function useDocsStore(): DocsStore {
  const ctx = useContext(DocsContext)
  if (!ctx) {
    throw new Error('useDocsStore must be used within <DocsProvider>')
  }
  return ctx
}
