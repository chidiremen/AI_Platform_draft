import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import DocsSidebar from '../components/DocsSidebar'
import MarkdownView from '../components/MarkdownView'
import MarkdownEditor from '../components/MarkdownEditor'
import ConfirmModal from '../components/ConfirmModal'
import QuestionFormModal from '../components/QuestionFormModal'
import AnswerFormModal from '../components/AnswerFormModal'
import { useDocsStore } from '../hooks/useDocs'
import { useApp } from '../store'
import type { Question } from '../types'

/**
 * Q&A ページ:
 *  /qa                一覧 + 検索/フィルタ
 *  /qa/new            質問投稿
 *  /qa/:id            質問詳細 + 回答
 *  /qa/:id/edit       質問編集
 */
export default function QAPage() {
  const { id, action } = useParams<{ id?: string; action?: string }>()
  const store = useDocsStore()
  const { categories, questions, addQuestion, ensureQuestion } = store
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const [askOpen, setAskOpen] = useState(false)
  // ローカルに無い質問IDを直リンクで開いたときの取得状態
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'missing'>('idle')

  const found = !!id && id !== 'new' && questions.some((q) => q.id === id)

  useEffect(() => {
    if (!id || id === 'new' || found) {
      setLookup('idle')
      return
    }
    let active = true
    setLookup('loading')
    ensureQuestion(id).then((r) => {
      if (active) setLookup(r === 'found' ? 'idle' : 'missing')
    })
    return () => {
      active = false
    }
  }, [id, found, ensureQuestion])

  const qaCategories = useMemo(
    () => categories.filter((c) => c.kind === 'qa'),
    [categories],
  )

  const itemsByCategory = useMemo(() => {
    const map: Record<number, { href: string; label: string; badge?: string }[]> = {}
    for (const c of qaCategories) {
      const count = questions.filter((q) => q.categoryId === c.id).length
      map[c.id] = [
        {
          href: `/qa?category=${c.slug}`,
          label: `一覧を表示`,
          badge: `${count}`,
        },
      ]
    }
    return map
  }, [questions, qaCategories])

  const activeQuestion = id ? questions.find((q) => q.id === id) : null

  const headerActions = (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={() => setAskOpen(true)}
    >
      ❓ 質問する
    </button>
  )

  return (
    <div className="docs-layout">
      <DocsSidebar
        title="💬 このページのQ&A"
        categories={qaCategories}
        items={itemsByCategory}
        headerActions={headerActions}
        uncategorized={[
          {
            href: '/qa',
            label: 'すべての質問',
            badge: `${questions.length}`,
            activeCheck: (p) => p === '/qa' && !search.get('category'),
          },
          {
            href: '/qa?resolved=false',
            label: '未解決のみ',
            badge: `${questions.filter((q) => !q.isResolved).length}`,
          },
          {
            href: '/qa?mine=1',
            label: '自分の質問',
          },
        ]}
        uncategorizedLabel="表示切替"
      />
      <main className="docs-main">
        {id === 'new' ? (
          <QuestionEditor mode="create" />
        ) : action === 'edit' && activeQuestion ? (
          <QuestionEditor mode="edit" questionId={activeQuestion.id} />
        ) : activeQuestion ? (
          <QuestionDetail questionId={activeQuestion.id} />
        ) : lookup === 'loading' ? (
          <div className="empty">読み込み中…</div>
        ) : id && id !== 'new' ? (
          <div className="empty">
            指定された質問は見つかりませんでした（削除された可能性があります）。
            <div style={{ marginTop: 12 }}>
              <Link to="/qa" className="btn btn-sm">
                ← Q&A一覧へ戻る
              </Link>
            </div>
          </div>
        ) : (
          <QuestionList onAskClick={() => setAskOpen(true)} />
        )}
      </main>
      {askOpen && (
        <QuestionFormModal
          categories={qaCategories}
          onSubmit={async (input) => {
            const newId = await addQuestion(input)
            navigate(`/qa/${newId}`)
          }}
          onClose={() => setAskOpen(false)}
        />
      )}
    </div>
  )
}

// ────── 一覧 ──────

function QuestionList({ onAskClick }: { onAskClick: () => void }) {
  const store = useDocsStore()
  const { questions, categories } = store
  const { currentUser } = useApp()
  const [search] = useSearchParams()
  const catSlug = search.get('category')
  const resolvedParam = search.get('resolved')
  const mineParam = search.get('mine')
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    let l = [...questions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (catSlug) l = l.filter((x) => x.categorySlug === catSlug)
    if (resolvedParam === 'true') l = l.filter((x) => x.isResolved)
    if (resolvedParam === 'false') l = l.filter((x) => !x.isResolved)
    if (mineParam === '1' && currentUser)
      l = l.filter((x) => x.asker === currentUser.name)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      l = l.filter(
        (x) =>
          x.title.toLowerCase().includes(s) ||
          x.body.toLowerCase().includes(s) ||
          x.tags.some((t) => t.toLowerCase().includes(s)),
      )
    }
    return l
  }, [questions, catSlug, resolvedParam, mineParam, q, currentUser])

  const activeCat = catSlug
    ? categories.find((c) => c.slug === catSlug && c.kind === 'qa')
    : null

  return (
    <div>
      <h1 className="page-title">💬 このページのQ&A</h1>
      <p className="page-sub">
        {activeCat ? (
          <>
            カテゴリ: <strong>{activeCat.icon} {activeCat.name}</strong>
            <Link to="/qa" style={{ marginLeft: 12 }}>
              × すべて表示
            </Link>
          </>
        ) : mineParam === '1' ? (
          <>
            <strong>自分の質問</strong> のみ表示中
            <Link to="/qa" style={{ marginLeft: 12 }}>× 解除</Link>
          </>
        ) : resolvedParam === 'false' ? (
          <>
            <strong>未解決のみ</strong> 表示中
            <Link to="/qa" style={{ marginLeft: 12 }}>× 解除</Link>
          </>
        ) : (
          <>質問を投稿するには右上「❓ 質問する」から</>
        )}
      </p>

      <div className="qa-toolbar">
        <input
          className="input"
          placeholder="🔍 タイトル・本文・タグを検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-primary" onClick={onAskClick}>
          ❓ 質問する
        </button>
      </div>

      <div className="qa-list">
        {list.length === 0 && <div className="empty">該当する質問はありません。</div>}
        {list.map((x) => (
          <QuestionCard key={x.id} question={x} />
        ))}
      </div>
    </div>
  )
}

function QuestionCard({ question: x }: { question: Question }) {
  return (
    <Link to={`/qa/${x.id}`} className="qa-card">
      <div className="qa-card-head">
        <span className={`qa-status ${x.isResolved ? 'resolved' : 'open'}`}>
          {x.isResolved ? '✅ 解決済' : '❓ 未解決'}
        </span>
        {x.categoryName && (
          <span className="qa-cat-pill">
            {x.categoryName}
          </span>
        )}
        <span className="qa-meta">💬 {x.answerCount}</span>
        <span className="qa-meta">👁 {x.viewCount}</span>
      </div>
      <div className="qa-card-title">{x.title}</div>
      <div className="qa-card-snippet">{x.body.slice(0, 140)}{x.body.length > 140 ? '…' : ''}</div>
      <div className="qa-card-foot">
        <span>by {x.asker}</span>
        <span className="dim">{x.createdAt.slice(0, 10)}</span>
        {x.tags.length > 0 && (
          <span>
            {x.tags.map((t) => (
              <span key={t} className="qa-tag">#{t}</span>
            ))}
          </span>
        )}
      </div>
    </Link>
  )
}

// ────── 詳細 ──────

function QuestionDetail({ questionId }: { questionId: string }) {
  const store = useDocsStore()
  const { currentUser } = useApp()
  const {
    categories,
    questions,
    isAdmin,
    addAnswer,
    updateAnswer,
    deleteAnswer,
    acceptAnswer,
    deleteQuestion,
    updateQuestion,
    toggleResolved,
  } = store
  const navigate = useNavigate()
  const q = questions.find((x) => x.id === questionId)!
  // モーダル状態
  const [answerOpen, setAnswerOpen] = useState(false)
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null)
  const [editQuestionOpen, setEditQuestionOpen] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const canEditQuestion = isAdmin || q.asker === currentUser?.name
  const canAcceptAnswer = isAdmin || q.asker === currentUser?.name
  const canEditAnswer = (aAuthor: string) => isAdmin || aAuthor === currentUser?.name
  const editingAnswer = editingAnswerId
    ? (q.answers ?? []).find((a) => a.id === editingAnswerId)
    : undefined

  return (
    <div className="qa-detail">
      <div className="guide-crumb">
        <Link to="/qa">💬 このページのQ&A</Link>
        {q.categoryName && <span> / {q.categoryName}</span>}
      </div>

      <div className="qa-detail-head">
        <h1 className="page-title" style={{ marginBottom: 4 }}>{q.title}</h1>
        <div className="qa-meta-row">
          <span className={`qa-status ${q.isResolved ? 'resolved' : 'open'}`}>
            {q.isResolved ? '✅ 解決済' : '❓ 未解決'}
          </span>
          <span>by {q.asker}</span>
          <span className="dim">{q.createdAt.slice(0, 10)}</span>
          <span className="dim">👁 {q.viewCount}</span>
          {q.tags.length > 0 && (
            <span>
              {q.tags.map((t) => (
                <span key={t} className="qa-tag">#{t}</span>
              ))}
            </span>
          )}
        </div>
      </div>

      <div className="card-panel">
        <MarkdownView source={q.body} />
      </div>

      {canEditQuestion && (
        <div className="guide-actions">
          <button className="btn btn-sm" onClick={() => setEditQuestionOpen(true)}>
            ✏️ 編集
          </button>
          <button
            className="btn btn-sm"
            onClick={() => toggleResolved(q.id)}
            title="解決済みフラグをトグル"
          >
            {q.isResolved ? '↩ 未解決に戻す' : '✅ 解決済にする'}
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => setShowDelete(true)}>
            🗑️ 削除
          </button>
        </div>
      )}

      <h2 className="section-title">💬 回答 ({q.answerCount})</h2>
      <div className="qa-answers">
        {(q.answers ?? []).map((a) => (
          <div key={a.id} className={`qa-answer ${a.isAccepted ? 'accepted' : ''}`}>
            <div className="qa-answer-head">
              {a.isAccepted && <span className="qa-accept-badge">✅ ベストアンサー</span>}
              <span>by <strong>{a.author}</strong></span>
              <span className="dim">{a.createdAt.slice(0, 10)}</span>
            </div>
            <div className="card-panel">
              <MarkdownView source={a.body} />
            </div>
            <div className="qa-answer-actions">
              {canAcceptAnswer && (
                <button
                  className={`btn btn-sm ${a.isAccepted ? 'btn-primary' : ''}`}
                  onClick={() => acceptAnswer(q.id, a.id)}
                >
                  {a.isAccepted ? '✅ ベストアンサー' : '☆ ベストにする'}
                </button>
              )}
              {canEditAnswer(a.author) && (
                <>
                  <button
                    className="btn btn-sm"
                    onClick={() => setEditingAnswerId(a.id)}
                  >
                    ✏️ 編集
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => deleteAnswer(q.id, a.id)}
                  >
                    🗑️
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {(q.answers ?? []).length === 0 && (
          <div className="empty">まだ回答はありません。</div>
        )}
      </div>

      {isAdmin ? (
        <div className="qa-answer-cta">
          <button className="btn btn-primary btn-lg" onClick={() => setAnswerOpen(true)}>
            ✍️ 回答を投稿
          </button>
        </div>
      ) : (
        <div className="qa-answer-note">
          回答の投稿は「ツール管理者 / 組織管理者」ロールのユーザーのみ可能です。
        </div>
      )}

      {/* 回答投稿モーダル (新規) */}
      {answerOpen && (
        <AnswerFormModal
          questionTitle={q.title}
          onSubmit={async (body) => {
            await addAnswer(q.id, body)
          }}
          onClose={() => setAnswerOpen(false)}
        />
      )}

      {/* 回答編集モーダル */}
      {editingAnswer && (
        <AnswerFormModal
          questionTitle={q.title}
          initialBody={editingAnswer.body}
          onSubmit={async (body) => {
            await updateAnswer(q.id, editingAnswer.id, body)
          }}
          onClose={() => setEditingAnswerId(null)}
        />
      )}

      {/* 質問編集モーダル */}
      {editQuestionOpen && (
        <QuestionFormModal
          initial={q}
          categories={categories}
          onSubmit={async (input) => {
            await updateQuestion(q.id, input)
          }}
          onClose={() => setEditQuestionOpen(false)}
        />
      )}

      {showDelete && (
        <ConfirmModal
          title="質問削除"
          message={`「${q.title}」を削除します。回答も一緒に削除されます。`}
          confirmLabel="削除する"
          danger
          onConfirm={async () => {
            await deleteQuestion(q.id)
            navigate('/qa')
          }}
          onClose={() => setShowDelete(false)}
        />
      )}
    </div>
  )
}

// ────── 質問投稿 / 編集 ──────

function QuestionEditor({ mode, questionId }: { mode: 'create' | 'edit'; questionId?: string }) {
  const store = useDocsStore()
  const { currentUser } = useApp()
  const { categories, questions, addQuestion, updateQuestion, isAdmin } = store
  const navigate = useNavigate()
  const initial = mode === 'edit' ? questions.find((q) => q.id === questionId) : undefined
  const qaCats = categories.filter((c) => c.kind === 'qa')

  const canEdit =
    mode === 'create' || isAdmin || initial?.asker === currentUser?.name
  if (!canEdit) return <Navigate to="/qa" replace />

  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [categoryId, setCategoryId] = useState<number | null>(initial?.categoryId ?? qaCats[0]?.id ?? null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim() || !body.trim()) {
      setError('タイトルと本文は必須です')
      return
    }
    const tagsArr = tags.split(',').map((t) => t.trim()).filter(Boolean)
    setSubmitting(true)
    try {
      if (mode === 'create') {
        const id = await addQuestion({
          categoryId,
          title: title.trim(),
          body,
          tags: tagsArr,
        })
        navigate(`/qa/${id}`)
      } else if (initial) {
        await updateQuestion(initial.id, {
          title: title.trim(),
          body,
          categoryId,
          tags: tagsArr,
        })
        navigate(`/qa/${initial.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1 className="page-title">
        {mode === 'create' ? '❓ 質問を投稿' : '✏️ 質問を編集'}
      </h1>
      <form onSubmit={onSubmit} className="card-panel" noValidate>
        <label className="label">タイトル *</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: xxx の使い方が分かりません"
        />
        <div style={{ height: 12 }} />
        <label className="label">カテゴリ</label>
        <select
          className="select"
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">（未分類）</option>
          {qaCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <div style={{ height: 12 }} />
        <label className="label">本文 (Markdown) *</label>
        <MarkdownEditor value={body} onChange={setBody} />
        <div style={{ height: 12 }} />
        <label className="label">タグ (カンマ区切り)</label>
        <input
          className="input"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="例: 登録, 効果"
        />
        {error && (
          <div className="login-error" style={{ whiteSpace: 'pre-line' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            キャンセル
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '保存中…' : mode === 'create' ? '投稿' : '更新'}
          </button>
        </div>
      </form>
    </div>
  )
}
