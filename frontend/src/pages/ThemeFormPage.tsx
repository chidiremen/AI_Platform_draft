/**
 * テーマの登録・編集フォーム。
 *
 * この画面の肝は「登録前の重複チェック」。タイトルを打った時点で似ている
 * テーマを出し、そのまま合流申請に飛べるようにしている。重複開発の抑止が
 * この機能の主目的なので、登録し切ってから気づくのでは遅い。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useThemeStore } from '../hooks/useThemes'
import { WORK_CATEGORIES } from '../data/workCategories'
import type { Theme, ThemeStatus } from '../types'

const STATUS_OPTIONS: { value: ThemeStatus; label: string; hint: string }[] = [
  { value: 'active', label: '🚀 着手中', hint: 'すでに手を動かしている' },
  {
    value: 'recruiting',
    label: '🙋 仲間募集中',
    hint: 'やりたいが人手・スキルが足りない',
  },
]

export default function ThemeFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const store = useThemeStore()
  const editing = store.themes.find((t) => t.id === id)

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<ThemeStatus>('active')
  const [tags, setTags] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const [similar, setSimilar] = useState<Theme[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadTheme = store.loadTheme
  useEffect(() => {
    if (id) void loadTheme(id)
  }, [id, loadTheme])

  useEffect(() => {
    if (!editing) return
    setTitle(editing.title)
    setSummary(editing.summary)
    setBody(editing.body)
    setStatus(editing.status === 'recruiting' ? 'recruiting' : 'active')
    setTags(editing.tags.join(', '))
    setCategories(editing.workCategories)
  }, [editing])

  // 重複チェックはタイプするたびに叩かず、入力が落ち着いてから1回だけ走らせる。
  const findSimilar = store.findSimilar
  const timer = useRef<number | undefined>(undefined)
  const runSimilarCheck = useCallback(
    (nextTitle: string, nextTags: string) => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(async () => {
        if (nextTitle.trim().length < 3) {
          setSimilar([])
          return
        }
        try {
          setSimilar(
            await findSimilar({
              title: nextTitle,
              tags: nextTags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
              exclude: id,
            }),
          )
        } catch {
          setSimilar([])
        }
      }, 400)
    },
    [findSimilar, id],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function toggleCategory(catId: string) {
    setCategories((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId],
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setError('テーマ名を入力してください。')
      return
    }
    if (!summary.trim()) {
      setError('一行説明を入力してください。')
      return
    }
    setError('')
    setSaving(true)
    try {
      const input = {
        title: title.trim(),
        summary: summary.trim(),
        body,
        status,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        workCategories: categories,
      }
      if (id && editing) {
        await store.editTheme(id, input)
        navigate(`/themes/${id}`)
      } else {
        const created = await store.addTheme(input)
        navigate(`/themes/${created.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container section themes-page">
      <Link className="back-link" to="/themes">
        ← テーマ一覧へ
      </Link>
      <h1 className="page-title">{id ? '✏️ テーマを編集' : '📌 テーマを登録'}</h1>
      <p className="page-sub">
        成果が出る前の段階で共有しておくと、同じことをやっている人と合流できます。
      </p>

      {error && <p className="login-error">{error}</p>}

      <form className="card-panel theme-form" onSubmit={submit}>
        <label className="label">
          テーマ名 <span className="required-mark">必須</span>
        </label>
        <input
          className="input"
          value={title}
          placeholder="例: 議事録の自動要約"
          onChange={(e) => {
            setTitle(e.target.value)
            runSimilarCheck(e.target.value, tags)
          }}
        />

        {similar.length > 0 && (
          <div className="theme-similar">
            <strong>⚠️ 似たテーマがすでにあります</strong>
            <p className="dim">
              重複開発を避けるため、合流できないか確認してみてください。
            </p>
            <ul>
              {similar.map((t) => (
                <li key={t.id}>
                  <Link to={`/themes/${t.id}`}>{t.title}</Link>
                  <span className="dim">
                    {' '}
                    — {t.owner}・{t.status === 'recruiting' ? '仲間募集中' : '着手中'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="label">
          一行説明 <span className="required-mark">必須</span>
        </label>
        <input
          className="input"
          value={summary}
          placeholder="一覧に出る説明。何をするものか1行で"
          maxLength={280}
          onChange={(e) => setSummary(e.target.value)}
        />

        <label className="label">状態</label>
        <div className="theme-status-choice">
          {STATUS_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`theme-status-option ${status === o.value ? 'on' : ''}`}
            >
              <input
                type="radio"
                checked={status === o.value}
                onChange={() => setStatus(o.value)}
              />
              <span className="theme-status-label">{o.label}</span>
              <span className="dim">{o.hint}</span>
            </label>
          ))}
        </div>

        <label className="label">背景・進め方（Markdown可）</label>
        <textarea
          className="input"
          rows={8}
          value={body}
          placeholder={'## 背景\n\n## やりたいこと\n\n## 進め方'}
          onChange={(e) => setBody(e.target.value)}
        />

        <label className="label">タグ（カンマ区切り）</label>
        <input
          className="input"
          value={tags}
          placeholder="議事録, 要約, Copilot"
          onChange={(e) => {
            setTags(e.target.value)
            runSimilarCheck(title, e.target.value)
          }}
        />

        <label className="label">業務シーン（複数選択可）</label>
        <div className="theme-card-tags">
          {WORK_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip ${categories.includes(c.id) ? 'active' : ''}`}
              onClick={() => toggleCategory(c.id)}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        <div className="res-form-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? '保存中…' : id ? '更新する' : '登録する'}
          </button>
        </div>
      </form>
    </div>
  )
}
