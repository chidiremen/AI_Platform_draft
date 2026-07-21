import { useState } from 'react'
import MarkdownEditor from './MarkdownEditor'
import type { DocCategory, Question } from '../types'

interface Props {
  /** null=新規、Questionオブジェクト=編集 */
  initial?: Question | null
  categories: DocCategory[]
  onSubmit: (input: {
    categoryId: number | null
    title: string
    body: string
    tags: string[]
  }) => Promise<void>
  onClose: () => void
}

/**
 * 質問投稿/編集モーダル。QAPage のリストや詳細から呼び出す。
 * 送信後は onSubmit の解決を待って自動で閉じる（呼び出し側で navigate してもOK）。
 */
export default function QuestionFormModal({
  initial,
  categories,
  onSubmit,
  onClose,
}: Props) {
  const qaCats = categories.filter((c) => c.kind === 'qa')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [categoryId, setCategoryId] = useState<number | null>(
    initial?.categoryId ?? qaCats[0]?.id ?? null,
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim() || !body.trim()) {
      setError('タイトルと本文は必須です')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        categoryId,
        title: title.trim(),
        body,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal modal-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{initial ? '✏️ 質問を編集' : '❓ 質問を投稿'}</h3>

        <form onSubmit={handleSubmit} noValidate>
          <label className="label">タイトル *</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: xxx の使い方が分かりません"
            autoFocus
          />

          <div style={{ height: 12 }} />
          <label className="label">カテゴリ</label>
          <select
            className="select"
            value={categoryId ?? ''}
            onChange={(e) =>
              setCategoryId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">（未分類）</option>
            {qaCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>

          <div style={{ height: 12 }} />
          <label className="label">本文 (Markdown) *</label>
          <MarkdownEditor value={body} onChange={setBody} rows={10} />

          <div style={{ height: 12 }} />
          <label className="label">タグ (カンマ区切り)</label>
          <input
            className="input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="例: 登録, 効果"
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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? '送信中…' : initial ? '更新' : '投稿'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
