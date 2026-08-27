import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AspiceModal from '../components/AspiceModal'
import ToolCard from '../components/ToolCard'
import ToolTable, { TOGGLEABLE_COLUMNS, type ColumnKey } from '../components/ToolTable'
import ColumnToggle from '../components/ColumnToggle'
import { TOOL_TYPES } from '../data/toolTypes'
import { ASPICE_MAP, CATEGORY_COLORS } from '../data/aspice'
import { WORK_CATEGORIES, type WorkCategoryId } from '../data/workCategories'
import { useApp } from '../store'
import type { SortKey, ToolType } from '../types'

type ViewMode = 'card' | 'table'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: '新着順' },
  { value: 'name_asc', label: '50音順' },
  { value: 'likes', label: 'いいね数順' },
  { value: 'requests', label: '申請数順' },
  { value: 'views', label: '閲覧数順' },
  { value: 'downloads', label: 'DL数順' },
]

function jaCollator() {
  return new Intl.Collator('ja', { sensitivity: 'base' })
}

export default function HomePage() {
  const { tools } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = (searchParams.get('q') ?? '').toLowerCase()
  const [selectedAspice, setSelectedAspice] = useState<Set<string>>(new Set())
  const [selectedTypes, setSelectedTypes] = useState<Set<ToolType>>(new Set())
  const [selectedWork, setSelectedWork] = useState<Set<WorkCategoryId>>(new Set())
  const [sort, setSort] = useState<SortKey>('newest')
  // デフォルトは一覧表（テーブル）表示
  const [view, setView] = useState<ViewMode>('table')
  const [aspiceModalOpen, setAspiceModalOpen] = useState(false)
  // テーブルの列表示/非表示（初期は全表示）
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(
    () => new Set(TOGGLEABLE_COLUMNS.map((c) => c.key)),
  )

  function toggleColumn(key: string) {
    setVisibleColumns((prev) => {
      const next = new Set(prev)
      next.has(key as ColumnKey) ? next.delete(key as ColumnKey) : next.add(key as ColumnKey)
      return next
    })
  }

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
  function toggleWork(id: WorkCategoryId) {
    setSelectedWork((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = useMemo(() => {
    const collator = jaCollator()

    let list = tools.filter((t) => {
      if (q) {
        const hay = [t.title, t.summary, t.readme ?? '', (t.tags ?? []).join(' ')]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (selectedAspice.size > 0) {
        if (!t.aspiceProcesses.some((p) => selectedAspice.has(p))) return false
      }
      if (selectedWork.size > 0) {
        const cats = t.workCategories ?? []
        if (!cats.some((c) => selectedWork.has(c as WorkCategoryId))) return false
      }
      if (selectedTypes.size > 0 && !selectedTypes.has(t.toolType)) return false
      return true
    })

    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'name_asc':
          return collator.compare(a.title, b.title)
        case 'likes':
          return b.likes - a.likes
        case 'requests':
          return (b.accessRequests ?? 0) - (a.accessRequests ?? 0)
        case 'views':
          return b.views - a.views
        case 'downloads':
          return (b.downloads ?? 0) - (a.downloads ?? 0)
        case 'newest':
        default:
          return b.createdAt.localeCompare(a.createdAt)
      }
    })
    return list
  }, [tools, q, selectedAspice, selectedWork, selectedTypes, sort])

  const hasAnyFilter =
    q.length > 0 ||
    selectedAspice.size > 0 ||
    selectedWork.size > 0 ||
    selectedTypes.size > 0

  return (
    <div className="container section">
      <div className="home-head">
        <div>
          <h1 className="page-title">AIツール カタログ</h1>
          <p className="page-sub">
            部内のAI活用ツールを一元管理。A-SPICEプロセスや業務シーンから探せます。
          </p>
        </div>
      </div>

      {/* ── フィルタバー（業務カテゴリ＋種別＋A-SPICEモーダル起動） ── */}
      <div className="filter-bar filter-bar-stacked">
        <div className="filter-group">
          <span className="filter-group-label">業務シーンで探す</span>
          {WORK_CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`chip ${selectedWork.has(c.id) ? 'active' : ''}`}
              style={
                selectedWork.has(c.id)
                  ? { background: c.color + '22', borderColor: c.color, color: c.color }
                  : undefined
              }
              onClick={() => toggleWork(c.id)}
              title={c.description}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      </div>

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

        <div className="filter-group">
          <button
            className={`btn ${selectedAspice.size > 0 ? 'active' : ''}`}
            onClick={() => setAspiceModalOpen(true)}
            title="A-SPICE V字モデルで絞り込み"
          >
            🅥 A-SPICEで絞り込む
            {selectedAspice.size > 0 && (
              <span className="badge" style={{ marginLeft: 6 }}>
                {selectedAspice.size}
              </span>
            )}
          </button>
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

        {view === 'table' && (
          <ColumnToggle
            options={TOGGLEABLE_COLUMNS.map((c) => ({ key: c.key, label: c.label }))}
            visible={visibleColumns}
            onChange={toggleColumn}
          />
        )}

        <div className="view-toggle" role="group" aria-label="表示モード">
          <button
            className={`btn-icon view-btn ${view === 'table' ? 'active' : ''}`}
            onClick={() => setView('table')}
            title="テーブル表示"
          >
            ≡
          </button>
          <button
            className={`btn-icon view-btn ${view === 'card' ? 'active' : ''}`}
            onClick={() => setView('card')}
            title="カード表示"
          >
            ▦
          </button>
        </div>
      </div>

      {/* ── 選択中A-SPICEプロセスを小さく表示 ── */}
      {selectedAspice.size > 0 && (
        <div className="active-aspice-row">
          <span className="filter-group-label">A-SPICE選択中:</span>
          {[...selectedAspice].map((id) => {
            const p = ASPICE_MAP[id]
            if (!p) return null
            return (
              <button
                key={id}
                className="chip chip-active-aspice"
                style={{ borderColor: CATEGORY_COLORS[p.category] }}
                onClick={() => toggleAspice(id)}
              >
                {id} {p.name} ✕
              </button>
            )
          })}
          <button
            className="btn-ghost-link"
            onClick={() => setSelectedAspice(new Set())}
          >
            すべてクリア
          </button>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <span className="result-count">{filtered.length} 件のツール</span>
        {hasAnyFilter && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setSelectedAspice(new Set())
              setSelectedTypes(new Set())
              setSelectedWork(new Set())
              setSearchParams({})
            }}
          >
            フィルタをリセット
          </button>
        )}
      </div>

      {filtered.length > 0 ? (
        view === 'card' ? (
          <div className="tool-grid">
            {filtered.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        ) : (
          <ToolTable
            tools={filtered}
            sort={sort}
            onSort={setSort}
            visibleColumns={visibleColumns}
          />
        )
      ) : (
        <div className="empty">
          条件に一致するツールがありません。フィルタを変更してください。
        </div>
      )}

      {aspiceModalOpen && (
        <AspiceModal
          selected={selectedAspice}
          onToggle={toggleAspice}
          onClear={() => setSelectedAspice(new Set())}
          onClose={() => setAspiceModalOpen(false)}
          tools={tools}
        />
      )}
    </div>
  )
}
