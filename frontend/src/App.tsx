import { Navigate, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import ModeBanner from './components/ModeBanner'
import HomePage from './pages/HomePage'
import ToolDetailPage from './pages/ToolDetailPage'
import ToolFormPage from './pages/ToolFormPage'
import MyPage from './pages/MyPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import AdminUsersPage from './pages/AdminUsersPage'
import ProfilePage from './pages/ProfilePage'
import GuidePage from './pages/GuidePage'
import QAPage from './pages/QAPage'
import ForumPage from './pages/ForumPage'
import ThemesPage from './pages/ThemesPage'
import ThemeFormPage from './pages/ThemeFormPage'
import IdeasPage from './pages/IdeasPage'
import { DocsProvider } from './hooks/useDocs'
import { ForumProvider } from './hooks/useForum'
import { ThemeProvider } from './hooks/useThemes'
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
    return (
      <>
        <ModeBanner />
        <LoginPage />
      </>
    )
  }

  return (
    <DocsProvider>
      <ForumProvider>
        <ThemeProvider>
        <div className="app-shell">
          <ModeBanner />
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
              <Route path="/guide" element={<GuidePage />} />
              <Route path="/guide/:slug" element={<GuidePage />} />
              <Route path="/guide/:slug/:action" element={<GuidePage />} />
              <Route path="/qa" element={<QAPage />} />
              <Route path="/qa/:id" element={<QAPage />} />
              <Route path="/qa/:id/:action" element={<QAPage />} />
              <Route path="/forum" element={<ForumPage />} />
              <Route path="/forum/:id" element={<ForumPage />} />
              <Route path="/themes" element={<ThemesPage />} />
              {/* /themes/new は :id より前に置く。後ろだと "new" が id として
                  マッチしてしまい、登録画面が開けなくなる。 */}
              <Route path="/themes/new" element={<ThemeFormPage />} />
              <Route path="/themes/:id" element={<ThemesPage />} />
              <Route path="/themes/:id/edit" element={<ThemeFormPage />} />
              <Route path="/ideas" element={<IdeasPage />} />
              <Route path="/ideas/:id" element={<IdeasPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
        </ThemeProvider>
      </ForumProvider>
    </DocsProvider>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AuthedApp />
    </AppProvider>
  )
}
