import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ConfirmModal from '../components/ConfirmModal'
import ThreadFormModal from '../components/ThreadFormModal'
import ResBody, { formatResDate } from '../components/ResBody'
import { FORUM_CATEGORIES, FORUM_CATEGORY_MAP, useForumStore } from '../hooks/useForum'
import { useApp } from '../store'
import type { ForumCategory, ForumThread } from '../types'
import type { ForumSort } from '../api'
import { scrollIntoViewSafe } from '../utils/scroll'

/**
 * アイデアフォーラム（2ch 風）。
 *   /forum        スレ一覧
 *   /forum/:id    スレ詳細（レス閲覧・投稿）
 */
export default function ForumPage() {
  const { id } = useParams<{ id?: string }>()
  return id ? <ThreadView threadId={id} /> : <ThreadList />
}

// ══════════════════════════ スレ一覧 ══════════════════════════

/** 固定ハンドルを覚えておく localStorage キー */
const FORUM_NAME_KEY = 'aitc_forum_poster_name_v1'

/** 管理者の「投稿者を特定」モーダルの状態 */
interface RevealState {
  loading: boolean
  /** 特定対象の表示名（名無し表記 or ハンドル） */
  displayName: string
  /** 特定された実ユーザー */
  user?: string
  posterId?: string
  error?: string
}

function ThreadList() {
  const store = useForumStore()
  const { threads } = store
  const { currentUser } = useApp()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const [q, setQ] = useState('')
  const [newOpen, setNewOpen] = useState(false)

  const cat = (search.get('category') ?? '') as ForumCategory | ''
  const sort = (search.get('sort') ?? 'latest') as ForumSort
  const mine = search.get('mine') === '1'

  const list = useMemo(() => {
    let l = [...threads]
    if (cat) l = l.filter((t) => t.category === cat)
    if (mine && currentUser) l = l.filter((t) => t.isMine)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      l = l.filter(
        (t) =>
          t.title.toLowerCase().includes(s) ||
          t.body.toLowerCase().includes(s) ||
          t.tags.some((x) => x.toLowerCase().includes(s)),
      )
    }
    const lastAt = (t: ForumThread) => t.lastPostedAt ?? t.createdAt
    l.sort((a, b) => {
      // 固定スレは常に上
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      if (sort === 'new') return b.createdAt.localeCompare(a.createdAt)
      if (sort === 'votes') return b.voteCount - a.voteCount
      if (sort === 'posts') return b.postCount - a.postCount
      return lastAt(b).localeCompare(lastAt(a))
    })
    return l
  }, [threads, cat, sort, mine, q, currentUser])

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(search)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearch(next)
  }

  return (
    <div className="container section forum-page">
      <div className="forum-head">
        <div>
          <h1 className="page-title">🧵 アイデアフォーラム</h1>
          <p className="page-sub">
            「こんなツールが欲しい」を投下して、みんなで議論する場所です。
          </p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setNewOpen(true)}>
          ＋ スレッドを立てる
        </button>
      </div>

      {/* フィルタ・ソート */}
      <div className="forum-toolbar">
        <input
          className="input forum-search"
          placeholder="🔍 スレタイ・本文・タグを検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="forum-filter-row">
          <span className="filter-group-label">板</span>
          <button
            className={`chip ${!cat ? 'active' : ''}`}
            onClick={() => setParam('category', null)}
          >
            すべて
          </button>
          {FORUM_CATEGORIES.map((c) => (
            <button
              key={c.value}
              className={`chip ${cat === c.value ? 'active' : ''}`}
              onClick={() => setParam('category', c.value)}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        <div className="forum-filter-row">
          <span className="filter-group-label">並び</span>
          {(
            [
              ['latest', '最終レス'],
              ['new', '新着'],
              ['votes', '👍 多い'],
              ['posts', 'レス多い'],
            ] as [ForumSort, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              className={`chip ${sort === v ? 'active' : ''}`}
              onClick={() => setParam('sort', v)}
            >
              {label}
            </button>
          ))}
          <label className="incoming-toggle" style={{ marginLeft: 10 }}>
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => setParam('mine', e.target.checked ? '1' : null)}
            />
            自分のスレのみ
          </label>
        </div>
      </div>

      <div className="forum-count">{list.length} 件のスレッド</div>

      {/* スレ一覧（2ch のスレ一覧風） */}
      <ol className="thread-list">
        {list.map((t, i) => {
          const c = FORUM_CATEGORY_MAP[t.category]
          return (
            <li key={t.id} className={`thread-row ${t.isPinned ? 'pinned' : ''}`}>
              <span className="thread-num">{i + 1}:</span>
              <div className="thread-main">
                <Link to={`/forum/${t.id}`} className="thread-title">
                  {t.isPinned && <span className="thread-pin">📌</span>}
                  {t.title}
                  <span className="thread-res-count">({t.postCount + 1})</span>
                  {t.isClosed && <span className="thread-closed">[停止中]</span>}
                </Link>
                <div className="thread-meta">
                  <span className="thread-board">
                    {c.icon} {c.label}
                  </span>
                  <button
                    className={`thread-vote ${t.votedByMe ? 'voted' : ''}`}
                    onClick={() => store.voteThread(t.id)}
                    title="ほしい！"
                  >
                    👍 {t.voteCount}
                  </button>
                  <span className="dim">👁 {t.viewCount}</span>
                  <span className="dim">
                    {t.displayName}・
                    {formatResDate(t.lastPostedAt ?? t.createdAt)}
                  </span>
                  {t.tags.map((tag) => (
                    <span key={tag} className="qa-tag">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
        {list.length === 0 && (
          <li className="empty">
            該当するスレッドはありません。「＋ スレッドを立てる」から投稿できます。
          </li>
        )}
      </ol>

      {newOpen && (
        <ThreadFormModal
          onSubmit={async (input) => {
            const newId = await store.addThread(input)
            navigate(`/forum/${newId}`)
          }}
          onClose={() => setNewOpen(false)}
        />
      )}
    </div>
  )
}

// ══════════════════════════ スレ詳細 ══════════════════════════

function ThreadView({ threadId }: { threadId: string }) {
  const store = useForumStore()
  const navigate = useNavigate()
  const found = store.threads.find((x) => x.id === threadId)

  const [reply, setReply] = useState('')
  // 名乗る名前。空欄なら名無し。@付きは固定ハンドルとして次回以降も引き継ぐ。
  const [posterName, setPosterName] = useState(() => {
    try {
      return localStorage.getItem(FORUM_NAME_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [editOpen, setEditOpen] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [reveal, setReveal] = useState<RevealState | null>(null)

  /** 管理者のみ: 投稿者を特定してモーダルに出す（監査ログに残る操作） */
  async function doReveal(
    target: 'thread' | 'post',
    id: string,
    displayName: string,
  ) {
    setReveal({ loading: true, displayName })
    try {
      const r = await store.revealPoster(target, id)
      setReveal(
        r
          ? { loading: false, displayName: r.displayName, user: r.user, posterId: r.posterId }
          : { loading: false, displayName, error: '特定できませんでした' },
      )
    } catch (e) {
      setReveal({
        loading: false,
        displayName,
        error: e instanceof Error ? e.message : '特定に失敗しました',
      })
    }
  }

  // 実APIモードではレス込みの詳細を取得
  useEffect(() => {
    void store.loadThread(threadId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  if (!found) {
    return (
      <div className="container section">
        <p className="empty">スレッドが見つかりません。</p>
        <Link to="/forum">← フォーラムに戻る</Link>
      </div>
    )
  }
  // 以降 undefined でないことが確定した参照（クロージャ内でも安全）
  const t = found

  const posts = t.posts ?? []
  // 権限はサーバ（モックでは store）が算出した can_edit を使う。
  // 匿名掲示板なので投稿者名から判定してはいけない。
  const canEditThread = t.canEdit
  const cat = FORUM_CATEGORY_MAP[t.category]

  // >>N ポップアップ用の辞書（1 = スレ本文）
  const bodyByNumber: Record<number, { body: string; author: string }> = {
    1: { body: t.body, author: t.displayName },
  }
  for (const p of posts) bodyByNumber[p.number] = { body: p.body, author: p.displayName }

  /** 「>>N」を返信欄に挿入する */
  function quote(n: number) {
    setReply((prev) => (prev ? `${prev}\n>>${n}\n` : `>>${n}\n`))
    scrollIntoViewSafe(document.getElementById('forum-reply-box'), {
      behavior: 'smooth',
    })
  }

  async function submitReply() {
    if (!reply.trim()) return
    setPosting(true)
    try {
      await store.addPost(t.id, reply, posterName)
      setReply('')
      // @付き（固定ハンドル）は次回のためにローカルにも残す
      try {
        const n = posterName.trim()
        if (n.startsWith('@')) localStorage.setItem(FORUM_NAME_KEY, n)
        else if (!n) localStorage.removeItem(FORUM_NAME_KEY)
      } catch {
        /* ignore */
      }
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="container section forum-page">
      <div className="forum-crumb">
        <Link to="/forum">🧵 アイデアフォーラム</Link>
        <span>
          {' '}
          / {cat.icon} {cat.label}
        </span>
      </div>

      <h1 className="thread-view-title">
        {t.isPinned && <span className="thread-pin">📌</span>}
        {t.title}
      </h1>
      <div className="thread-view-meta">
        <button
          className={`thread-vote ${t.votedByMe ? 'voted' : ''}`}
          onClick={() => store.voteThread(t.id)}
        >
          👍 ほしい！ {t.voteCount}
        </button>
        <span className="dim">全 {posts.length + 1} レス</span>
        <span className="dim">👁 {t.viewCount}</span>
        {t.isClosed && <span className="thread-closed">[レス受付停止中]</span>}
        {t.tags.map((tag) => (
          <span key={tag} className="qa-tag">
            #{tag}
          </span>
        ))}
      </div>

      {/* レス一覧（2ch 風） */}
      <div className="res-list">
        {/* 1レス目 = スレ本文 */}
        <ResItem
          id="res-1"
          number={1}
          author={t.displayName}
          isHandle={t.isHandle}
          posterId={t.posterId}
          onReveal={
            store.isAdmin ? () => doReveal('thread', t.id, t.displayName) : undefined
          }
          createdAt={t.createdAt}
          body={t.body}
          bodyByNumber={bodyByNumber}
          isOp
          onQuote={() => quote(1)}
          actions={
            canEditThread ? (
              <>
                <button className="res-action" onClick={() => setEditOpen(true)}>
                  編集
                </button>
                <button className="res-action danger" onClick={() => setShowDelete(true)}>
                  削除
                </button>
                <button className="res-action" onClick={() => store.toggleClosed(t.id)}>
                  {t.isClosed ? 'レス再開' : 'レス停止'}
                </button>
                {store.isAdmin && (
                  <button className="res-action" onClick={() => store.togglePinned(t.id)}>
                    {t.isPinned ? '固定解除' : '固定'}
                  </button>
                )}
              </>
            ) : null
          }
        />

        {posts.map((p) => (
          <ResItem
            key={p.id}
            id={`res-${p.number}`}
            number={p.number}
            author={p.displayName}
            isHandle={p.isHandle}
            posterId={p.posterId}
            onReveal={
              store.isAdmin ? () => doReveal('post', p.id, p.displayName) : undefined
            }
            createdAt={p.createdAt}
            body={p.body}
            bodyByNumber={bodyByNumber}
            onQuote={() => quote(p.number)}
            editing={editingPostId === p.id}
            editingBody={editingBody}
            onEditingBodyChange={setEditingBody}
            onEditCancel={() => setEditingPostId(null)}
            onEditSave={async () => {
              await store.updatePost(t.id, p.id, editingBody)
              setEditingPostId(null)
            }}
            actions={
              p.canEdit ? (
                <>
                  <button
                    className="res-action"
                    onClick={() => {
                      setEditingPostId(p.id)
                      setEditingBody(p.body)
                    }}
                  >
                    編集
                  </button>
                  <button
                    className="res-action danger"
                    onClick={() => store.deletePost(t.id, p.id)}
                  >
                    削除
                  </button>
                </>
              ) : null
            }
          />
        ))}
      </div>

      {/* 返信フォーム */}
      <div className="res-form" id="forum-reply-box">
        {t.isClosed && !store.isAdmin ? (
          <div className="qa-answer-note">
            このスレッドはレス受付を停止しています。
          </div>
        ) : (
          <>
            <div className="res-form-head">
              <strong>✍️ レスを書く</strong>
              <span className="dim">
                <code>&gt;&gt;2</code> でレス参照、<code>```</code> でコード
              </span>
            </div>
            <div className="res-name-row">
              <label className="res-name-label" htmlFor="forum-poster-name">
                名前
              </label>
              <input
                id="forum-poster-name"
                className="input res-name-input"
                value={posterName}
                onChange={(e) => setPosterName(e.target.value)}
                placeholder={`空欄で「${t.anonName}」`}
                maxLength={50}
              />
              <span className="dim res-name-hint">
                空欄=名無し ／ <code>@名前</code> で固定ハンドル
              </span>
            </div>
            <textarea
              className="textarea res-textarea"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="本文を入力（Ctrl+Enter で投稿）"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  void submitReply()
                }
              }}
              style={{ minHeight: 120 }}
            />
            <div className="res-form-actions">
              <button
                className="btn btn-primary"
                onClick={submitReply}
                disabled={posting || !reply.trim()}
              >
                {posting ? '書き込み中…' : '書き込む'}
              </button>
            </div>
          </>
        )}
      </div>

      {editOpen && (
        <ThreadFormModal
          initial={t}
          onSubmit={async (input) => {
            await store.updateThread(t.id, input)
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
      {showDelete && (
        <ConfirmModal
          title="スレッド削除"
          message={`「${t.title}」を削除します。レスも全て削除されます。`}
          confirmLabel="削除する"
          danger
          onConfirm={async () => {
            await store.deleteThread(t.id)
            navigate('/forum')
          }}
          onClose={() => setShowDelete(false)}
        />
      )}

      {/* 管理者限定: 投稿者の特定結果 */}
      {reveal && (
        <div className="modal-overlay" onClick={() => setReveal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>🔍 投稿者の特定</h3>
            <div className="reveal-note">
              匿名掲示板のため通常は投稿者を表示しません。この操作は
              <strong>監査ログに記録されます</strong>。
            </div>
            {reveal.loading ? (
              <p>照会中…</p>
            ) : reveal.error ? (
              <div className="login-error">{reveal.error}</div>
            ) : (
              <table className="reveal-table">
                <tbody>
                  <tr>
                    <th>表示名</th>
                    <td>{reveal.displayName}</td>
                  </tr>
                  <tr>
                    <th>投稿ID</th>
                    <td>
                      <code>{reveal.posterId}</code>
                    </td>
                  </tr>
                  <tr>
                    <th>実際の投稿者</th>
                    <td>
                      <strong>{reveal.user}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setReveal(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 個々のレス ──

function ResItem({
  id,
  number,
  author,
  isHandle = false,
  posterId,
  onReveal,
  createdAt,
  body,
  bodyByNumber,
  isOp = false,
  actions,
  onQuote,
  editing = false,
  editingBody = '',
  onEditingBodyChange,
  onEditCancel,
  onEditSave,
}: {
  id: string
  number: number
  author: string
  /** 固定ハンドル（@付き）なら色を変える */
  isHandle?: boolean
  posterId: string
  /** 管理者のみ: 投稿者を特定する（未指定なら操作を出さない） */
  onReveal?: () => void
  createdAt: string
  body: string
  bodyByNumber: Record<number, { body: string; author: string }>
  isOp?: boolean
  actions?: React.ReactNode
  onQuote: () => void
  editing?: boolean
  editingBody?: string
  onEditingBodyChange?: (v: string) => void
  onEditCancel?: () => void
  onEditSave?: () => void
}) {
  return (
    <article className={`res-item ${isOp ? 'op' : ''}`} id={id}>
      <div className="res-head">
        <button className="res-number" onClick={onQuote} title="このレスに返信">
          {number}
        </button>
        <span className="res-name-label">名前：</span>
        <span className={`res-name${isHandle ? ' handle' : ''}`}>{author}</span>
        {isOp && <span className="res-op-badge">スレ主</span>}
        <span className="res-date">{formatResDate(createdAt)}</span>
        <span className="res-id">ID:{posterId}</span>
        {onReveal && (
          <button
            type="button"
            className="res-reveal"
            onClick={onReveal}
            title="投稿者を特定する（管理者のみ・操作は監査ログに記録されます）"
          >
            🔍
          </button>
        )}
        <span className="res-actions">{actions}</span>
      </div>
      {editing ? (
        <div className="res-edit">
          <textarea
            className="textarea res-textarea"
            value={editingBody}
            onChange={(e) => onEditingBodyChange?.(e.target.value)}
            style={{ minHeight: 100 }}
          />
          <div className="res-form-actions">
            <button className="btn btn-ghost btn-sm" onClick={onEditCancel}>
              キャンセル
            </button>
            <button className="btn btn-primary btn-sm" onClick={onEditSave}>
              更新
            </button>
          </div>
        </div>
      ) : (
        <ResBody body={body} bodyByNumber={bodyByNumber} />
      )}
    </article>
  )
}
