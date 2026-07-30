import { useEffect, useMemo, useState } from 'react'
import * as api from '../api'
import { USE_MOCK } from '../config'
import { useApp } from '../store'
import { MOCK_USERS, isAdminRole } from '../data/users'

/**
 * メールでフィードバックを送るモーダル。
 *
 * サーバからメールを送るのではなく、`mailto:` を組み立ててユーザーの既定
 * メールクライアント（社内では Outlook）を開く。組織のメール送信基盤や
 * Graph API に依存しないので、追加の権限申請なしで運用できる。
 *
 * 宛先の決め方:
 *   - `defaultTo` が渡されていればそれを初期値にする（例: ツール登録者）
 *   - 「運営（管理者）宛」を選ぶと `/api/feedback-recipients/` の結果を使う
 *     （モックでは admin / tool_admin ロールのユーザーのメールから生成）
 */
interface Props {
  /** モーダル見出し */
  title?: string
  /** 初期の宛先（ツール登録者のメール等）。無ければ運営宛のみ */
  defaultTo?: string
  /** 宛先の説明（例: 「登録者: 田中太郎」） */
  defaultToLabel?: string
  /** 件名の初期値 */
  subject?: string
  /** 本文の初期値（末尾に送信者の署名が付く） */
  body?: string
  onClose: () => void
}

/** mailto: の上限（クライアント差があるため保守的に） */
const MAILTO_SOFT_LIMIT = 1800

export default function FeedbackModal({
  title = '✉️ フィードバックを送る',
  defaultTo,
  defaultToLabel,
  subject: initialSubject = '',
  body: initialBody = '',
  onClose,
}: Props) {
  const { currentUser } = useApp()
  const [target, setTarget] = useState<'default' | 'admins'>(
    defaultTo ? 'default' : 'admins',
  )
  const [adminEmails, setAdminEmails] = useState<string[]>([])
  const [loadingTo, setLoadingTo] = useState(false)
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [copied, setCopied] = useState(false)

  // 運営宛の宛先を取得
  useEffect(() => {
    if (USE_MOCK) {
      setAdminEmails(
        MOCK_USERS.filter((u) => isAdminRole(u.role) && u.email).map(
          (u) => u.email as string,
        ),
      )
      return
    }
    let active = true
    setLoadingTo(true)
    api
      .getFeedbackRecipients()
      .then((r) => {
        if (active) setAdminEmails(r.to)
      })
      .catch(() => {
        if (active) setAdminEmails([])
      })
      .finally(() => {
        if (active) setLoadingTo(false)
      })
    return () => {
      active = false
    }
  }, [])

  const to = target === 'default' && defaultTo ? [defaultTo] : adminEmails

  /** 送信者の署名を付けた最終本文 */
  const finalBody = useMemo(() => {
    const sig = [
      '',
      '---',
      `送信者: ${currentUser?.name ?? ''}${
        currentUser?.email ? ` <${currentUser.email}>` : ''
      }`,
      'AI Tool Catalog（社内AI活用プラットフォーム）より',
    ].join('\n')
    return body.trimEnd() + '\n' + sig
  }, [body, currentUser])

  const mailtoUrl = useMemo(() => {
    if (to.length === 0) return ''
    const params = new URLSearchParams()
    if (subject) params.set('subject', subject)
    params.set('body', finalBody)
    // URLSearchParams は空白を + にするが mailto では %20 が正しい
    const qs = params.toString().replace(/\+/g, '%20')
    return `mailto:${to.join(',')}?${qs}`
  }, [to, subject, finalBody])

  const tooLong = mailtoUrl.length > MAILTO_SOFT_LIMIT
  const canSend = to.length > 0 && subject.trim().length > 0 && body.trim().length > 0

  function openMailer() {
    if (!mailtoUrl) return
    // location.href だと SPA のルーティングを踏まないので安全
    window.location.href = mailtoUrl
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(finalBody)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* クリップボード不許可環境では何もしない */
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="feedback-note">
          「Outlook で開く」を押すと、既定のメールソフトに下書きが作られます。
          <strong>この画面から直接送信はされません</strong>ので、内容を確認して
          Outlook 側で送信してください。
        </p>

        {/* 宛先 */}
        <label className="label">宛先</label>
        <div className="feedback-target">
          {defaultTo && (
            <button
              type="button"
              className={`chip ${target === 'default' ? 'active' : ''}`}
              onClick={() => setTarget('default')}
            >
              {defaultToLabel ?? '登録者'}
            </button>
          )}
          <button
            type="button"
            className={`chip ${target === 'admins' ? 'active' : ''}`}
            onClick={() => setTarget('admins')}
          >
            🛠️ 運営（管理者）
          </button>
        </div>
        <div className="feedback-to-line">
          {loadingTo ? (
            '宛先を取得中…'
          ) : to.length > 0 ? (
            <code>{to.join(', ')}</code>
          ) : (
            <span className="feedback-warn">
              ⚠️ 宛先のメールアドレスが未登録です。
              {target === 'admins'
                ? '管理者のプロフィールにメールアドレスを設定してください（マイページ → ⚙️ プロフィール）。'
                : 'このツールの登録者がメールアドレスを未設定です。'}
            </span>
          )}
        </div>

        <div style={{ height: 12 }} />
        <label className="label">件名 *</label>
        <input
          className="input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="例: 〇〇ツールについての改善提案"
        />

        <div style={{ height: 12 }} />
        <label className="label">本文 *</label>
        <textarea
          className="textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={'お気づきの点・改善提案・不具合などをご記入ください。'}
          style={{ minHeight: 180 }}
        />
        <div className="hint">
          送信者名（{currentUser?.name}）とプラットフォーム名が末尾に自動で付きます
        </div>

        {tooLong && (
          <div className="feedback-warn" style={{ marginTop: 10 }}>
            ⚠️ 本文が長いため、メールソフトによっては途中で切れる場合があります。
            「本文をコピー」してから Outlook に貼り付けるのが確実です。
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            閉じる
          </button>
          <button type="button" className="btn" onClick={copyBody}>
            {copied ? '✅ コピーしました' : '📋 本文をコピー'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openMailer}
            disabled={!canSend}
            title={
              !canSend ? '宛先・件名・本文を入力してください' : 'Outlook を開きます'
            }
          >
            📧 Outlook で開く
          </button>
        </div>
      </div>
    </div>
  )
}
