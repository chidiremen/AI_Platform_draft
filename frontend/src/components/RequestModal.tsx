import { useMemo, useState } from 'react'
import type { Tool, ToolType } from '../types'

interface Props {
  tool: Tool
  onClose: () => void
  onSubmit: (reason: string) => void
}

/**
 * ツール種別ごとに、権限付与に必要な申請者情報の入力フィールドを提示する。
 * 例) GitHub → GitHub ユーザー名、NotebookLM/Copilot → Googleアカウント/組織メール、など。
 *
 * 収集した値は最終的に `reason` 文字列にまとめてサーバへ送信する（既存API互換）。
 */
interface FieldSpec {
  key: string
  label: string
  placeholder: string
  required: boolean
  hint?: string
}

const FIELDS_BY_TYPE: Record<ToolType, FieldSpec[]> = {
  github_repo: [
    {
      key: 'GitHubユーザー名',
      label: 'GitHubユーザー名 *',
      placeholder: '例: octocat',
      required: true,
      hint: 'コラボレーター追加の際に必要です',
    },
  ],
  notebook_lm: [
    {
      key: 'Googleアカウント',
      label: 'Google アカウント (メール) *',
      placeholder: '例: yamada@example.com',
      required: true,
      hint: 'NotebookLM の共有先として招待するメールアドレス',
    },
  ],
  copilot_agent: [
    {
      key: '社内メールアドレス',
      label: '社内メールアドレス *',
      placeholder: '例: taro.yamada@company.co.jp',
      required: true,
      hint: 'Microsoft Copilot Studio のエージェント共有に使用',
    },
  ],
  zip_upload: [],
  other: [
    {
      key: '連絡先',
      label: '連絡先（任意）',
      placeholder: '例: メール / Teams ハンドル',
      required: false,
    },
  ],
}

export default function RequestModal({ tool, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState('')
  const specs = useMemo(() => FIELDS_BY_TYPE[tool.toolType] ?? [], [tool.toolType])
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(specs.map((s) => [s.key, ''])),
  )
  const [error, setError] = useState('')

  const canSubmit = specs.every((s) => !s.required || fields[s.key]?.trim())

  function submit() {
    setError('')
    if (!canSubmit) {
      setError('必須項目を入力してください')
      return
    }
    // フィールド値を「ラベル: 値」の形にまとめ、理由の先頭に付与
    const structured = specs
      .map((s) => (fields[s.key]?.trim() ? `${s.key}: ${fields[s.key].trim()}` : ''))
      .filter(Boolean)
      .join('\n')
    const combined = [structured, reason.trim()].filter(Boolean).join('\n\n')
    onSubmit(combined)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>📨 管理者にアクセス権を申請する</h3>
        <p>
          「{tool.title}」の登録者（{tool.author}）に申請通知が送信されます。
        </p>

        {specs.length > 0 && (
          <div className="request-fieldset">
            {specs.map((s) => (
              <div key={s.key} style={{ marginBottom: 12 }}>
                <label className="label">{s.label}</label>
                <input
                  className="input"
                  value={fields[s.key] ?? ''}
                  onChange={(e) =>
                    setFields((prev) => ({ ...prev, [s.key]: e.target.value }))
                  }
                  placeholder={s.placeholder}
                  required={s.required}
                />
                {s.hint && <div className="hint">{s.hint}</div>}
              </div>
            ))}
          </div>
        )}

        <label className="label">申請理由（任意）</label>
        <textarea
          className="textarea"
          placeholder="例: 担当プロジェクトのレビュー工数削減に活用したいため"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        {error && <div className="login-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={!canSubmit}
            title={!canSubmit ? '必須項目を入力してください' : undefined}
          >
            申請を送信
          </button>
        </div>
      </div>
    </div>
  )
}
