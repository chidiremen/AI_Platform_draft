import { Navigate, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import HomePage from './pages/HomePage'
import ToolDetailPage from './pages/ToolDetailPage'
import ToolFormPage from './pages/ToolFormPage'
import MyPage from './pages/MyPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import AdminUsersPage from './pages/AdminUsersPage'
import ProfilePage from './pages/ProfilePage'
import { AppProvider, useApp } from './store'

function AuthedApp() {
  const { currentUser, loading } = useApp()

  // 実APIモードの初期ロード中
  if (loading) {
    return (
      <div className="login-shell">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div className="login-title">AI Tool Catalog</div>
          <p className="login-sub" style={{ marginTop: 12 }}>
            読み込み中…
          </p>
        </div>
      </div>
    )
  }

  // 未ログイン時はログイン画面のみ（社内プラットフォームのため全体を認証ゲート）
  if (!currentUser) {
    return <LoginPage />
  }

  return (
    <div className="app-shell">
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tools/new" element={<ToolFormPage />} />
          <Route path="/tools/:id" element={<ToolDetailPage />} />
          <Route path="/tools/:id/edit" element={<ToolFormPage />} />
          <Route path="/mypage" element={<MyPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin/dashboard" element={<DashboardPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AuthedApp />
    </AppProvider>
  )
}
