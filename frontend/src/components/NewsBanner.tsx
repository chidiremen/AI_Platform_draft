import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNewsStore } from '../hooks/useNews'
import { DiscussButton, formatNewsDate } from '../pages/NewsPage'

/**
 * トップページ上部のニュースバナー。
 *
 * 表示サイズは3段階で、選択は localStorage にユーザーごとに保存される。
 *   large   : カード形式で数件（既定）
 *   compact : 1行ティッカー
 *   hidden  : 見出しだけ残して畳む
 *
 * 「非表示」でも復帰用の小さなバーは残す（完全に消すと戻せなくなるため）。
 */
export type BannerSize = 'large' | 'compact' | 'hidden'

const SIZE_KEY = 'aitc_news_banner_size_v1'
const LARGE_COUNT = 3
const COMPACT_COUNT = 5

function loadSize(): BannerSize {
  try {
    const v = localStorage.getItem(SIZE_KEY)
    if (v === 'large' || v === 'compact' || v === 'hidden') return v
  } catch {
    /* ignore */
  }
  return 'large'
}

export default function NewsBanner() {
  const store = useNewsStore()
  const [size, setSize] = useState<BannerSize>(() => loadSize())

  useEffect(() => {
    try {
      localStorage.setItem(SIZE_KEY, size)
    } catch {
      /* ignore */
    }
  }, [size])

  // 取り込み前・0件のときはバナー自体を出さない（空箱を見せない）
  if (store.articles.length === 0) return null

  const items = store.articles.slice(
    0,
    size === 'large' ? LARGE_COUNT : COMPACT_COUNT,
  )

  const controls = (
    <div className="news-banner-controls" role="group" aria-label="ニュース表示サイズ">
      <button
        type="button"
        className={`news-size-btn ${size === 'large' ? 'active' : ''}`}
        onClick={() => setSize('large')}
        title="大きく表示"
        aria-pressed={size === 'large'}
      >
        ▤
      </button>
      <button
        type="button"
        className={`news-size-btn ${size === 'compact' ? 'active' : ''}`}
        onClick={() => setSize('compact')}
        title="小さく表示"
        aria-pressed={size === 'compact'}
      >
        ▬
      </button>
      <button
        type="button"
        className={`news-size-btn ${size === 'hidden' ? 'active' : ''}`}
        onClick={() => setSize('hidden')}
        title="畳む"
        aria-pressed={size === 'hidden'}
      >
        ✕
      </button>
    </div>
  )

  if (size === 'hidden') {
    return (
      <section className="news-banner collapsed">
        <div className="news-banner-head">
          <span className="news-banner-title">
            📰 AIニュース
            <span className="news-banner-badge">{store.articles.length}</span>
          </span>
          <Link className="news-banner-more" to="/news">
            一覧を見る →
          </Link>
          {controls}
        </div>
      </section>
    )
  }

  return (
    <section className={`news-banner ${size}`}>
      <div className="news-banner-head">
        <span className="news-banner-title">
          📰 AIニュース
          <span className="news-banner-badge">{store.articles.length}</span>
        </span>
        <Link className="news-banner-more" to="/news">
          一覧を見る →
        </Link>
        {controls}
      </div>

      {size === 'large' ? (
        <div className="news-banner-cards">
          {items.map((a) => (
            <article key={a.id} className="news-banner-card">
              <div className="news-banner-card-meta">
                {a.category && <span className="news-cat">{a.category}</span>}
                <span className="news-date">
                  {formatNewsDate(a.published ?? a.collectedAt)}
                </span>
              </div>
              <h3 className="news-banner-card-title">
                <Link to={`/news/${a.id}`}>{a.displayTitle}</Link>
              </h3>
              {a.summary && (
                <p className="news-banner-card-summary">
                  {a.summary.slice(0, 90)}
                  {a.summary.length > 90 ? '…' : ''}
                </p>
              )}
              <div className="news-banner-card-foot">
                <span className="news-source">{a.source}</span>
                <DiscussButton article={a} compact />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <ul className="news-ticker">
          {items.map((a) => (
            <li key={a.id} className="news-ticker-item">
              <span className="news-date">
                {formatNewsDate(a.published ?? a.collectedAt)}
              </span>
              {a.category && <span className="news-cat">{a.category}</span>}
              <Link className="news-ticker-title" to={`/news/${a.id}`}>
                {a.displayTitle}
              </Link>
              {a.discussionPostCount > 0 && (
                <span className="news-discuss-count">💬 {a.discussionPostCount}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
