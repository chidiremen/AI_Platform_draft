import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useApp } from '../store'
import { AspiceBadge, ToolTypeBadge, WorkCategoryBadge } from '../components/Badges'
import RequestModal from '../components/RequestModal'
import ConfirmModal from '../components/ConfirmModal'
import Lightbox from '../components/Lightbox'
import CommentSection from '../components/CommentSection'
import FeedbackModal from '../components/FeedbackModal'
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
    users,
  } = useApp()
  const [showModal, setShowModal] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

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

          {/* 概要（常に表示） */}
          <div className="card-panel">
            <h3 style={{ marginTop: 0 }}>概要</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {tool.summary || '（概要は未登録です）'}
            </p>
          </div>

          {/* README（常に表示） */}
          <div className="card-panel" ref={readmeRef}>
            <h3 style={{ marginTop: 0 }}>README</h3>
            <div className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {tool.readme && tool.readme.trim() ? tool.readme : '（READMEは未登録です）'}
              </ReactMarkdown>
            </div>
          </div>

          {/* スクリーンショット（常に表示。空ならプレースホルダ） */}
          <div className="card-panel">
            <h3 style={{ marginTop: 0 }}>スクリーンショット</h3>
            {(tool.screenshots?.length ?? 0) > 0 ? (
              <div className="gallery">
                {tool.screenshots!.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    className="shot"
                    onClick={() => setLightboxIndex(i)}
                    aria-label={`スクリーンショット ${i + 1} を拡大表示`}
                    style={{
                      backgroundImage: `url(${JSON.stringify(s.url)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    <span style={{ opacity: 0 }}>📷</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="section-empty">スクリーンショットは未登録です。</p>
            )}
          </div>

          {/* 効果（常に表示。空ならプレースホルダ） */}
          <div className="card-panel">
            <h3 style={{ marginTop: 0 }}>効果</h3>
            {tool.effectQualitative || tool.effectHoursPerMonth != null ? (
              <>
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
              </>
            ) : (
              <p className="section-empty">効果情報は未登録です。</p>
            )}
          </div>
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

              <button
                className="btn btn-block"
                onClick={() => setShowFeedback(true)}
                title="登録者または運営にメールでフィードバック"
              >
                ✉️ フィードバックを送る
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
              <div className="access-url-box">
                <div className="access-url-label">🔗 アクセス先URL</div>
                <a
                  className="access-url-link"
                  href={tool.accessUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {tool.accessUrl}
                </a>
                <div className="access-url-hint">
                  ※ アクセスには権限が必要な場合があります（上の申請ボタンから）
                </div>
              </div>
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

      {lightboxIndex != null && tool.screenshots && (
        <Lightbox
          screenshots={tool.screenshots}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {showFeedback && (
        <FeedbackModal
          title="✉️ このツールへのフィードバック"
          // 実APIモードは serializer の author.email、モックは users から解決
          defaultTo={
            tool.authorEmail ??
            users.find((u) => u.name === tool.author)?.email
          }
          defaultToLabel={`👤 登録者: ${tool.author}`}
          subject={`[AIツールカタログ] ${tool.title} について`}
          body={`「${tool.title}」について連絡します。\n\n`}
          onClose={() => setShowFeedback(false)}
        />
      )}

      {/* コメントセクション（詳細ページ下部） */}
      <CommentSection toolId={tool.id} />
    </div>
  )
}
