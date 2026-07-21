import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import DocsSidebar from '../components/DocsSidebar'
import MarkdownView from '../components/MarkdownView'
import MarkdownEditor from '../components/MarkdownEditor'
import ConfirmModal from '../components/ConfirmModal'
import { useDocsStore } from '../hooks/useDocs'

/**
 * ガイドページのシェル。
 *  - /guide           トップ（歓迎メッセージ + 最新ガイド）
 *  - /guide/new       新規作成（admin/tool_admin のみ）
 *  - /guide/:slug     詳細
 *  - /guide/:slug/edit 編集
 */
export default function GuidePage() {
  const { slug, action } = useParams<{ slug?: string; action?: string }>()
  const store = useDocsStore()
  const { categories, guides, isAdmin } = store
  const navigate = useNavigate()

  const guideCategories = useMemo(
    () => categories.filter((c) => c.kind === 'guide'),
    [categories],
  )

  const itemsByCategory = useMemo(() => {
    const map: Record<number, { href: string; label: string }[]> = {}
    for (const g of guides) {
      ;(map[g.categoryId] ??= []).push({
        href: `/guide/${g.slug}`,
        label: g.title,
      })
    }
    return map
  }, [guides])

  const currentGuide = useMemo(
    () => (slug ? guides.find((g) => g.slug === slug) : undefined),
    [guides, slug],
  )

  const headerActions = isAdmin ? (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={() => navigate('/guide/new')}
    >
      ＋ 新規ガイド
    </button>
  ) : null

  return (
    <div className="docs-layout">
      <DocsSidebar
        title="📚 プラットフォーム ガイド"
        categories={guideCategories}
        items={itemsByCategory}
        headerActions={headerActions}
      />
      <main className="docs-main">
        {slug === 'new' ? (
          <GuideEditor mode="create" />
        ) : action === 'edit' && currentGuide ? (
          <GuideEditor mode="edit" guideId={currentGuide.id} />
        ) : currentGuide ? (
          <GuideDetail guideId={currentGuide.id} />
        ) : (
          <GuideLanding />
        )}
      </main>
    </div>
  )
}

// ────── 詳細 ──────

function GuideDetail({ guideId }: { guideId: string }) {
  const store = useDocsStore()
  const { guides, isAdmin, deleteGuide } = store
  const g = guides.find((x) => x.id === guideId)!
  const navigate = useNavigate()
  const [showDelete, setShowDelete] = useState(false)
  const cat = store.categories.find((c) => c.id === g.categoryId)

  return (
    <article className="guide-article">
      <div className="guide-crumb">
        <Link to="/guide">📚 ガイド</Link>
        {cat && <span> / {cat.icon} {cat.name}</span>}
      </div>
      <h1 className="guide-title">{g.title}</h1>
      <div className="guide-meta">
        by {g.author} · {g.createdAt.slice(0, 10)}
        {g.updatedAt !== g.createdAt && ` · 更新: ${g.updatedAt.slice(0, 10)}`}
      </div>
      <div className="card-panel">
        <MarkdownView source={g.body} />
      </div>
      {isAdmin && (
        <div className="guide-actions">
          <button
            className="btn btn-sm"
            onClick={() => navigate(`/guide/${g.slug}/edit`)}
          >
            ✏️ 編集
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => setShowDelete(true)}
          >
            🗑️ 削除
          </button>
        </div>
      )}
      {showDelete && (
        <ConfirmModal
          title="ガイド削除"
          message={`「${g.title}」を削除します。よろしいですか？`}
          confirmLabel="削除する"
          danger
          onConfirm={async () => {
            await deleteGuide(g.id)
            navigate('/guide')
          }}
          onClose={() => setShowDelete(false)}
        />
      )}
    </article>
  )
}

// ────── ランディング ──────

function GuideLanding() {
  const { guides, categories } = useDocsStore()
  const guideCats = categories.filter((c) => c.kind === 'guide')
  return (
    <div className="guide-landing">
      <h1 className="page-title">📚 プラットフォーム ガイド</h1>
      <p className="page-sub">
        左のインデックスから記事を選んでください。よく参照される項目:
      </p>
      <div className="guide-landing-grid">
        {guideCats.map((c) => {
          const items = guides.filter((g) => g.categoryId === c.id).slice(0, 4)
          return (
            <div key={c.id} className="card-panel guide-landing-card">
              <h3>
                {c.icon} {c.name}
              </h3>
              <ul>
                {items.map((g) => (
                  <li key={g.id}>
                    <Link to={`/guide/${g.slug}`}>{g.title}</Link>
                  </li>
                ))}
                {items.length === 0 && <li className="dim">記事がありません</li>}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ────── 編集フォーム（新規 / 更新兼用） ──────

function GuideEditor({ mode, guideId }: { mode: 'create' | 'edit'; guideId?: string }) {
  const store = useDocsStore()
  const { isAdmin, categories, guides, addGuide, updateGuide } = store
  const navigate = useNavigate()
  const initial = mode === 'edit' ? guides.find((g) => g.id === guideId) : undefined
  const guideCats = categories.filter((c) => c.kind === 'guide')

  const [title, setTitle] = useState(initial?.title ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [categoryId, setCategoryId] = useState<number>(
    initial?.categoryId ?? guideCats[0]?.id ?? 0,
  )
  const [body, setBody] = useState(initial?.body ?? '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isAdmin) return <Navigate to="/guide" replace />

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim() || !slug.trim() || !body.trim()) {
      setError('タイトル / スラッグ / 本文は必須です')
      return
    }
    if (!categoryId) {
      setError('カテゴリを選んでください')
      return
    }
    setSubmitting(true)
    try {
      if (mode === 'create') {
        await addGuide({ categoryId, title: title.trim(), slug: slug.trim(), body })
        navigate(`/guide/${slug.trim()}`)
      } else if (initial) {
        await updateGuide(initial.id, {
          categoryId,
          title: title.trim(),
          slug: slug.trim(),
          body,
        })
        navigate(`/guide/${slug.trim()}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="guide-editor">
      <h1 className="page-title">
        {mode === 'create' ? '📝 新規ガイド' : '✏️ ガイド編集'}
      </h1>
      <form onSubmit={onSubmit} className="card-panel" noValidate>
        <label className="label">タイトル *</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: ツール登録の手順"
        />
        <div style={{ height: 12 }} />
        <label className="label">スラッグ * (URL: /guide/&lt;スラッグ&gt;)</label>
        <input
          className="input"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="例: how-to-register"
        />
        <div style={{ height: 12 }} />
        <label className="label">カテゴリ *</label>
        <select
          className="select"
          value={categoryId}
          onChange={(e) => setCategoryId(Number(e.target.value))}
        >
          {guideCats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <div style={{ height: 12 }} />
        <label className="label">本文 (Markdown) *</label>
        <MarkdownEditor value={body} onChange={setBody} />
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
            {submitting ? '保存中…' : mode === 'create' ? '作成' : '更新'}
          </button>
        </div>
      </form>
    </div>
  )
}
