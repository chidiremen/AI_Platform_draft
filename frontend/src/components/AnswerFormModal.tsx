import { useState } from 'react'
import MarkdownEditor from './MarkdownEditor'

interface Props {
  /** ヘッダ表示用（質問タイトルの一部を切り出したもの等） */
  questionTitle: string
  /** 編集モードのとき初期値 */
  initialBody?: string
  onSubmit: (body: string) => Promise<void>
  onClose: () => void
}

/**
 * 回答投稿/編集モーダル。QAPage の質問詳細から呼び出す。
 * ロール制限（admin/tool_admin のみ表示）は呼び出し側で判定する。
 */
export default function AnswerFormModal({
  questionTitle,
  initialBody = '',
  onSubmit,
  onClose,
}: Props) {
  const [body, setBody] = useState(initialBody)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isEdit = initialBody.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!body.trim()) {
      setError('回答本文を入力してください')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(body)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>{isEdit ? '✏️ 回答を編集' : '✍️ 回答を投稿'}</h3>
        <div className="answer-modal-target">
          対象: <strong>{questionTitle}</strong>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label className="label">回答本文 (Markdown) *</label>
          <MarkdownEditor
            value={body}
            onChange={setBody}
            rows={12}
            placeholder="質問への回答を Markdown で記述..."
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
              {submitting ? '送信中…' : isEdit ? '更新' : '投稿する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
