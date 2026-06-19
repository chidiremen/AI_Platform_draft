import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../store'
import { TOOL_TYPES } from '../data/toolTypes'
import { ASPICE_PROCESSES, CATEGORY_COLORS } from '../data/aspice'
import { WORK_CATEGORIES, type WorkCategoryId } from '../data/workCategories'
import type { ToolType } from '../types'

type Mode = 'new' | 'fork' | 'edit'

export default function ToolFormPage() {
  const { tools, addTool, updateTool, canEdit } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { id: editId } = useParams()

  const forkId = params.get('fork')
  const mode: Mode = editId ? 'edit' : forkId ? 'fork' : 'new'

  // 編集 or フォーク元のツール
  const source = useMemo(
    () => tools.find((t) => t.id === (editId ?? forkId ?? '')),
    [editId, forkId, tools],
  )

  const [title, setTitle] = useState(
    mode === 'fork' && source ? `${source.title}（改善版）` : source?.title ?? '',
  )
  const [summary, setSummary] = useState(source?.summary ?? '')
  const [readme, setReadme] = useState(source?.readme ?? '')
  const [toolType, setToolType] = useState<ToolType>(source?.toolType ?? 'copilot_agent')
  const [accessUrl, setAccessUrl] = useState(source?.accessUrl ?? '')
  const [tags, setTags] = useState((source?.tags ?? []).join(', '))
  const [aspice, setAspice] = useState<Set<string>>(new Set(source?.aspiceProcesses ?? []))
  const [work, setWork] = useState<Set<WorkCategoryId>>(
    new Set((source?.workCategories ?? []) as WorkCategoryId[]),
  )

  // 編集モードで対象が無い / 権限が無い場合はリダイレクト
  if (mode === 'edit') {
    if (!source) return <Navigate to="/" replace />
    if (!canEdit(source)) return <Navigate to={`/tools/${source.id}`} replace />
  }

  function toggleAspice(id: string) {
    setAspice((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleWork(id: WorkCategoryId) {
    setWork((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = {
      title,
      summary,
      readme,
      toolType,
      accessUrl: accessUrl || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      aspiceProcesses: [...aspice],
      workCategories: [...work],
      forkedFrom: mode === 'fork' ? source?.id : undefined,
    }

    try {
      if (mode === 'edit' && source) {
        await updateTool(source.id, input)
        navigate(`/tools/${source.id}`)
      } else {
        const newId = await addTool(input)
        navigate(`/tools/${newId}`)
      }
    } catch {
      /* エラー時はトースト等で通知（API失敗）。フォームは保持。 */
    }
  }

  const needsUrl = toolType !== 'zip_upload'
  const needsZip = toolType === 'zip_upload'

  const pageTitle =
    mode === 'edit' ? 'ツール編集' : mode === 'fork' ? 'フォークして改善版を登録' : 'ツール登録'
  const submitLabel =
    mode === 'edit' ? '変更を保存' : mode === 'fork' ? 'フォークを登録' : 'この内容で登録'

  return (
    <div className="container section" style={{ maxWidth: 820 }}>
      <h1 className="page-title">{pageTitle}</h1>
      {mode === 'fork' && source && (
        <div className="fork-note">
          🍴 「{source.title}」をフォーク元として情報をコピーしました。
          フォーク元への参照は自動付与されます。
        </div>
      )}
      <p className="page-sub">
        AIツールの情報をプラットフォームに公開します。実体は各サービス側に置いたままで構いません。
      </p>

      <form onSubmit={onSubmit} className="card-panel">
        <div style={{ marginBottom: 18 }}>
          <label className="label">ツール名 *</label>
          <input
            className="input"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: A-SPICE要件トレーサビリティチェッカー"
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label className="label">概要説明 *（140字以内推奨）</label>
          <input
            className="input"
            required
            maxLength={280}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="一覧表示用の短い説明"
          />
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            {summary.length} / 140
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label className="label">ツール種別 *</label>
          <select
            className="select"
            value={toolType}
            onChange={(e) => setToolType(e.target.value as ToolType)}
          >
            {TOOL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>

        {needsUrl && (
          <div style={{ marginBottom: 18 }}>
            <label className="label">アクセス先URL *（zip以外は必須）</label>
            <input
              className="input"
              type="url"
              required
              value={accessUrl}
              onChange={(e) => setAccessUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
        )}

        {needsZip && (
          <div style={{ marginBottom: 18 }}>
            <label className="label">添付ファイル *（zip形式）</label>
            <input className="input" type="file" accept=".zip" />
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <label className="label">業務シーン（複数選択可・{work.size} 件選択中）</label>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
            会議・メール・チャット処理等の業務シーン分類。A-SPICEに紐付かない雑務系・AI活用促進系ツールはこちらを選択してください。
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {WORK_CATEGORIES.map((c) => {
              const active = work.has(c.id)
              return (
                <button
                  type="button"
                  key={c.id}
                  className={`chip ${active ? 'active' : ''}`}
                  style={
                    active
                      ? { background: c.color + '22', borderColor: c.color, color: c.color }
                      : undefined
                  }
                  onClick={() => toggleWork(c.id)}
                  title={c.description}
                >
                  {c.icon} {c.name}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label className="label">A-SPICEプロセス（複数選択可・{aspice.size} 件選択中）</label>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>
            車載開発プロセス（Automotive SPICE）に紐付くツールの場合に選択してください。
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ASPICE_PROCESSES.map((p) => {
              const active = aspice.has(p.id)
              return (
                <button
                  type="button"
                  key={p.id}
                  className={`chip ${active ? 'active' : ''}`}
                  style={
                    active
                      ? {
                          background: CATEGORY_COLORS[p.category],
                          borderColor: CATEGORY_COLORS[p.category],
                          color: '#fff',
                        }
                      : undefined
                  }
                  onClick={() => toggleAspice(p.id)}
                  title={p.name}
                >
                  {p.id}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <label className="label">README *（Markdown）</label>
          <textarea
            className="textarea"
            required
            style={{ minHeight: 180, fontFamily: 'monospace', fontSize: 13 }}
            value={readme}
            onChange={(e) => setReadme(e.target.value)}
            placeholder="## 概要&#10;使い方・セットアップ手順をMarkdownで記述"
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label className="label">タグ（カンマ区切り）</label>
          <input
            className="input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="traceability, requirements, copilot"
          />
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            キャンセル
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={aspice.size === 0 && work.size === 0}
            title={
              aspice.size === 0 && work.size === 0
                ? '業務シーンまたはA-SPICEプロセスを少なくとも1つ選択してください'
                : undefined
            }
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
