import { Navigate } from 'react-router-dom'
import { useApp } from '../store'
import ProfilePanel from '../components/ProfilePanel'

/**
 * ログイン中ユーザー本人のプロフィール編集ページ（スタンドアロン画面）。
 * 実装本体は `ProfilePanel` で、マイページの「⚙️ プロフィール」タブと共通。
 */
export default function ProfilePage() {
  const { currentUser } = useApp()
  if (!currentUser) return <Navigate to="/" replace />

  return (
    <div className="container section" style={{ maxWidth: 720 }}>
      <h1 className="page-title">⚙️ プロフィール設定</h1>
      <p className="page-sub">あなた自身のアカウント情報を編集します。</p>
      <ProfilePanel />
    </div>
  )
}
