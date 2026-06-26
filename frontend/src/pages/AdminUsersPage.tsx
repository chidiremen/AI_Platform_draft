import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../store'
import type { Role } from '../data/users'

export default function AdminUsersPage() {
  const { currentUser, users, addUser, updateUserRole, tools } = useApp()

  // フォーム状態
  const [loginId, setLoginId] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState('')

  // 管理者以外はアクセス不可
  if (!currentUser || currentUser.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!loginId.trim() || !name.trim() || !password) {
      setFormError('ログインID・表示名・パスワードは必須です')
      return
    }
    const res = await addUser({
      loginId: loginId.trim(),
      name: name.trim(),
      password,
      role,
      email: email.trim() || undefined,
    })
    if (!res.ok) {
      setFormError(res.error ?? '登録に失敗しました')
      return
    }
    setLoginId('')
    setName('')
    setPassword('')
    setEmail('')
    setRole('member')
  }

  function toolCount(userName: string) {
    return tools.filter((t) => t.author === userName).length
  }

  return (
    <div className="container section">
      <h1 className="page-title">👤 ユーザー管理</h1>
      <p className="page-sub">ユーザーの初期登録と権限（ロール）管理を行います。（管理者専用）</p>

      <div className="admin-grid">
        {/* ── 初期登録フォーム ── */}
        <div className="card-panel">
          <h3 style={{ marginTop: 0 }}>ユーザー初期登録</h3>
          <form onSubmit={onAdd}>
            <label className="label">ログインID *</label>
            <input className="input" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="例: yamamoto" />
            <div style={{ height: 12 }} />
            <label className="label">表示名 *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 山本健一" />
            <div style={{ height: 12 }} />
            <label className="label">初期パスワード *</label>
            <input className="input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="初期パスワード" />
            <div style={{ height: 12 }} />
            <label className="label">メールアドレス</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="任意" />
            <div style={{ height: 12 }} />
            <label className="label">ロール</label>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">メンバー</option>
              <option value="admin">組織管理者</option>
            </select>

            {formError && <div className="login-error">{formError}</div>}

            <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 18 }}>
              ＋ ユーザーを登録
            </button>
          </form>
        </div>

        {/* ── ユーザー一覧 ── */}
        <div className="card-panel">
          <h3 style={{ marginTop: 0 }}>登録ユーザー一覧（{users.length}名）</h3>
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ログインID</th>
                <th>表示名</th>
                <th>登録ツール</th>
                <th>ロール</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.loginId}>
                  <td><code>{u.loginId}</code></td>
                  <td>
                    {u.name}
                    {u.loginId === currentUser.loginId && (
                      <span className="badge" style={{ marginLeft: 6 }}>自分</span>
                    )}
                  </td>
                  <td>{toolCount(u.name)} 件</td>
                  <td>
                    <select
                      className="select"
                      style={{ width: 'auto', padding: '4px 8px' }}
                      value={u.role}
                      onChange={(e) => updateUserRole(u.loginId, e.target.value as Role)}
                    >
                      <option value="member">メンバー</option>
                      <option value="admin">組織管理者</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  )
}
