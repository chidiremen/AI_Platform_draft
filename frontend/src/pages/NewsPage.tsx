import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useNewsStore } from '../hooks/useNews'
import type { NewsArticle } from '../types'

/**
 * ニュースページ。
 *   /news       一覧（検索・カテゴリ・ソース・期間で絞り込み）
 *   /news/:id   個別記事
 *
 * 記事の実体は AI_WeeklyNews が収集した RSS 由来のダイジェスト。
 * 全文は転載せず、要約と元記事リンクのみを扱う（著作権上の配慮）。
 */
export default function NewsPage() {
  const { id } = useParams<{ id?: string }>()
  const store = useNewsStore()
  const article = id ? store.articles.find((a) => a.id === id) : null

  if (id) {
    if (store.loading) {
      return (
        <div className="container section">
          <div className="empty">読み込み中…</div>
        </div>
      )
    }
    if (!article) {
      return (
        <div className="container section">
          <div className="empty">
            指定されたニュースは見つかりませんでした。
            <div style={{ marginTop: 12 }}>
              <Link to="/news" className="btn btn-sm">
                ← ニュース一覧へ戻る
              </Link>
            </div>
          </div>
        </div>
      )
    }
    return <NewsDetail article={article} />
  }
  return <NewsList />
}

/** 日付を「8/27(火)」形式で返す。今日/昨日は言葉にする。 */
export function formatNewsDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const diffDays = Math.round(
    (startOf(today).getTime() - startOf(d).getTime()) / 86400000,
  )
  if (diffDays === 0) return '今日'
  if (diffDays === 1) return '昨日'
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}(${wd})`
}

// ────── 一覧 ──────

function NewsList() {
  const store = useNewsStore()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [source, setSource] = useState('')
  const [days, setDays] = useState(0) // 0 = 全期間

  const list = useMemo(() => {
    let l = store.articles
    if (category) l = l.filter((a) => a.category === category)
    if (source) l = l.filter((a) => a.source === source)
    if (days > 0) {
      const since = Date.now() - days * 86400000
      l = l.filter((a) => {
        const t = new Date(a.published ?? a.collectedAt ?? a.importedAt).getTime()
        return !Number.isNaN(t) && t >= since
      })
    }
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      l = l.filter(
        (a) =>
          a.displayTitle.toLowerCase().includes(s) ||
          a.title.toLowerCase().includes(s) ||
          a.summary.toLowerCase().includes(s) ||
          a.source.toLowerCase().includes(s),
      )
    }
    return l
  }, [store.articles, q, category, source, days])

  const hasFilter = !!(q || category || source || days)

  return (
    <div className="container section">
      <h1 className="page-title">📰 AIニュース</h1>
      <p className="page-sub">
        RSSから自動収集した AI 関連ニュースのダイジェストです。
        気になる記事は掲示板で議論できます。
      </p>

      <div className="news-filters">
        <input
          className="input news-search"
          placeholder="🔍 タイトル・要約・ソースを検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="select news-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="カテゴリ"
        >
          <option value="">全カテゴリ</option>
          {store.meta.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="select news-select"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="ソース"
        >
          <option value="">全ソース</option>
          {store.meta.sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="select news-select"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="期間"
        >
          <option value={0}>全期間</option>
          <option value={1}>24時間</option>
          <option value={7}>1週間</option>
          <option value={30}>1ヶ月</option>
        </select>
        {hasFilter && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setQ('')
              setCategory('')
              setSource('')
              setDays(0)
            }}
          >
            × 条件クリア
          </button>
        )}
      </div>

      <div className="news-count">
        {list.length} 件のニュース
        {store.loading && <span className="dim"> · 読み込み中…</span>}
      </div>

      <div className="news-list">
        {list.length === 0 && (
          <div className="empty">
            {store.articles.length === 0
              ? 'ニュースがまだ取り込まれていません。管理者が import_news を実行すると表示されます。'
              : '該当するニュースはありません。'}
          </div>
        )}
        {list.map((a) => (
          <NewsCard key={a.id} article={a} />
        ))}
      </div>
    </div>
  )
}

function NewsCard({ article: a }: { article: NewsArticle }) {
  const store = useNewsStore()
  return (
    <article className={`news-card ${a.isVisible ? '' : 'hidden-article'}`}>
      <div className="news-card-head">
        {a.category && <span className="news-cat">{a.category}</span>}
        <span className="news-source">{a.source}</span>
        <span className="news-date">
          {formatNewsDate(a.published ?? a.collectedAt)}
        </span>
        {!a.isVisible && <span className="news-hidden-badge">非表示</span>}
        {a.discussionPostCount > 0 && (
          <span className="news-discuss-count">💬 {a.discussionPostCount}</span>
        )}
      </div>
      <h2 className="news-card-title">
        <Link to={`/news/${a.id}`}>{a.displayTitle}</Link>
      </h2>
      {a.summary && <p className="news-card-summary">{a.summary}</p>}
      <div className="news-card-actions">
        <Link className="btn btn-sm" to={`/news/${a.id}`}>
          詳細
        </Link>
        <DiscussButton article={a} compact />
        <a className="btn btn-sm btn-ghost" href={a.link} target="_blank" rel="noreferrer">
          元記事 ↗
        </a>
        {store.isAdmin && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => store.toggleVisible(a.id)}
            title={a.isVisible ? 'この記事を非表示にする' : '再表示する'}
          >
            {a.isVisible ? '🙈 非表示' : '👁 再表示'}
          </button>
        )}
      </div>
    </article>
  )
}

// ────── 詳細 ──────

function NewsDetail({ article: a }: { article: NewsArticle }) {
  const store = useNewsStore()
  return (
    <div className="container section" style={{ maxWidth: 820 }}>
      <div className="guide-crumb">
        <Link to="/news">📰 AIニュース</Link>
        {a.category && <span> / {a.category}</span>}
      </div>

      <h1 className="page-title">{a.displayTitle}</h1>
      {a.titleJa && a.title && a.titleJa !== a.title && (
        <div className="news-original-title">原題: {a.title}</div>
      )}

      <div className="news-detail-meta">
        <span className="news-source">{a.source}</span>
        {a.category && <span className="news-cat">{a.category}</span>}
        <span className="dim">{formatNewsDate(a.published ?? a.collectedAt)}</span>
        {a.discussionPostCount > 0 && (
          <span className="news-discuss-count">💬 {a.discussionPostCount}</span>
        )}
      </div>

      <div className="card-panel">
        {a.summary ? (
          <p className="news-detail-summary">{a.summary}</p>
        ) : (
          <p className="dim">要約はありません。</p>
        )}
        <div className="news-detail-links">
          <a className="btn btn-primary" href={a.link} target="_blank" rel="noreferrer">
            元記事を読む ↗
          </a>
          <DiscussButton article={a} />
        </div>
        <p className="news-disclaimer">
          ※ 本文は転載していません。詳細は元記事を参照してください。
        </p>
      </div>

      {store.isAdmin && (
        <div className="guide-actions">
          <button className="btn btn-sm" onClick={() => store.toggleVisible(a.id)}>
            {a.isVisible ? '🙈 このニュースを非表示にする' : '👁 再表示する'}
          </button>
        </div>
      )}
    </div>
  )
}

// ────── ディスカッション導線 ──────

/**
 * 「このニュースについてディスカッションする」ボタン。
 * 記事に紐づくスレッドが無ければ作り、あれば既存スレッドへ合流する。
 */
export function DiscussButton({
  article,
  compact = false,
}: {
  article: NewsArticle
  compact?: boolean
}) {
  const store = useNewsStore()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const exists = !!article.discussionThreadId

  async function onClick() {
    setBusy(true)
    try {
      const threadId = await store.discuss(article.id)
      if (threadId) navigate(`/forum/${threadId}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className={`btn ${compact ? 'btn-sm' : ''} btn-discuss`}
      onClick={onClick}
      disabled={busy}
      title={
        exists
          ? 'このニュースの議論スレッドへ移動します'
          : 'このニュースの議論スレッドを作成して移動します'
      }
    >
      {busy
        ? '準備中…'
        : compact
          ? exists
            ? '💬 議論を見る'
            : '💬 議論する'
          : exists
            ? '💬 このニュースの議論を見る'
            : '💬 このニュースについてディスカッションする'}
    </button>
  )
}
