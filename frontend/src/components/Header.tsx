import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const [q, setQ] = useState('')

  // 検索バーは URL の ?q= と同期
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
          <Link className="btn btn-ghost" to="/mypage">
            マイページ
          </Link>
          <Link className="btn btn-primary" to="/tools/new">
            ＋ ツール登録
          </Link>
        </nav>
      </div>
    </header>
  )
}
