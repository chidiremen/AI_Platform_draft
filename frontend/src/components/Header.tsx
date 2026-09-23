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
          {/*
            ガイド (/guide) は導線を一旦非表示にしている。ページ・ルート・API は
            そのまま生きているので、URL 直打ちでアクセス可能。復活させるときは
            この Link のコメントを外すだけでよい。
              <Link className="btn btn-ghost" to="/guide">📚 ガイド</Link>
          */}
          {/* nav-label は狭い画面で非表示になり、絵文字アイコンだけが残る
              （ヘッダーを常に1行に保つため）。title は畳んだ時のツールチップ用。 */}
          <Link className="btn btn-ghost" to="/qa" title="このページのQ&A">
            💬<span className="nav-label">このページのQ&A</span>
          </Link>
          <Link className="btn btn-ghost" to="/forum" title="アイデアフォーラム">
            🧵<span className="nav-label">フォーラム</span>
          </Link>
          <Link className="btn btn-ghost" to="/themes" title="進行中のテーマ">
            🚀<span className="nav-label">テーマ</span>
          </Link>
          <Link className="btn btn-ghost" to="/mypage" title="マイページ">
            🙋<span className="nav-label">マイページ</span>
          </Link>
          <Link className="btn btn-ghost" to="/admin/dashboard" title="ダッシュボード">
            📊<span className="nav-label">ダッシュボード</span>
          </Link>
          {isAdmin && (
            <Link className="btn btn-ghost" to="/admin/users" title="ユーザー管理">
              👤<span className="nav-label">ユーザー管理</span>
            </Link>
          )}
          <Link className="btn btn-primary" to="/tools/new" title="ツール登録">
            ＋<span className="nav-label">ツール登録</span>
          </Link>
          {/*
            運営へのフィードバック導線も一旦非表示。FeedbackModal / mailto 生成の
            実装は残してあるので、下のボタンを復活させれば即使える。
              <button className="btn btn-ghost" onClick={() => setShowFeedback(true)}
                      title="運営にメールでフィードバック">✉️</button>
          */}

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
