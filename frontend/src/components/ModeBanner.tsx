import { USE_MOCK, USE_MOCK_RAW } from '../config'

/**
 * モックモードで動いていることを常時知らせる帯。
 *
 * モックではログインがソース内のデモユーザーとの照合になり、DBのアカウントでは
 * 入れない。それを黙って行うと「アカウントが違う」「データが消えた」と
 * 誤認され、原因に辿り着くまで時間を溶かす（実際に起きた）。
 * 設定を間違えていることが画面から即分かるようにしておく。
 */
export default function ModeBanner() {
  if (!USE_MOCK) return null
  return (
    <div className="mode-banner" role="status">
      <strong>⚠️ モックモードで動作中</strong>
      <span>
        表示されているのはデモ用のダミーデータです。データベースのアカウントでは
        ログインできません。
      </span>
      <span className="mode-banner-how">
        実データに切り替えるには、プロジェクトルートの <code>.env</code> に{' '}
        <code>VITE_USE_MOCK=false</code> を設定して再起動してください
        {USE_MOCK_RAW === null && (
          <>
            （現在この設定が<b>フロントに届いていません</b>。
            <code>frontend/vite.config.js</code> が残っていると
            <code>.env</code> が読まれなくなります）
          </>
        )}
        。
      </span>
    </div>
  )
}
