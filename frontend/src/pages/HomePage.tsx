import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import VModelSelector from '../components/VModelSelector'
import ToolCard from '../components/ToolCard'
import { TOOL_TYPES } from '../data/toolTypes'
import { useApp } from '../store'
import type { SortKey, ToolType } from '../types'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: '新着順' },
  { value: 'likes', label: 'いいね数順' },
  { value: 'requests', label: '申請数順' },
  { value: 'views', label: '閲覧数順' },
]

export default function HomePage() {
  const { tools } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = (searchParams.get('q') ?? '').toLowerCase()
  const [selectedAspice, setSelectedAspice] = useState<Set<string>>(new Set())
  const [selectedTypes, setSelectedTypes] = useState<Set<ToolType>>(new Set())
  const [sort, setSort] = useState<SortKey>('newest')

  function toggleAspice(id: string) {
    setSelectedAspice((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleType(t: ToolType) {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })
  }

  const filtered = useMemo(() => {
    let list = tools.filter((t) => {
      // キーワード検索（タイトル・概要・README・タグ）
      if (q) {
        const hay = [t.title, t.summary, t.readme ?? '', (t.tags ?? []).join(' ')]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      // A-SPICE（OR条件）
      if (selectedAspice.size > 0) {
        if (!t.aspiceProcesses.some((p) => selectedAspice.has(p))) return false
      }
      // ツール種別（OR条件）
      if (selectedTypes.size > 0 && !selectedTypes.has(t.toolType)) return false
      return true
    })

    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'likes':
          return b.likes - a.likes
        case 'requests':
          return (b.accessRequests ?? 0) - (a.accessRequests ?? 0)
        case 'views':
          return b.views - a.views
        case 'newest':
        default:
          return b.createdAt.localeCompare(a.createdAt)
      }
    })
    return list
  }, [tools, q, selectedAspice, selectedTypes, sort])

  return (
    <div className="container section">
      <VModelSelector
        selected={selectedAspice}
        onToggle={toggleAspice}
        onClear={() => setSelectedAspice(new Set())}
        tools={tools}
      />

      <div className="filter-bar">
        <div className="filter-group">
          <span className="filter-group-label">種別</span>
          {TOOL_TYPES.map((t) => (
            <button
              key={t.value}
              className={`chip ${selectedTypes.has(t.value) ? 'active' : ''}`}
              onClick={() => toggleType(t.value)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="spacer" />

        <div className="filter-group">
          <span className="filter-group-label">並び替え</span>
          <select
            className="select"
            style={{ width: 'auto' }}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <span className="result-count">{filtered.length} 件のツール</span>
        {(q || selectedAspice.size > 0 || selectedTypes.size > 0) && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setSelectedAspice(new Set())
              setSelectedTypes(new Set())
              setSearchParams({})
            }}
          >
            フィルタをリセット
          </button>
        )}
      </div>

      {filtered.length > 0 ? (
        <div className="tool-grid">
          {filtered.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      ) : (
        <div className="empty">
          条件に一致するツールがありません。フィルタを変更してください。
        </div>
      )}
    </div>
  )
}
