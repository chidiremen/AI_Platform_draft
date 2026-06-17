import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CURRENT_USER, useApp } from '../store'
import ToolCard from '../components/ToolCard'

type Tab = 'mine' | 'liked' | 'requests' | 'incoming'

const STATUS_LABEL: Record<string, string> = {
  pending: '申請中',
  granted: '承認済み',
  rejected: '却下',
}

export default function MyPage() {
  const { tools, likedIds, requests } = useApp()
  const [tab, setTab] = useState<Tab>('mine')

  const myTools = tools.filter((t) => t.author === CURRENT_USER)
  const likedTools = tools.filter((t) => likedIds.has(t.id))
  const myRequests = requests.filter((r) => r.requester === CURRENT_USER)
  const incoming = requests.filter((r) => r.author === CURRENT_USER)

  return (
    <div className="container section">
      <h1 className="page-title">マイページ</h1>
      <p className="page-sub">
        ログイン中: <strong>{CURRENT_USER}</strong>（デモユーザー）
      </p>

      <div className="tabs">
        <button className={`tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>
          登録したツール（{myTools.length}）
        </button>
        <button className={`tab ${tab === 'liked' ? 'active' : ''}`} onClick={() => setTab('liked')}>
          いいねしたツール（{likedTools.length}）
        </button>
        <button
          className={`tab ${tab === 'requests' ? 'active' : ''}`}
          onClick={() => setTab('requests')}
        >
          申請したアクセス権（{myRequests.length}）
        </button>
        <button
          className={`tab ${tab === 'incoming' ? 'active' : ''}`}
          onClick={() => setTab('incoming')}
        >
          自分のツールへの被申請（{incoming.length}）
        </button>
      </div>

      {tab === 'mine' &&
        (myTools.length ? (
          <div className="tool-grid">
            {myTools.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        ) : (
          <div className="empty">まだツールを登録していません。</div>
        ))}

      {tab === 'liked' &&
        (likedTools.length ? (
          <div className="tool-grid">
            {likedTools.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        ) : (
          <div className="empty">いいねしたツールはまだありません。</div>
        ))}

      {tab === 'requests' &&
        (myRequests.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>ツール</th>
                <th>申請理由</th>
                <th>申請日</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/tools/${r.toolId}`}>{r.toolTitle}</Link>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{r.reason || '—'}</td>
                  <td>{r.createdAt}</td>
                  <td>
                    <span className={`status-pill status-${r.status}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">アクセス権の申請はまだありません。</div>
        ))}

      {tab === 'incoming' &&
        (incoming.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>ツール</th>
                <th>申請者</th>
                <th>申請理由</th>
                <th>申請日</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {incoming.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/tools/${r.toolId}`}>{r.toolTitle}</Link>
                  </td>
                  <td>{r.requester}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{r.reason || '—'}</td>
                  <td>{r.createdAt}</td>
                  <td>
                    <span className={`status-pill status-${r.status}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">自分のツールへの申請はまだありません。</div>
        ))}
    </div>
  )
}
