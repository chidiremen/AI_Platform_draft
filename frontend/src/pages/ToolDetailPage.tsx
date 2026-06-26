import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useApp } from '../store'
import { AspiceBadge, ToolTypeBadge, WorkCategoryBadge } from '../components/Badges'
import RequestModal from '../components/RequestModal'
import ConfirmModal from '../components/ConfirmModal'
import { TOOL_TYPE_MAP } from '../data/toolTypes'
import { useReadmeScroll } from '../hooks/useActivity'

export default function ToolDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    tools,
    likedIds,
    toggleLike,
    submitRequest,
    recordDownload,
    recordActivity,
    canEdit,
    deleteTool,
  } = useApp()
  const [showModal, setShowModal] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  // 詳細ページ閲覧（view）を記録。README到達は useReadmeScroll で記録。
  useEffect(() => {
    if (id) recordActivity(id, 'view')
  }, [id, recordActivity])
  const readmeRef = useReadmeScroll<HTMLDivElement>(id ?? '')

  const tool = tools.find((t) => t.id === id)
  if (!tool) {
    return (
      <div className="container section">
        <div className="empty">ツールが見つかりませんでした。</div>
        <Link className="btn" to="/">
          ← 一覧に戻る
        </Link>
      </div>
    )
  }

  const liked = likedIds.has(tool.id)
  const typeInfo = TOOL_TYPE_MAP[tool.toolType]
  const isDownload = typeInfo.action === 'download'
  const forkedFrom = tool.forkedFrom
    ? tools.find((t) => t.id === tool.forkedFrom)
    : undefined

  return (
    <div className="container">
      <Link to="/" className="back-link">
        ← 一覧に戻る
      </Link>

      <div className="detail-grid">
        {/* ── メイン ── */}
        <div className="detail-main">
          <h1 className="detail-title">{tool.title}</h1>
          <div className="detail-byline">
            by <strong>{tool.author}</strong> ・ {tool.createdAt} 登録
            {tool.updatedAt && ` ・ ${tool.updatedAt} 更新`}
          </div>

          <div className="detail-badges">
            <ToolTypeBadge type={tool.toolType} />
            {(tool.workCategories ?? []).map((id) => (
              <WorkCategoryBadge key={id} id={id} />
            ))}
            {tool.aspiceProcesses.map((pid) => (
              <AspiceBadge key={pid} id={pid} title />
            ))}
          </div>

          {forkedFrom && (
            <div className="fork-note">
              🍴 このツールは
              <Link to={`/tools/${forkedFrom.id}`}>「{forkedFrom.title}」</Link>
              をフォークした改善版です。
            </div>
          )}

          <div className="card-panel" ref={readmeRef}>
            <div className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {tool.readme ?? '（READMEは未登録です）'}
              </ReactMarkdown>
            </div>
          </div>

          {(tool.screenshots?.length ?? 0) > 0 ? (
            <div className="card-panel">
              <h3 style={{ marginTop: 0 }}>スクリーンショット</h3>
              <div className="gallery">
                {tool.screenshots!.map((s) => (
                  <a
                    key={s.id}
                    className="shot"
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      backgroundImage: `url(${JSON.stringify(s.url)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {/* 画像が読めない場合のフォールバック */}
                    <span style={{ opacity: 0 }}>📷</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {(tool.effectQualitative || tool.effectHoursPerMonth) && (
            <div className="card-panel">
              <h3 style={{ marginTop: 0 }}>効果</h3>
              {tool.effectQualitative && (
                <p style={{ margin: '0 0 8px' }}>
                  <strong>定性:</strong> {tool.effectQualitative}
                </p>
              )}
              {tool.effectHoursPerMonth != null && (
                <p style={{ margin: 0 }}>
                  <strong>定量:</strong> 月間 {tool.effectHoursPerMonth} 時間 削減（自己申告）
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── サイドバー ── */}
        <aside className="sidebar-sticky detail-side">
          <div className="card-panel">
            <div className="metric-bar">
              <div className="metric-stat">
                <span className="num">{tool.views}</span>
                <span className="lbl">👁 閲覧</span>
              </div>
              <div className="metric-stat">
                <span className="num">{tool.likes}</span>
                <span className="lbl">♥ いいね</span>
              </div>
              <div className="metric-stat">
                <span className="num">
                  {isDownload ? tool.downloads ?? 0 : tool.accessRequests ?? 0}
                </span>
                <span className="lbl">{isDownload ? '📥 DL' : '📨 申請'}</span>
              </div>
            </div>
          </div>

          <div className="card-panel">
            <div className="action-stack">
              {isDownload ? (
                <button
                  className="btn btn-primary btn-lg btn-block"
                  onClick={() => recordDownload(tool)}
                >
                  📥 ダウンロード
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-lg btn-block"
                  onClick={() => setShowModal(true)}
                >
                  📨 管理者にアクセス権を申請する
                </button>
              )}

              <button
                className={`btn btn-like btn-block ${liked ? 'liked' : ''}`}
                onClick={() => toggleLike(tool.id)}
              >
                {liked ? '♥ いいね済み' : '♡ いいね'}
              </button>

              <button
                className="btn btn-block"
                onClick={() => navigate(`/tools/new?fork=${tool.id}`)}
              >
                🍴 フォークして改善版を登録
              </button>

              {canEdit(tool) && (
                <div className="owner-actions">
                  <div className="owner-actions-label">登録者・管理者メニュー</div>
                  <button
                    className="btn btn-block"
                    onClick={() => navigate(`/tools/${tool.id}/edit`)}
                  >
                    ✏️ 編集（再投稿）
                  </button>
                  <button
                    className="btn btn-danger btn-block"
                    onClick={() => setShowDelete(true)}
                  >
                    🗑️ 削除
                  </button>
                </div>
              )}
            </div>

            {tool.accessUrl && (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-dim)',
                  marginTop: 14,
                  marginBottom: 0,
                  wordBreak: 'break-all',
                }}
              >
                実体: {tool.accessUrl}
              </p>
            )}
          </div>

          {tool.tags && tool.tags.length > 0 && (
            <div className="card-panel">
              <h3 style={{ marginTop: 0, fontSize: 14 }}>タグ</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tool.tags.map((tag) => (
                  <span key={tag} className="badge">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {showModal && (
        <RequestModal
          tool={tool}
          onClose={() => setShowModal(false)}
          onSubmit={(reason) => submitRequest(tool, reason)}
        />
      )}

      {showDelete && (
        <ConfirmModal
          title="ツールを削除しますか？"
          message={`「${tool.title}」を削除します。この操作は取り消せません。`}
          confirmLabel="削除する"
          danger
          onClose={() => setShowDelete(false)}
          onConfirm={async () => {
            await deleteTool(tool.id)
            navigate('/')
          }}
        />
      )}
    </div>
  )
}
