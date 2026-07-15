import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../store'
import ToolCard from '../components/ToolCard'
import ProfilePanel from '../components/ProfilePanel'

type Tab = 'mine' | 'liked' | 'requests' | 'incoming' | 'notifications' | 'profile'

const STATUS_LABEL: Record<string, string> = {
  pending: '申請中',
  granted: '承認済み',
  rejected: '却下',
}

const COMMENT_TYPE_LABEL: Record<string, string> = {
  bug: '🐞 バグ報告',
  feature: '✨ 変更要望',
  question: '❓ 質問',
  general: '💬 一般',
}

export default function MyPage() {
  const {
    tools,
    likedIds,
    requests,
    currentUser,
    resolveRequest,
    deleteRequest,
    incomingComments,
    readNotificationIds,
    markNotificationRead,
    markAllNotificationsRead,
  } = useApp()
  const [tab, setTab] = useState<Tab>('notifications')
  const [showResolved, setShowResolved] = useState(true)

  const myName = currentUser?.name ?? ''
  const myTools = tools.filter((t) => t.author === myName)
  const likedTools = tools.filter((t) => likedIds.has(t.id))
  const myRequests = requests.filter((r) => r.requester === myName)
  const incoming = requests.filter((r) => r.author === myName)
  const pendingIncoming = incoming.filter((r) => r.status === 'pending')
  const incomingFiltered = showResolved
    ? incoming
    : incoming.filter((r) => r.status === 'pending')

  // 未読通知
  const unreadComments = useMemo(
    () => incomingComments.filter((c) => !readNotificationIds.has(c.id)),
    [incomingComments, readNotificationIds],
  )
  const unreadPendingReqs = useMemo(
    () => pendingIncoming.filter((r) => !readNotificationIds.has(r.id)),
    [pendingIncoming, readNotificationIds],
  )
  const totalUnread = unreadComments.length + unreadPendingReqs.length

  // ツールID → タイトルの逆引き（コメント通知の表示用）
  const toolTitle = (id: string) =>
    tools.find((t) => t.id === id)?.title ?? '（削除されたツール）'

  return (
    <div className="container section">
      <h1 className="page-title">マイページ</h1>
      <p className="page-sub">
        ログイン中: <strong>{myName}</strong>（
        {currentUser?.role === 'admin' ? '組織管理者' : 'メンバー'}）
      </p>

      <div className="tabs">
        <button
          className={`tab ${tab === 'notifications' ? 'active' : ''}`}
          onClick={() => setTab('notifications')}
        >
          🔔 通知{totalUnread > 0 && <span className="tab-badge">{totalUnread}</span>}
        </button>
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
        <button
          className={`tab ${tab === 'profile' ? 'active' : ''}`}
          onClick={() => setTab('profile')}
        >
          ⚙️ プロフィール
        </button>
      </div>

      {tab === 'notifications' && (
        <div>
          <div className="notif-header">
            <div className="notif-summary">
              <span className={`notif-stat ${unreadPendingReqs.length ? 'has-unread' : ''}`}>
                📨 未対応申請: <strong>{pendingIncoming.length}</strong> 件
              </span>
              <span className={`notif-stat ${unreadComments.length ? 'has-unread' : ''}`}>
                💬 ツールへのコメント: <strong>{incomingComments.length}</strong> 件
                {unreadComments.length > 0 && (
                  <span className="notif-unread-tag">未読 {unreadComments.length}</span>
                )}
              </span>
            </div>
            {totalUnread > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => markAllNotificationsRead()}
              >
                すべて既読にする
              </button>
            )}
          </div>

          <div className="notif-section">
            <h3 className="notif-section-title">📨 申請が届いています</h3>
            {pendingIncoming.length === 0 ? (
              <p className="section-empty">未対応の申請はありません。</p>
            ) : (
              <ul className="notif-list">
                {pendingIncoming.map((r) => {
                  const unread = !readNotificationIds.has(r.id)
                  return (
                    <li key={r.id} className={`notif-item ${unread ? 'unread' : ''}`}>
                      <div className="notif-body">
                        <div className="notif-line">
                          <strong>{r.requester}</strong> さんが{' '}
                          <Link to={`/tools/${r.toolId}`} onClick={() => markNotificationRead(r.id)}>
                            「{r.toolTitle}」
                          </Link>{' '}
                          へのアクセスを申請しました
                        </div>
                        {r.reason && <div className="notif-reason">理由: {r.reason}</div>}
                        <div className="notif-meta">{r.createdAt}</div>
                      </div>
                      <div className="notif-actions">
                        <button
                          className="btn btn-primary btn-xs"
                          onClick={() => {
                            resolveRequest(r.id, 'granted')
                            markNotificationRead(r.id)
                          }}
                        >
                          ✅ 承認
                        </button>
                        <button
                          className="btn btn-xs"
                          onClick={() => {
                            resolveRequest(r.id, 'rejected')
                            markNotificationRead(r.id)
                          }}
                        >
                          🚫 却下
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="notif-section">
            <h3 className="notif-section-title">💬 自分のツールへのコメント</h3>
            {incomingComments.length === 0 ? (
              <p className="section-empty">まだコメントはありません。</p>
            ) : (
              <ul className="notif-list">
                {incomingComments.slice(0, 20).map((c) => {
                  const unread = !readNotificationIds.has(c.id)
                  return (
                    <li key={c.id} className={`notif-item ${unread ? 'unread' : ''}`}>
                      <div className="notif-body">
                        <div className="notif-line">
                          <span className="notif-comment-type">
                            {COMMENT_TYPE_LABEL[c.commentType] ?? c.commentType}
                          </span>{' '}
                          <strong>{c.author}</strong> さんが{' '}
                          <Link to={`/tools/${c.toolId}`} onClick={() => markNotificationRead(c.id)}>
                            「{toolTitle(c.toolId)}」
                          </Link>{' '}
                          にコメントしました
                        </div>
                        <div className="notif-quote">{c.body.slice(0, 140)}{c.body.length > 140 ? '…' : ''}</div>
                        <div className="notif-meta">{c.createdAt.slice(0, 16).replace('T', ' ')}</div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

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
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ツール</th>
                <th>申請理由</th>
                <th>申請日</th>
                <th>状態</th>
                <th>操作</th>
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
                  <td>
                    {r.status !== 'pending' && (
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() => deleteRequest(r.id)}
                        title="履歴から削除"
                      >
                        🗑️
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="empty">アクセス権の申請はまだありません。</div>
        ))}

      {tab === 'incoming' && (
        <div>
          <div className="incoming-toolbar">
            <label className="incoming-toggle">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
              />
              解決済みも表示
            </label>
            {incoming.some((r) => r.status !== 'pending') && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={async () => {
                  if (!window.confirm('解決済みの申請をすべて履歴から削除しますか？')) return
                  const resolved = incoming.filter((r) => r.status !== 'pending')
                  for (const r of resolved) await deleteRequest(r.id)
                }}
              >
                🗑️ 解決済みを一括クリア
              </button>
            )}
          </div>
          {incomingFiltered.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ツール</th>
                    <th>申請者</th>
                    <th>申請理由</th>
                    <th>申請日</th>
                    <th>状態</th>
                    <th>処理</th>
                  </tr>
                </thead>
                <tbody>
                  {incomingFiltered.map((r) => (
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
                      <td>
                        {r.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn-sm btn-primary"
                              onClick={() => resolveRequest(r.id, 'granted')}
                            >
                              ✅ 承認
                            </button>
                            <button
                              className="btn-sm"
                              onClick={() => resolveRequest(r.id, 'rejected')}
                            >
                              🚫 却下
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            onClick={() => deleteRequest(r.id)}
                            title="履歴から削除"
                          >
                            🗑️
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">該当する申請はありません。</div>
          )}
        </div>
      )}

      {tab === 'profile' && <ProfilePanel />}
    </div>
  )
}
