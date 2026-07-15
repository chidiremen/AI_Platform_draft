import { useState } from 'react'
import { useApp } from '../store'

/**
 * ログイン中ユーザー本人のプロフィール編集パネル。
 * 表示名・メールアドレスの更新とパスワード変更ができる。
 * ロールと loginId は disabled 表示（変更は管理者による）。
 *
 * `/profile` ページ本体（ProfilePage）と、マイページの「プロフィール」タブ
 * の両方で共通利用する。
 */
export default function ProfilePanel() {
  const { currentUser, updateMyProfile, changeMyPassword } = useApp()
  if (!currentUser) return null

  return (
    <div style={{ maxWidth: 720 }}>
      <ProfileForm
        initial={{ name: currentUser.name, email: currentUser.email ?? '' }}
        loginId={currentUser.loginId}
        role={currentUser.role}
        onSubmit={updateMyProfile}
      />
      <PasswordForm onSubmit={changeMyPassword} />
    </div>
  )
}

interface ProfileFormProps {
  initial: { name: string; email: string }
  loginId: string
  role: string
  onSubmit: (patch: {
    name?: string
    email?: string
  }) => Promise<{ ok: boolean; error?: string }>
}

function ProfileForm({ initial, loginId, role, onSubmit }: ProfileFormProps) {
  const [name, setName] = useState(initial.name)
  const [email, setEmail] = useState(initial.email)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('表示名は必須です')
      return
    }
    setSubmitting(true)
    const res = await onSubmit({ name: name.trim(), email: email.trim() })
    setSubmitting(false)
    if (!res.ok) setError(res.error ?? '更新に失敗しました')
  }

  const dirty = name !== initial.name || email !== initial.email

  return (
    <form className="card-panel" onSubmit={handleSubmit}>
      <h3 style={{ marginTop: 0 }}>基本情報</h3>

      <label className="label">ログインID</label>
      <input className="input" value={loginId} disabled />
      <div className="hint">ログインIDは変更できません</div>

      <div style={{ height: 12 }} />
      <label className="label">ロール</label>
      <input
        className="input"
        value={role === 'admin' ? '組織管理者' : 'メンバー'}
        disabled
      />
      <div className="hint">ロール変更は管理者にご依頼ください</div>

      <div style={{ height: 12 }} />
      <label className="label">表示名 *</label>
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="例: 山田太郎"
      />

      <div style={{ height: 12 }} />
      <label className="label">メールアドレス</label>
      <input
        className="input"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="例: yamada@example.com"
      />

      {error && <div className="login-error">{error}</div>}

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || !dirty}
        >
          {submitting ? '保存中…' : '変更を保存'}
        </button>
      </div>
    </form>
  )
}

interface PasswordFormProps {
  onSubmit: (
    oldPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>
}

function PasswordForm({ onSubmit }: PasswordFormProps) {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setOk(false)
    if (!oldPw || !newPw) {
      setError('現在のパスワードと新しいパスワードは必須です')
      return
    }
    if (newPw !== confirmPw) {
      setError('新しいパスワード（確認）が一致しません')
      return
    }
    if (newPw.length < 4) {
      setError('新しいパスワードは4文字以上にしてください')
      return
    }
    setSubmitting(true)
    const res = await onSubmit(oldPw, newPw)
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error ?? '変更に失敗しました')
      return
    }
    setOk(true)
    setOldPw('')
    setNewPw('')
    setConfirmPw('')
  }

  return (
    <form className="card-panel" onSubmit={handleSubmit} style={{ marginTop: 18 }}>
      <h3 style={{ marginTop: 0 }}>パスワード変更</h3>

      <label className="label">現在のパスワード *</label>
      <input
        className="input"
        type="password"
        value={oldPw}
        onChange={(e) => setOldPw(e.target.value)}
        autoComplete="current-password"
        required
      />
      <div style={{ height: 12 }} />
      <label className="label">新しいパスワード *</label>
      <input
        className="input"
        type="password"
        value={newPw}
        onChange={(e) => setNewPw(e.target.value)}
        autoComplete="new-password"
        required
      />
      <div style={{ height: 12 }} />
      <label className="label">新しいパスワード（確認） *</label>
      <input
        className="input"
        type="password"
        value={confirmPw}
        onChange={(e) => setConfirmPw(e.target.value)}
        autoComplete="new-password"
        required
      />

      {error && <div className="login-error">{error}</div>}
      {ok && <div className="success-note">✅ パスワードを更新しました</div>}

      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? '更新中…' : 'パスワードを変更'}
        </button>
      </div>
    </form>
  )
}
