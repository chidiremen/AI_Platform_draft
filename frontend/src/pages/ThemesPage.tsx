/**
 * テーマ（進行中の取り組み）の一覧と詳細。
 *
 * ルーティングは既存の Forum / QA と同じく1コンポーネントで
 * `/themes` と `/themes/:id` の両方を扱う。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useThemeStore } from '../hooks/useThemes'
import { useApp } from '../store'
import { WORK_CATEGORIES } from '../data/workCategories'
import type { Theme, ThemeEntry, ThemeJoinRequest, ThemeStatus } from '../types'

const STATUS_LABEL: Record<ThemeStatus, string> = {
  recruiting: '仲間募集中',
  active: '着手中',
  frozen: '凍結',
  done: '完了',
  merged: '統合済み',
}

const STATUS_ICON: Record<ThemeStatus, string> = {
  recruiting: '🙋',
  active: '🚀',
  frozen: '🧊',
  done: '✅',
  merged: '🔗',
}

/** 一覧の絞り込みタブ。「停滞」だけはステータスではなく派生値で絞る。 */
const FILTERS = [
  { key: 'all', label: 'すべて' },
  { key: 'active', label: '着手中' },
  { key: 'recruiting', label: '仲間募集中' },
  { key: 'stalled', label: '停滞' },
  { key: 'frozen', label: '凍結' },
  { key: 'done', label: '完了' },
  { key: 'mine', label: '自分の' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function categoryLabel(id: string): string {
  const c = WORK_CATEGORIES.find((x) => x.id === id)
  return c ? `${c.icon} ${c.name}` : id
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ja-JP')
}

function StatusPill({ theme }: { theme: Theme }) {
  return (
    <span className={`theme-pill theme-pill-${theme.status}`}>
      {STATUS_ICON[theme.status]} {STATUS_LABEL[theme.status]}
    </span>
  )
}

function StalledPill({ theme }: { theme: Theme }) {
  if (!theme.isStalled) return null
  return (
    <span
      className="theme-pill theme-pill-stalled"
      title={`${theme.stalledAfterDays}日以上、進捗の更新がありません`}
    >
      ⏳ 停滞 {theme.daysSinceProgress}日
    </span>
  )
}

function ProgressBar({ percent }: { percent: number | null | undefined }) {
  if (percent == null) return null
  const v = Math.max(0, Math.min(100, percent))
  return (
    <div className="theme-progress" title={`進捗 ${v}%`}>
      <div className="theme-progress-bar" style={{ width: `${v}%` }} />
      <span className="theme-progress-label">{v}%</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 一覧
// ─────────────────────────────────────────────────────────────
function ThemeList() {
  const store = useThemeStore()
  const { currentUser } = useApp()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [q, setQ] = useState('')

  const visible = useMemo(() => {
    let rows = store.themes
    if (filter === 'stalled') rows = rows.filter((t) => t.isStalled)
    else if (filter === 'mine')
      rows = rows.filter((t) => t.isMember || t.owner === currentUser?.name)
    else if (filter !== 'all') rows = rows.filter((t) => t.status === filter)
    // 「すべて」では統合済みを隠す。中身は合流先に移っているため。
    if (filter === 'all') rows = rows.filter((t) => t.status !== 'merged')
    if (q.trim()) {
      const k = q.trim().toLowerCase()
      rows = rows.filter((t) =>
        `${t.title} ${t.summary} ${t.tags.join(' ')}`.toLowerCase().includes(k),
      )
    }
    return rows
  }, [currentUser, filter, q, store.themes])

  const counts = useMemo(() => {
    const live = store.themes.filter((t) => t.status !== 'merged')
    return {
      all: live.length,
      active: live.filter((t) => t.status === 'active').length,
      recruiting: live.filter((t) => t.status === 'recruiting').length,
      stalled: live.filter((t) => t.isStalled).length,
      frozen: live.filter((t) => t.status === 'frozen').length,
      done: live.filter((t) => t.status === 'done').length,
      mine: live.filter((t) => t.isMember || t.owner === currentUser?.name).length,
    } as Record<FilterKey, number>
  }, [currentUser, store.themes])

  return (
    <div className="container section themes-page">
      <div className="theme-head">
        <div>
          <h1 className="page-title">🚀 進行中のテーマ</h1>
          <p className="page-sub">
            いま何に着手していて、どこまで進んでいるか。完走しなかった取り組みも
            理由とセットで残しています。
          </p>
        </div>
        <div className="theme-head-actions">
          <Link className="btn btn-ghost" to="/ideas">
            💡 アイデア
          </Link>
          <Link className="btn btn-primary" to="/themes/new">
            ＋ テーマ登録
          </Link>
        </div>
      </div>

      <div className="theme-toolbar">
        <div className="theme-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="theme-filter-count">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <input
          className="input theme-search"
          placeholder="🔍 テーマ名・タグで検索…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {store.loading && <p className="dim">読み込み中…</p>}
      {!store.loading && visible.length === 0 && (
        <p className="empty">該当するテーマがありません。</p>
      )}

      <ul className="theme-list">
        {visible.map((t) => (
          <li key={t.id} className="theme-card">
            <Link to={`/themes/${t.id}`} className="theme-card-main">
              <div className="theme-card-head">
                <StatusPill theme={t} />
                <StalledPill theme={t} />
                {t.status === 'recruiting' && (
                  <span className="theme-pill theme-pill-recruit-cta">
                    実装者・協力者募集
                  </span>
                )}
              </div>
              <h2 className="theme-card-title">{t.title}</h2>
              <p className="theme-card-summary">{t.summary}</p>
              {t.latestProgress && (
                <p className="theme-card-progress">
                  <span className="theme-card-progress-label">最新の進捗</span>
                  {t.latestProgress}
                </p>
              )}
              <ProgressBar percent={t.latestProgressPercent} />
              {t.status === 'frozen' && t.freezeReason && (
                <p className="theme-card-freeze">🧊 {t.freezeReason}</p>
              )}
              <div className="theme-card-meta">
                <span>👤 {t.owner}</span>
                <span>👥 {t.memberCount}人</span>
                <span>📝 {t.entryCount}件</span>
                <span>最終更新 {fmtDate(t.lastProgressAt ?? t.updatedAt)}</span>
              </div>
              {t.tags.length > 0 && (
                <div className="theme-card-tags">
                  {t.tags.map((tag) => (
                    <span key={tag} className="qa-tag">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 詳細
// ─────────────────────────────────────────────────────────────
function TimelineItem({
  entry,
  onDelete,
}: {
  entry: ThemeEntry
  onDelete?: () => void
}) {
  if (entry.kind === 'system') {
    return (
      <li className="theme-entry theme-entry-system">
        <span className="theme-entry-dot" />
        <div className="theme-entry-body">
          <span className="theme-entry-system-text">{entry.body}</span>
          <span className="theme-entry-date">{fmtDate(entry.createdAt)}</span>
        </div>
      </li>
    )
  }
  return (
    <li className={`theme-entry theme-entry-${entry.kind}`}>
      <span className="theme-entry-dot" />
      <div className="theme-entry-body">
        <div className="theme-entry-head">
          <span className="theme-entry-kind">
            {entry.kind === 'progress' ? '📈 進捗' : '💬 コメント'}
          </span>
          <span className="theme-entry-author">{entry.author}</span>
          <span className="theme-entry-date">
            {new Date(entry.createdAt).toLocaleString('ja-JP')}
          </span>
          {entry.progressPercent != null && (
            <span className="theme-entry-percent">{entry.progressPercent}%</span>
          )}
          {entry.canEdit && onDelete && (
            <button className="res-action danger" onClick={onDelete}>
              削除
            </button>
          )}
        </div>
        <div className="theme-entry-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.body}</ReactMarkdown>
        </div>
      </div>
    </li>
  )
}

function ThemeDetail({ id }: { id: string }) {
  const store = useThemeStore()
  const navigate = useNavigate()
  const theme = store.themes.find((t) => t.id === id)

  const [entryKind, setEntryKind] = useState<'progress' | 'comment'>('progress')
  const [entryBody, setEntryBody] = useState('')
  const [percent, setPercent] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinMessage, setJoinMessage] = useState('')
  const [freezeOpen, setFreezeOpen] = useState(false)
  const [freezeReason, setFreezeReason] = useState('')
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState('')
  const [requests, setRequests] = useState<ThemeJoinRequest[]>([])
  const [error, setError] = useState('')

  const loadTheme = store.loadTheme
  const fetchJoinRequests = store.fetchJoinRequests

  useEffect(() => {
    void loadTheme(id)
  }, [id, loadTheme])

  const refreshRequests = useCallback(async () => {
    if (!theme?.canEdit) return
    try {
      setRequests(await fetchJoinRequests(id))
    } catch {
      /* 権限が無い場合などは黙って無視する */
    }
  }, [fetchJoinRequests, id, theme?.canEdit])

  useEffect(() => {
    void refreshRequests()
  }, [refreshRequests])

  if (!theme) {
    return (
      <div className="container section">
        <p className="empty">
          テーマが見つかりません。削除されたか、統合された可能性があります。
        </p>
        <Link className="back-link" to="/themes">
          ← テーマ一覧へ
        </Link>
      </div>
    )
  }

  const pending = requests.filter((r) => r.status === 'pending')

  async function submitEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!entryBody.trim()) return
    setError('')
    try {
      await store.addEntry(id, {
        kind: entryKind,
        body: entryBody.trim(),
        progressPercent: percent === '' ? null : Number(percent),
      })
      setEntryBody('')
      setPercent('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '投稿に失敗しました')
    }
  }

  async function doFreeze() {
    if (!freezeReason.trim()) {
      setError('凍結理由を入力してください。')
      return
    }
    await store.freeze(id, freezeReason.trim())
    setFreezeOpen(false)
    setFreezeReason('')
  }

  async function doMerge() {
    if (!mergeTarget) return
    await store.merge(id, mergeTarget)
    setMergeOpen(false)
    navigate(`/themes/${mergeTarget}`)
  }

  const mergeCandidates = store.themes.filter(
    (t) => t.id !== theme.id && t.status !== 'merged',
  )

  return (
    <div className="container section themes-page">
      <Link className="back-link" to="/themes">
        ← テーマ一覧へ
      </Link>

      <div className="theme-detail-head">
        <div className="theme-card-head">
          <StatusPill theme={theme} />
          <StalledPill theme={theme} />
        </div>
        <h1 className="page-title">{theme.title}</h1>
        <p className="page-sub">{theme.summary}</p>
        <div className="theme-card-meta">
          <span>👤 発起人 {theme.owner}</span>
          <span>👥 {theme.memberCount}人</span>
          <span>作成 {fmtDate(theme.createdAt)}</span>
          <span>最終進捗 {fmtDate(theme.lastProgressAt)}</span>
        </div>
      </div>

      {error && <p className="login-error">{error}</p>}

      {theme.status === 'merged' && theme.mergedInto && (
        <div className="theme-banner">
          🔗 このテーマは{' '}
          <Link to={`/themes/${theme.mergedInto}`}>{theme.mergedIntoTitle}</Link>{' '}
          に統合されました。進捗の記録は統合先にまとめられています。
        </div>
      )}

      {theme.status === 'frozen' && (
        <div className="theme-banner theme-banner-frozen">
          <strong>🧊 凍結中</strong>
          <p>{theme.freezeReason}</p>
          <span className="dim">凍結日 {fmtDate(theme.frozenAt)}</span>
        </div>
      )}

      {theme.status === 'done' && (
        <div className="theme-banner theme-banner-done">
          ✅ 完了しました。
          {theme.resultingTool ? (
            <>
              {' '}
              成果物:{' '}
              <Link to={`/tools/${theme.resultingTool}`}>
                {theme.resultingToolTitle}
              </Link>
            </>
          ) : (
            <>
              {' '}
              成果物がまだ未登録です。
              {theme.canEdit && (
                <Link className="btn btn-sm btn-primary theme-inline-cta" to="/tools/new">
                  ツールカタログに登録する
                </Link>
              )}
            </>
          )}
        </div>
      )}

      {theme.originIdea && (
        <p className="dim theme-origin">
          💡 このテーマは アイデア「
          <Link to={`/ideas/${theme.originIdea}`}>{theme.originIdeaTitle}</Link>
          」から始まりました。
        </p>
      )}

      <div className="theme-detail-grid">
        <div className="theme-detail-main">
          {theme.body && (
            <section className="card-panel theme-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{theme.body}</ReactMarkdown>
            </section>
          )}

          <section className="card-panel">
            <h2 className="comment-title">📜 軌跡（{theme.entryCount}件）</h2>
            <ul className="theme-timeline">
              {(theme.entries ?? []).map((e) => (
                <TimelineItem
                  key={e.id}
                  entry={e}
                  onDelete={() => void store.removeEntry(id, e.id)}
                />
              ))}
              {(theme.entries ?? []).length === 0 && (
                <li className="empty">まだ記録がありません。</li>
              )}
            </ul>

            {theme.status !== 'merged' && (
              <form className="theme-entry-form" onSubmit={submitEntry}>
                <div className="theme-entry-kind-row">
                  {theme.isMember && (
                    <label>
                      <input
                        type="radio"
                        checked={entryKind === 'progress'}
                        onChange={() => setEntryKind('progress')}
                      />
                      📈 進捗
                    </label>
                  )}
                  <label>
                    <input
                      type="radio"
                      checked={entryKind === 'comment'}
                      onChange={() => setEntryKind('comment')}
                    />
                    💬 コメント
                  </label>
                  {entryKind === 'progress' && (
                    <input
                      className="input theme-percent-input"
                      type="number"
                      min={0}
                      max={100}
                      placeholder="進捗%"
                      value={percent}
                      onChange={(e) => setPercent(e.target.value)}
                    />
                  )}
                </div>
                <textarea
                  className="input"
                  rows={4}
                  placeholder={
                    entryKind === 'progress'
                      ? 'できたこと・分かったこと・詰まっていること（Markdown可）'
                      : '助言や「それ自分もやっています」など（Markdown可）'
                  }
                  value={entryBody}
                  onChange={(e) => setEntryBody(e.target.value)}
                />
                <div className="res-form-actions">
                  <button className="btn btn-primary" type="submit">
                    投稿
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>

        <aside className="theme-detail-side">
          <section className="card-panel">
            <h3 className="filter-group-label">👥 メンバー</h3>
            <ul className="theme-member-list">
              {(theme.members ?? []).map((m) => (
                <li key={m.id}>
                  {m.name}
                  {m.role === 'owner' && <span className="theme-owner-tag">発起人</span>}
                </li>
              ))}
              {(theme.members ?? []).length === 0 && <li className="dim">—</li>}
            </ul>

            {!theme.isMember && theme.status !== 'merged' && (
              <>
                {theme.myJoinRequestStatus === 'pending' ? (
                  <p className="dim">🙋 参加申請中です。</p>
                ) : (
                  <button
                    className="btn btn-primary btn-block"
                    onClick={() => setJoinOpen(true)}
                  >
                    🤝 このテーマに合流する
                  </button>
                )}
              </>
            )}
            {theme.isMember && !theme.canEdit && (
              <button className="btn btn-ghost btn-block" onClick={() => void store.leave(id)}>
                離脱する
              </button>
            )}
          </section>

          {theme.canEdit && pending.length > 0 && (
            <section className="card-panel">
              <h3 className="filter-group-label">🙋 参加申請 {pending.length}件</h3>
              <ul className="theme-request-list">
                {pending.map((r) => (
                  <li key={r.id}>
                    <strong>{r.userName}</strong>
                    {r.message && <p className="dim">{r.message}</p>}
                    <div className="theme-request-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={async () => {
                          await store.resolveJoin(id, r.id, 'approved')
                          await refreshRequests()
                        }}
                      >
                        承認
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          await store.resolveJoin(id, r.id, 'rejected')
                          await refreshRequests()
                        }}
                      >
                        見送る
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {theme.canEdit && theme.status !== 'merged' && (
            <section className="card-panel">
              <h3 className="filter-group-label">⚙️ テーマの操作</h3>
              <div className="action-stack">
                <Link className="btn btn-ghost btn-block" to={`/themes/${id}/edit`}>
                  ✏️ 編集
                </Link>
                {theme.status === 'frozen' ? (
                  <button
                    className="btn btn-ghost btn-block"
                    onClick={() => void store.reopen(id)}
                  >
                    ▶️ 再開する
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost btn-block"
                    onClick={() => setFreezeOpen(true)}
                  >
                    🧊 凍結する
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-block"
                  onClick={() => setMergeOpen(true)}
                >
                  🔗 他のテーマに合流させる
                </button>
              </div>
            </section>
          )}

          {theme.workCategories.length > 0 && (
            <section className="card-panel">
              <h3 className="filter-group-label">業務シーン</h3>
              <div className="theme-card-tags">
                {theme.workCategories.map((c) => (
                  <span key={c} className="chip">
                    {categoryLabel(c)}
                  </span>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      {joinOpen && (
        <div className="modal-overlay" onClick={() => setJoinOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>🤝 このテーマに合流する</h3>
            <p className="dim">
              発起人が承認するとメンバーになり、進捗を書けるようになります。
            </p>
            <textarea
              className="input"
              rows={4}
              placeholder="できること・やりたいこと（任意）"
              value={joinMessage}
              onChange={(e) => setJoinMessage(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setJoinOpen(false)}>
                キャンセル
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await store.requestJoin(id, joinMessage)
                  setJoinOpen(false)
                  setJoinMessage('')
                }}
              >
                申請する
              </button>
            </div>
          </div>
        </div>
      )}

      {freezeOpen && (
        <div className="modal-overlay" onClick={() => setFreezeOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>🧊 テーマを凍結する</h3>
            <p className="dim">
              何が課題で止めたのかは、それ自体が部門の知見になります。理由は必須です。
            </p>
            <textarea
              className="input"
              rows={4}
              placeholder="例: FAQ の粒度が粗く、回答精度が実用水準に届かなかった"
              value={freezeReason}
              onChange={(e) => setFreezeReason(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setFreezeOpen(false)}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={doFreeze}>
                凍結する
              </button>
            </div>
          </div>
        </div>
      )}

      {mergeOpen && (
        <div className="modal-overlay" onClick={() => setMergeOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>🔗 他のテーマに合流させる</h3>
            <p className="dim">
              このテーマを選んだテーマに統合します。メンバーと進捗の記録は
              合流先へ引き継がれ、このテーマは「統合済み」になります。
            </p>
            <select
              className="input"
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
            >
              <option value="">合流先を選択…</option>
              {mergeCandidates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}（{t.owner}）
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setMergeOpen(false)}>
                キャンセル
              </button>
              <button className="btn btn-primary" disabled={!mergeTarget} onClick={doMerge}>
                合流させる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ThemesPage() {
  const { id } = useParams()
  return id ? <ThemeDetail id={id} /> : <ThemeList />
}
