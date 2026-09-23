/**
 * アイデア（「作ってほしい / こんなのが欲しい」）の一覧と詳細。
 *
 * テーマとは別の入れ物にしてある。自分では作れないが困りごとは持っている、
 * という層の受け皿で、賛同が集まったものを誰かが「着手する」とテーマに
 * 昇格する。昇格したら発起人は手を挙げた人になる。
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useThemeStore } from '../hooks/useThemes'
import { WORK_CATEGORIES } from '../data/workCategories'

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP')
}

function IdeaList() {
  const store = useThemeStore()
  const [q, setQ] = useState('')
  const [openOnly, setOpenOnly] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const visible = store.ideas
    .filter((i) => (openOnly ? i.status === 'open' : true))
    .filter((i) =>
      q.trim()
        ? `${i.title} ${i.body} ${i.tags.join(' ')}`
            .toLowerCase()
            .includes(q.trim().toLowerCase())
        : true,
    )
    .slice()
    .sort((a, b) => b.voteCount - a.voteCount)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('タイトルを入力してください。')
      return
    }
    setError('')
    try {
      const created = await store.addIdea({
        title: title.trim(),
        body,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })
      setFormOpen(false)
      setTitle('')
      setBody('')
      setTags('')
      navigate(`/ideas/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '投稿に失敗しました')
    }
  }

  return (
    <div className="container section themes-page">
      <div className="theme-head">
        <div>
          <h1 className="page-title">💡 アイデア</h1>
          <p className="page-sub">
            自分では作れなくても構いません。困りごとを書いておくと、
            できる人が拾って着手できます。
          </p>
        </div>
        <div className="theme-head-actions">
          <Link className="btn btn-ghost" to="/themes">
            🚀 進行中のテーマ
          </Link>
          <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
            ＋ アイデアを出す
          </button>
        </div>
      </div>

      <div className="theme-toolbar">
        <div className="theme-filters">
          <button
            className={`chip ${openOnly ? 'chip-on' : ''}`}
            onClick={() => setOpenOnly(true)}
          >
            募集中
          </button>
          <button
            className={`chip ${!openOnly ? 'chip-on' : ''}`}
            onClick={() => setOpenOnly(false)}
          >
            すべて
          </button>
        </div>
        <input
          className="input theme-search"
          placeholder="🔍 アイデアを検索…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {visible.length === 0 && <p className="empty">該当するアイデアがありません。</p>}

      <ul className="theme-list">
        {visible.map((i) => (
          <li key={i.id} className="theme-card idea-card">
            <button
              className={`idea-vote ${i.votedByMe ? 'on' : ''}`}
              onClick={() => void store.voteIdea(i.id)}
              title="欲しい！"
            >
              <span className="idea-vote-icon">▲</span>
              <span className="idea-vote-count">{i.voteCount}</span>
            </button>
            <Link to={`/ideas/${i.id}`} className="theme-card-main">
              <div className="theme-card-head">
                {i.status === 'adopted' ? (
                  <span className="theme-pill theme-pill-done">✅ テーマ化済み</span>
                ) : (
                  <span className="theme-pill theme-pill-recruiting">💡 募集中</span>
                )}
              </div>
              <h2 className="theme-card-title">{i.title}</h2>
              <p className="theme-card-summary">{i.body.slice(0, 120)}</p>
              <div className="theme-card-meta">
                <span>👤 {i.author}</span>
                <span>💬 {i.commentCount}件</span>
                <span>{fmt(i.createdAt)}</span>
              </div>
              {i.tags.length > 0 && (
                <div className="theme-card-tags">
                  {i.tags.map((t) => (
                    <span key={t} className="qa-tag">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {formOpen && (
        <div className="modal-overlay" onClick={() => setFormOpen(false)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <h3>💡 アイデアを出す</h3>
            <p className="dim">
              解決策ではなく「困っていること」で構いません。作れる人が見ています。
            </p>
            {error && <p className="login-error">{error}</p>}
            <label className="label">タイトル</label>
            <input
              className="input"
              value={title}
              placeholder="例: 経費精算の入力を自動化したい"
              onChange={(e) => setTitle(e.target.value)}
            />
            <label className="label">詳しく（Markdown可）</label>
            <textarea
              className="input"
              rows={6}
              value={body}
              placeholder="どんな場面で、何にどれくらい困っているか"
              onChange={(e) => setBody(e.target.value)}
            />
            <label className="label">タグ（カンマ区切り）</label>
            <input
              className="input"
              value={tags}
              placeholder="経費, OCR"
              onChange={(e) => setTags(e.target.value)}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setFormOpen(false)}
              >
                キャンセル
              </button>
              <button className="btn btn-primary" type="submit">
                投稿する
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function IdeaDetail({ id }: { id: string }) {
  const store = useThemeStore()
  const navigate = useNavigate()
  const idea = store.ideas.find((i) => i.id === id)
  const [comment, setComment] = useState('')

  const loadIdea = store.loadIdea
  useEffect(() => {
    void loadIdea(id)
  }, [id, loadIdea])

  if (!idea) {
    return (
      <div className="container section">
        <p className="empty">アイデアが見つかりません。</p>
        <Link className="back-link" to="/ideas">
          ← アイデア一覧へ
        </Link>
      </div>
    )
  }

  return (
    <div className="container section themes-page">
      <Link className="back-link" to="/ideas">
        ← アイデア一覧へ
      </Link>

      <div className="theme-detail-head">
        <h1 className="page-title">{idea.title}</h1>
        <div className="theme-card-meta">
          <span>👤 {idea.author}</span>
          <span>▲ 賛同 {idea.voteCount}</span>
          <span>{fmt(idea.createdAt)}</span>
        </div>
      </div>

      {idea.status === 'adopted' && idea.promotedTheme && (
        <div className="theme-banner theme-banner-done">
          ✅ このアイデアは テーマ「
          <Link to={`/themes/${idea.promotedTheme}`}>{idea.promotedThemeTitle}</Link>
          」として着手されています。
        </div>
      )}

      <div className="card-panel theme-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{idea.body}</ReactMarkdown>
      </div>

      {idea.workCategories.length > 0 && (
        <div className="theme-card-tags">
          {idea.workCategories.map((c) => {
            const cat = WORK_CATEGORIES.find((x) => x.id === c)
            return (
              <span key={c} className="chip">
                {cat ? `${cat.icon} ${cat.name}` : c}
              </span>
            )
          })}
        </div>
      )}

      <div className="idea-actions">
        <button
          className={`btn ${idea.votedByMe ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => void store.voteIdea(id)}
        >
          ▲ 欲しい（{idea.voteCount}）
        </button>
        {idea.status === 'open' && (
          <button
            className="btn btn-primary"
            onClick={async () => {
              const theme = await store.promoteIdea(id)
              navigate(`/themes/${theme.id}`)
            }}
          >
            🙋 これに着手する（テーマ化）
          </button>
        )}
      </div>

      <section className="card-panel">
        <h2 className="comment-title">💬 コメント（{idea.commentCount}）</h2>
        <ul className="comment-list">
          {(idea.comments ?? []).map((c) => (
            <li key={c.id} className="comment-item">
              <div className="comment-meta">
                <span className="comment-author">{c.author}</span>
                <span className="comment-date">{fmt(c.createdAt)}</span>
              </div>
              <div className="comment-body">{c.body}</div>
            </li>
          ))}
          {(idea.comments ?? []).length === 0 && (
            <li className="empty">まだコメントがありません。</li>
          )}
        </ul>
        <form
          className="comment-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!comment.trim()) return
            await store.addIdeaComment(id, comment.trim())
            setComment('')
          }}
        >
          <textarea
            className="input"
            rows={3}
            placeholder="実現方法の案や、同じ困りごとがあるなど"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="res-form-actions">
            <button className="btn btn-primary" type="submit">
              コメントする
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default function IdeasPage() {
  const { id } = useParams()
  return id ? <IdeaDetail id={id} /> : <IdeaList />
}
