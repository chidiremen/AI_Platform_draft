import { useState } from 'react'
import { FORUM_CATEGORIES } from '../hooks/useForum'
import type { ForumCategory, ForumThread } from '../types'

interface Props {
  /** 指定すると編集モード */
  initial?: ForumThread | null
  onSubmit: (input: {
    title: string
    body: string
    category: ForumCategory
    tags: string[]
    /** 名乗る名前。空欄なら名無し、@付きなら固定ハンドル */
    posterName?: string
  }) => Promise<void>
  onClose: () => void
}

/** スレッド作成/編集モーダル（掲示板なので Markdown ではなく素のテキスト想定）。 */
export default function ThreadFormModal({ initial, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [category, setCategory] = useState<ForumCategory>(initial?.category ?? 'idea')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  // 名乗る名前。前回 @ で名乗っていればそれを初期値にする（固定ハンドル）
  const [posterName, setPosterName] = useState(() => {
    try {
      return localStorage.getItem('aitc_forum_poster_name_v1') ?? ''
    } catch {
      return ''
    }
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) {
      setError('スレッドタイトルは必須です')
      return
    }
    if (!body.trim()) {
      setError('本文（1レス目）は必須です')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        body,
        category,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        posterName: posterName.trim(),
      })
      try {
        const n = posterName.trim()
        if (n.startsWith('@')) localStorage.setItem('aitc_forum_poster_name_v1', n)
        else if (!n) localStorage.removeItem('aitc_forum_poster_name_v1')
      } catch {
        /* ignore */
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? '✏️ スレッドを編集' : '🧵 新しいスレッドを立てる'}</h3>
        <p className="thread-modal-note">
          「こんなツールが欲しい」「これどう思う？」を気軽に投下してください。
          本文中の <code>&gt;&gt;2</code> は該当レスへのリンクになります。
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label className="label">カテゴリ *</label>
          <div className="thread-cat-picker">
            {FORUM_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`chip ${category === c.value ? 'active' : ''}`}
                onClick={() => setCategory(c.value)}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          <div style={{ height: 12 }} />
          <label className="label">スレッドタイトル *</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 議事録から自動でA-SPICE成果物のドラフト作らせたい"
            autoFocus
            maxLength={200}
          />

          <div style={{ height: 12 }} />
          <label className="label">本文（1レス目）*</label>
          <textarea
            className="textarea res-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={'どんなツールが欲しいか、なぜ欲しいかを書いてください。\n``` で囲むとコード表示になります。'}
            style={{ minHeight: 160 }}
          />

          <div style={{ height: 12 }} />
          <label className="label">名前</label>
          <input
            className="input"
            value={posterName}
            onChange={(e) => setPosterName(e.target.value)}
            placeholder="空欄で名無し（スレッドごとの表記になります）"
            maxLength={50}
          />
          <div className="hint">
            空欄=名無し ／ <code>@名前</code> で固定ハンドル（次回も引き継ぎ）
          </div>

          <div style={{ height: 12 }} />
          <label className="label">タグ（カンマ区切り）</label>
          <input
            className="input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="例: 議事録, 自動化"
          />

          {error && (
            <div className="login-error" style={{ whiteSpace: 'pre-line' }}>
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={submitting}
            >
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? '送信中…' : initial ? '更新' : 'スレッドを立てる'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
