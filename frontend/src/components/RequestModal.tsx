import { useState } from 'react'
import type { Tool } from '../types'

interface Props {
  tool: Tool
  onClose: () => void
  onSubmit: (reason: string) => void
}

export default function RequestModal({ tool, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState('')
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>📨 管理者にアクセス権を申請する</h3>
        <p>
          「{tool.title}」の登録者（{tool.author}）に申請通知が送信されます。
          申請理由は任意入力です。
        </p>
        <label className="label">申請理由（任意）</label>
        <textarea
          className="textarea"
          placeholder="例: 担当プロジェクトのレビュー工数削減に活用したいため"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onSubmit(reason)
              onClose()
            }}
          >
            申請を送信
          </button>
        </div>
      </div>
    </div>
  )
}
