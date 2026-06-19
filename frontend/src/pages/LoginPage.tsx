import { useState } from 'react'
import { useApp } from '../store'

export default function LoginPage() {
  const { login } = useApp()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = login(loginId.trim(), password)
    if (!ok) {
      setError('ログインIDまたはパスワードが正しくありません')
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <span className="logo-mark">
            <span>AI</span>
          </span>
          <div>
            <div className="login-title">AI Tool Catalog</div>
            <div className="login-sub">社内AI活用プラットフォーム</div>
          </div>
        </div>

        <form onSubmit={onSubmit}>
          <label className="label">ログインID</label>
          <input
            className="input"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="例: tanaka"
            autoFocus
          />
          <div style={{ height: 14 }} />
          <label className="label">パスワード</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 20 }}>
            ログイン
          </button>
        </form>

        <div className="login-hint">
          <strong>デモ用アカウント</strong>
          <div>管理者: <code>tanaka</code> / <code>password</code></div>
          <div>メンバー: <code>suzuki</code> / <code>password</code></div>
        </div>
      </div>
    </div>
  )
}
