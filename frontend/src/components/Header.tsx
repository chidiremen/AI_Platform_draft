import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useApp } from '../store'

export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, logout } = useApp()
  const [q, setQ] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    setQ(params.get('q') ?? '')
  }, [location.search])

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(location.pathname === '/' ? location.search : '')
    if (q) params.set('q', q)
    else params.delete('q')
    navigate(`/?${params.toString()}`)
  }

  const isAdmin = currentUser?.role === 'admin'

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo">
          <span className="logo-mark">
            <span>AI</span>
          </span>
          AI Tool Catalog
        </Link>

        <form className="header-search" onSubmit={onSearch}>
          <input
            className="input"
            placeholder="🔍 ツール名・概要・タグで検索…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>

        <nav className="header-nav">
          <Link className="btn btn-ghost" to="/admin/dashboard">
            📊 ダッシュボード
          </Link>
          {isAdmin && (
            <Link className="btn btn-ghost" to="/admin/users">
              👤 ユーザー管理
            </Link>
          )}
          <Link className="btn btn-ghost" to="/mypage">
            マイページ
          </Link>
          <Link className="btn btn-primary" to="/tools/new">
            ＋ ツール登録
          </Link>

          <div className="user-chip" title={currentUser?.email ?? ''}>
            <Link to="/profile" className="user-name user-name-link" title="プロフィール設定">
              {currentUser?.name}
            </Link>
            <span className={`role-pill role-${currentUser?.role}`}>
              {isAdmin ? '管理者' : 'メンバー'}
            </span>
            <button
              className="btn-ghost-link"
              onClick={() => {
                logout()
                navigate('/')
              }}
              style={{ marginLeft: 4 }}
            >
              ログアウト
            </button>
          </div>
        </nav>
      </div>
    </header>
  )
}
