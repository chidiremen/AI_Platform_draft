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
import { useForumStore } from './useForum'
import { isAdminRole } from '../data/users'
import type { NewsArticle } from '../types'
import { MOCK_NEWS } from '../data/docs/mockNews'

const KEY = 'aitc_news_v1'

function loadPersisted(): NewsArticle[] {
  if (!USE_MOCK) return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return MOCK_NEWS
    return JSON.parse(raw) as NewsArticle[]
  } catch {
    return MOCK_NEWS
  }
}
function savePersisted(v: NewsArticle[]) {
  if (!USE_MOCK) return
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

/**
 * ニュースストア本体。
 *
 * ⚠️ 直接呼ばないこと（state を生成するため、複数箇所から呼ぶとインスタンスが
 * 分かれて一覧とバナーで状態が食い違う）。利用側は Context 経由の
 * {@link useNewsStore} を使う。
 */
function useNewsStoreState() {
  const { currentUser, toast } = useApp()
  const forum = useForumStore()
  const isAdmin = isAdminRole(currentUser?.role)

  const [articles, setArticles] = useState<NewsArticle[]>(() => loadPersisted())
  const [loading, setLoading] = useState<boolean>(!USE_MOCK)

  useEffect(() => savePersisted(articles), [articles])

  useEffect(() => {
    if (USE_MOCK) return
    if (!currentUser) return
    let active = true
    ;(async () => {
      setLoading(true)
      try {
        const list = await api.listNews()
        if (active) setArticles(list)
      } catch (e) {
        toast?.(`ニュース取得失敗: ${e instanceof Error ? e.message : ''}`)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [currentUser, toast])

  /** フィルタ用のカテゴリ / ソース一覧（表示中の記事から導出）。 */
  const meta = useMemo(() => {
    const visible = articles.filter((a) => a.isVisible || isAdmin)
    return {
      count: visible.length,
      categories: [...new Set(visible.map((a) => a.category).filter(Boolean))].sort(),
      sources: [...new Set(visible.map((a) => a.source).filter(Boolean))].sort(),
    }
  }, [articles, isAdmin])

  /** 新しい順に並べた表示対象の記事。 */
  const visibleArticles = useMemo(() => {
    return [...articles]
      .filter((a) => a.isVisible || isAdmin)
      .sort((a, b) => {
        const ax = a.published ?? a.collectedAt ?? a.importedAt
        const bx = b.published ?? b.collectedAt ?? b.importedAt
        return (bx ?? '').localeCompare(ax ?? '')
      })
  }, [articles, isAdmin])

  /**
   * このニュースの議論スレッドを開く（無ければ作る）。
   * 戻り値のスレッドIDへ呼び出し側が遷移する。
   */
  const discuss = useCallback(
    async (articleId: string): Promise<string | null> => {
      const article = articles.find((a) => a.id === articleId)
      if (!article) return null

      if (!USE_MOCK) {
        try {
          const { threadId } = await api.discussNews(articleId)
          // スレッドIDを記事に反映（ボタン文言とレス数表示のため）
          setArticles((prev) =>
            prev.map((a) =>
              a.id === articleId
                ? {
                    ...a,
                    discussionThreadId: threadId,
                    discussionPostCount: Math.max(1, a.discussionPostCount),
                  }
                : a,
            ),
          )
          // 掲示板側のストアにも取り込んでおく（遷移先で即表示できるように）
          await forum.loadThread(threadId)
          return threadId
        } catch (e) {
          toast?.(
            `議論スレッドを開けませんでした: ${e instanceof Error ? e.message : ''}`,
          )
          return null
        }
      }

      // モック: 既にあればそれを返す
      if (article.discussionThreadId) return article.discussionThreadId

      const body = [
        `【ニュース】${article.displayTitle}`,
        article.titleJa && article.title !== article.titleJa
          ? `原題: ${article.title}`
          : '',
        [article.source, article.category].filter(Boolean).join(' / '),
        article.published ? `公開: ${article.published.slice(0, 10)}` : '',
        '',
        article.summary,
        '',
        `元記事: ${article.link}`,
        '',
        'このニュースについて自由に議論してください。',
      ]
        .filter((l) => l !== '')
        .join('\n')

      const threadId = await forum.addThread({
        title: `【ニュース】${article.displayTitle}`.slice(0, 200),
        body,
        category: 'discussion',
        tags: ['ニュース', article.category].filter(Boolean),
      })
      setArticles((prev) =>
        prev.map((a) =>
          a.id === articleId
            ? { ...a, discussionThreadId: threadId, discussionPostCount: 1 }
            : a,
        ),
      )
      return threadId
    },
    [articles, forum, toast],
  )

  /** 記事の表示 / 非表示を切り替える（管理者のみ）。 */
  const toggleVisible = useCallback(
    async (articleId: string) => {
      if (!isAdmin) return
      if (!USE_MOCK) {
        try {
          const updated = await api.toggleNewsVisible(articleId)
          setArticles((prev) =>
            prev.map((a) => (a.id === articleId ? updated : a)),
          )
        } catch (e) {
          toast?.(`変更に失敗しました: ${e instanceof Error ? e.message : ''}`)
        }
        return
      }
      setArticles((prev) =>
        prev.map((a) =>
          a.id === articleId ? { ...a, isVisible: !a.isVisible } : a,
        ),
      )
    },
    [isAdmin, toast],
  )

  return {
    isAdmin,
    loading,
    articles: visibleArticles,
    meta,
    discuss,
    toggleVisible,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Context — アプリ全体で単一のニュースストアを共有する
// ─────────────────────────────────────────────────────────────────────

type NewsStore = ReturnType<typeof useNewsStoreState>

const NewsContext = createContext<NewsStore | null>(null)

/** ニュースストアの Provider。App のルート付近で1回だけマウントする。 */
export function NewsProvider({ children }: { children: ReactNode }) {
  const value = useNewsStoreState()
  return createElement(NewsContext.Provider, { value }, children)
}

/** ニュースストアを取得する（アプリ全体で共有された単一インスタンス）。 */
export function useNewsStore(): NewsStore {
  const ctx = useContext(NewsContext)
  if (!ctx) {
    throw new Error('useNewsStore must be used within <NewsProvider>')
  }
  return ctx
}
