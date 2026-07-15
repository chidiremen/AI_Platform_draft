import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../store'
import ConfirmModal from '../components/ConfirmModal'
import { ROLE_LABELS, isAdminRole, type Role, type User } from '../data/users'

export default function AdminUsersPage() {
  const {
    currentUser,
    users,
    addUser,
    updateUser,
    deleteUser,
    tools,
  } = useApp()

  // 登録フォーム状態
  const [loginId, setLoginId] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState('')

  // 編集・削除モーダル
  const [editing, setEditing] = useState<User | null>(null)
  const [deletingUser, setDeletingUser] = useState<User | null>(null)

  // 管理者以外はアクセス不可
  if (!currentUser || !isAdminRole(currentUser.role)) {
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
      <p className="page-sub">ユーザーの初期登録・編集・削除と権限管理を行います。（管理者専用）</p>

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
              <option value="member">{ROLE_LABELS.member}</option>
              <option value="tool_admin">{ROLE_LABELS.tool_admin}</option>
              <option value="admin">{ROLE_LABELS.admin}</option>
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
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.loginId === currentUser.loginId
                return (
                  <tr key={u.loginId}>
                    <td><code>{u.loginId}</code></td>
                    <td>
                      {u.name}
                      {isSelf && (
                        <span className="badge" style={{ marginLeft: 6 }}>自分</span>
                      )}
                    </td>
                    <td>{toolCount(u.name)} 件</td>
                    <td>
                      <span className={`role-badge role-${u.role}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => setEditing(u)}
                        >
                          ✏️ 編集
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-xs"
                          disabled={isSelf}
                          title={isSelf ? '自分自身は削除できません' : '削除'}
                          onClick={() => setDeletingUser(u)}
                        >
                          🗑️ 削除
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (patch) => {
            const res = await updateUser(editing.loginId, patch)
            if (res.ok) setEditing(null)
            return res
          }}
        />
      )}

      {deletingUser && (
        <ConfirmModal
          title="ユーザーを削除しますか？"
          message={`「${deletingUser.name}」（${deletingUser.loginId}）を削除します。この操作は取り消せません。`}
          confirmLabel="削除する"
          danger
          onClose={() => setDeletingUser(null)}
          onConfirm={async () => {
            await deleteUser(deletingUser.loginId)
            setDeletingUser(null)
          }}
        />
      )}
    </div>
  )
}

interface EditModalProps {
  user: User
  onClose: () => void
  onSubmit: (patch: {
    name?: string
    email?: string
    role?: Role
    password?: string
  }) => Promise<{ ok: boolean; error?: string }>
}

function EditUserModal({ user, onClose, onSubmit }: EditModalProps) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email ?? '')
  const [role, setRole] = useState<Role>(user.role)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('表示名は必須です')
      return
    }
    setSubmitting(true)
    const res = await onSubmit({
      name: name.trim(),
      email: email.trim(),
      role,
      password: password || undefined,
    })
    setSubmitting(false)
    if (!res.ok) setError(res.error ?? '更新に失敗しました')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">✏️ ユーザー編集</h3>
        <p className="modal-sub">
          <code>{user.loginId}</code> のプロフィールを編集します
        </p>
        <form onSubmit={handleSubmit}>
          <label className="label">表示名 *</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <div style={{ height: 12 }} />
          <label className="label">メールアドレス</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="任意"
          />
          <div style={{ height: 12 }} />
          <label className="label">ロール</label>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="member">{ROLE_LABELS.member}</option>
            <option value="tool_admin">{ROLE_LABELS.tool_admin}</option>
            <option value="admin">{ROLE_LABELS.admin}</option>
          </select>
          <div style={{ height: 12 }} />
          <label className="label">新しいパスワード（変更する場合のみ）</label>
          <input
            className="input"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="空欄なら変更しません"
          />

          {error && <div className="login-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? '更新中…' : '変更を保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
