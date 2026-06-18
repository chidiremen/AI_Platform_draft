import { Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import HomePage from './pages/HomePage'
import ToolDetailPage from './pages/ToolDetailPage'
import ToolFormPage from './pages/ToolFormPage'
import MyPage from './pages/MyPage'
import DashboardPage from './pages/DashboardPage'
import { AppProvider } from './store'

export default function App() {
  return (
    <AppProvider>
      <div className="app-shell">
        <Header />
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tools/new" element={<ToolFormPage />} />
            <Route path="/tools/:id" element={<ToolDetailPage />} />
            <Route path="/tools/:id/edit" element={<ToolFormPage />} />
            <Route path="/mypage" element={<MyPage />} />
            <Route path="/admin/dashboard" element={<DashboardPage />} />
          </Routes>
        </main>
      </div>
    </AppProvider>
  )
}
