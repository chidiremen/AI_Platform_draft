import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useApp } from '../store'
import type { CommentType, ToolComment } from '../types'

interface Props {
  toolId: string
}

const TYPE_META: Record<CommentType, { label: string; icon: string; color: string }> = {
  bug: { label: 'バグ報告', icon: '🐞', color: '#e0556b' },
  feature: { label: '変更要望', icon: '✨', color: '#4f9dde' },
  question: { label: '質問', icon: '❓', color: '#e0a458' },
  general: { label: '一般', icon: '💬', color: '#9fb1cc' },
}

const TYPE_ORDER: CommentType[] = ['bug', 'feature', 'question', 'general']

export default function CommentSection({ toolId }: Props) {
  const {
    currentUser,
    getComments,
    loadComments,
    addComment,
    removeComment,
    toggleCommentLike,
    canDeleteComment,
  } = useApp()

  const [body, setBody] = useState('')
  const [commentType, setCommentType] = useState<CommentType>('general')
  const [sortDesc, setSortDesc] = useState(true)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void loadComments(toolId)
  }, [toolId, loadComments])

  const all = getComments(toolId)
  const tops = useMemo(() => {
    const ts = all.filter((c) => !c.parent)
    ts.sort((a, b) =>
      sortDesc ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt),
    )
    return ts
  }, [all, sortDesc])
  const repliesOf = useMemo(() => {
    const m = new Map<string, ToolComment[]>()
    for (const c of all) {
      if (c.parent) {
        const arr = m.get(c.parent) ?? []
        arr.push(c)
        m.set(c.parent, arr)
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    }
    return m
  }, [all])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || !currentUser) return
    setSubmitting(true)
    try {
      await addComment(toolId, { body: body.trim(), commentType, parent: replyTo })
      setBody('')
      setReplyTo(null)
      setCommentType('general')
    } finally {
      setSubmitting(false)
    }
  }

  const totalCount = all.length
  const replyTarget = replyTo ? all.find((c) => c.id === replyTo) : null

  return (
    <section className="comment-section container" aria-label="コメント">
      <div className="comment-header">
        <h2 className="comment-title">💬 コメント（{totalCount}）</h2>
        <div className="comment-sort">
          <label htmlFor="comment-sort">並び順:</label>
          <select
            id="comment-sort"
            className="select select-sm"
            value={sortDesc ? 'desc' : 'asc'}
            onChange={(e) => setSortDesc(e.target.value === 'desc')}
          >
            <option value="desc">新しい順</option>
            <option value="asc">古い順</option>
          </select>
        </div>
      </div>

      {currentUser ? (
        <form className="comment-form card-panel" onSubmit={onSubmit}>
          {replyTarget && (
            <div className="comment-reply-banner">
              ↩︎ <strong>{replyTarget.author}</strong> さんへの返信
              <button
                type="button"
                className="link-btn"
                onClick={() => setReplyTo(null)}
              >
                解除
              </button>
            </div>
          )}
          <div className="comment-form-row">
            <label className="label" htmlFor="comment-type">種別:</label>
            <select
              id="comment-type"
              className="select select-sm"
              value={commentType}
              onChange={(e) => setCommentType(e.target.value as CommentType)}
              disabled={!!replyTo}
              title={replyTo ? '返信は種別=一般 として投稿されます' : undefined}
            >
              {TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].icon} {TYPE_META[t].label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="textarea"
            placeholder={
              replyTo
                ? '返信を入力（Markdown対応）'
                : 'コメント本文を入力（Markdown対応）'
            }
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ minHeight: 90 }}
            required
          />
          <div className="comment-form-actions">
            <span className="hint">Markdown（**強調**, [リンク](https://…) など）対応</span>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !body.trim()}
            >
              {submitting ? '送信中…' : replyTo ? '返信を投稿' : 'コメントを投稿'}
            </button>
          </div>
        </form>
      ) : (
        <div className="card-panel comment-login-note">
          コメントを投稿するにはログインが必要です。
        </div>
      )}

      {tops.length === 0 ? (
        <p className="section-empty">まだコメントはありません。</p>
      ) : (
        <ul className="comment-list">
          {tops.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              replies={repliesOf.get(c.id) ?? []}
              onReply={() => setReplyTo(c.id)}
              onDelete={removeComment}
              onLike={toggleCommentLike}
              canDelete={canDeleteComment}
              loggedIn={!!currentUser}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

interface ItemProps {
  comment: ToolComment
  replies: ToolComment[]
  onReply: () => void
  onDelete: (id: string) => Promise<void>
  onLike: (id: string) => Promise<void>
  canDelete: (c: ToolComment) => boolean
  loggedIn: boolean
}

function CommentItem({ comment, replies, onReply, onDelete, onLike, canDelete, loggedIn }: ItemProps) {
  const meta = TYPE_META[comment.commentType]
  return (
    <li className="comment-item">
      <div className="comment-card">
        <div className="comment-meta">
          <span
            className="comment-type-badge"
            style={{ background: meta.color + '22', color: meta.color, borderColor: meta.color }}
            title={meta.label}
          >
            {meta.icon} {meta.label}
          </span>
          <strong className="comment-author">{comment.author}</strong>
          <span className="comment-date">{formatDate(comment.createdAt)}</span>
        </div>
        <div className="comment-body markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{comment.body}</ReactMarkdown>
        </div>
        <div className="comment-actions">
          <button
            type="button"
            className={`comment-action-btn ${comment.likedByMe ? 'liked' : ''}`}
            onClick={() => loggedIn && onLike(comment.id)}
            disabled={!loggedIn}
            title={loggedIn ? 'いいね' : 'ログインしてください'}
          >
            {comment.likedByMe ? '♥' : '♡'} いいね（{comment.likeCount}）
          </button>
          {loggedIn && !comment.parent && (
            <button type="button" className="comment-action-btn" onClick={onReply}>
              ↩︎ 返信
            </button>
          )}
          {canDelete(comment) && (
            <button
              type="button"
              className="comment-action-btn comment-action-danger"
              onClick={() => {
                if (window.confirm('このコメントを削除しますか？')) onDelete(comment.id)
              }}
            >
              🗑️ 削除
            </button>
          )}
        </div>
      </div>

      {replies.length > 0 && (
        <ul className="comment-replies">
          {replies.map((r) => (
            <CommentItem
              key={r.id}
              comment={r}
              replies={[]}
              onReply={() => {}}
              onDelete={onDelete}
              onLike={onLike}
              canDelete={canDelete}
              loggedIn={loggedIn}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function formatDate(iso: string): string {
  // ISO 文字列 (YYYY-MM-DDTHH:MM:SS) を見やすく短縮表示。
  if (!iso) return ''
  const date = iso.slice(0, 10)
  const time = iso.length > 10 ? iso.slice(11, 16) : ''
  return time ? `${date} ${time}` : date
}
