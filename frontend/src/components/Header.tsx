import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { ROLE_LABELS, isAdminRole } from '../data/users'
import FeedbackModal from './FeedbackModal'

export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, logout } = useApp()
  const [q, setQ] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)

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

  const isAdmin = isAdminRole(currentUser?.role)
  const roleLabel = currentUser
    ? ROLE_LABELS[currentUser.role] ?? currentUser.role
    : ''

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
          <Link className="btn btn-ghost" to="/guide">
            📚 ガイド
          </Link>
          <Link className="btn btn-ghost" to="/qa">
            💬 Q&A
          </Link>
          <Link className="btn btn-ghost" to="/admin/dashboard">
            📊 ダッシュボード
          </Link>
          {isAdmin && (
            <Link className="btn btn-ghost" to="/admin/users">
              👤 ユーザー管理
            </Link>
          )}
          <Link className="btn btn-ghost" to="/forum">
            🧵 フォーラム
          </Link>
          <Link className="btn btn-ghost" to="/mypage">
            マイページ
          </Link>
          <Link className="btn btn-primary" to="/tools/new">
            ＋ ツール登録
          </Link>

          <button
            className="btn btn-ghost"
            onClick={() => setShowFeedback(true)}
            title="運営にメールでフィードバック"
          >
            ✉️
          </button>

          <div className="user-chip" title={currentUser?.email ?? ''}>
            <Link to="/profile" className="user-name user-name-link" title="プロフィール設定">
              {currentUser?.name}
            </Link>
            <span className={`role-pill role-${currentUser?.role}`}>
              {roleLabel}
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
      {showFeedback && (
        <FeedbackModal
          title="✉️ 運営へのフィードバック"
          subject="[AIツールカタログ] フィードバック"
          body={'プラットフォームについてのご意見・ご要望:\n\n'}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </header>
  )
}
