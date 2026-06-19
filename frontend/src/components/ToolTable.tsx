import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { SortKey, Tool } from '../types'
import { AspiceBadge, ToolTypeBadge, WorkCategoryBadge } from './Badges'
import { TOOL_TYPE_MAP } from '../data/toolTypes'
import { useApp } from '../store'
import RequestModal from './RequestModal'

export type ColumnKey =
  | 'type'
  | 'work'
  | 'aspice'
  | 'likes'
  | 'views'
  | 'requests'
  | 'downloads'
  | 'newest'

interface Props {
  tools: Tool[]
  sort: SortKey
  onSort: (key: SortKey) => void
  /** 表示する切替可能列（ツール名・アクションは常に表示） */
  visibleColumns: Set<ColumnKey>
}

interface ColumnDef {
  key: ColumnKey
  label: string
  sortKey?: SortKey
  width?: string
}

/** 表示/非表示を切り替えられる列の定義（ツール名・アクションは除く） */
export const TOGGLEABLE_COLUMNS: ColumnDef[] = [
  { key: 'type', label: '種別', width: '140px' },
  { key: 'work', label: '業務シーン', width: '180px' },
  { key: 'aspice', label: 'A-SPICE', width: '140px' },
  { key: 'likes', label: '♥ いいね', sortKey: 'likes', width: '90px' },
  { key: 'views', label: '👁 閲覧', sortKey: 'views', width: '90px' },
  { key: 'requests', label: '📨 申請', sortKey: 'requests', width: '90px' },
  { key: 'downloads', label: '📥 DL', sortKey: 'downloads', width: '80px' },
  { key: 'newest', label: '登録日', sortKey: 'newest', width: '110px' },
]

export default function ToolTable({ tools, sort, onSort, visibleColumns }: Props) {
  const { likedIds, toggleLike, submitRequest, recordDownload } = useApp()
  const [modalTool, setModalTool] = useState<Tool | null>(null)

  const cols = TOGGLEABLE_COLUMNS.filter((c) => visibleColumns.has(c.key))

  function renderHeaderCell(col: ColumnDef) {
    const sortable = !!col.sortKey
    const active = col.sortKey === sort
    return (
      <th
        key={col.key}
        style={{ width: col.width, cursor: sortable ? 'pointer' : 'default' }}
        className={sortable ? 'sortable' : ''}
        onClick={() => sortable && onSort(col.sortKey as SortKey)}
      >
        {col.label}
        {active ? ' ▼' : ''}
      </th>
    )
  }

  function renderBodyCell(col: ColumnDef, tool: Tool) {
    switch (col.key) {
      case 'type':
        return (
          <td key={col.key}>
            <ToolTypeBadge type={tool.toolType} />
          </td>
        )
      case 'work':
        return (
          <td key={col.key}>
            <div className="table-badges">
              {(tool.workCategories ?? []).length > 0 ? (
                (tool.workCategories ?? []).map((id) => <WorkCategoryBadge key={id} id={id} />)
              ) : (
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
              )}
            </div>
          </td>
        )
      case 'aspice':
        return (
          <td key={col.key}>
            <div className="table-badges">
              {tool.aspiceProcesses.length > 0 ? (
                tool.aspiceProcesses.map((id) => <AspiceBadge key={id} id={id} />)
              ) : (
                <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
              )}
            </div>
          </td>
        )
      case 'likes':
        return <td key={col.key} className="num-cell">{tool.likes}</td>
      case 'views':
        return <td key={col.key} className="num-cell">{tool.views}</td>
      case 'requests':
        return <td key={col.key} className="num-cell">{tool.accessRequests ?? 0}</td>
      case 'downloads':
        return <td key={col.key} className="num-cell">{tool.downloads ?? '—'}</td>
      case 'newest':
        return <td key={col.key} className="date-cell">{tool.createdAt}</td>
      default:
        return null
    }
  }

  return (
    <>
      <div className="table-scroll">
        <table className="tool-table">
          <thead>
            <tr>
              <th
                className="sortable"
                style={{ cursor: 'pointer' }}
                onClick={() => onSort('name_asc')}
              >
                ツール名{sort === 'name_asc' ? ' ▼' : ''}
              </th>
              {cols.map(renderHeaderCell)}
              <th style={{ width: '220px' }}>アクション</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((tool) => {
              const typeInfo = TOOL_TYPE_MAP[tool.toolType]
              const isZip = typeInfo.action === 'download'
              const liked = likedIds.has(tool.id)
              return (
                <tr key={tool.id}>
                  <td>
                    <Link to={`/tools/${tool.id}`} className="table-tool-name">
                      {tool.title}
                    </Link>
                    <div className="table-tool-summary">{tool.summary}</div>
                  </td>

                  {cols.map((col) => renderBodyCell(col, tool))}

                  <td>
                    <div className="table-actions">
                      <button
                        className={`btn-icon ${liked ? 'liked' : ''}`}
                        onClick={() => toggleLike(tool.id)}
                        title={liked ? 'いいね解除' : 'いいね'}
                      >
                        {liked ? '♥' : '♡'}
                      </button>

                      {isZip ? (
                        <button
                          className="btn-sm btn-primary"
                          onClick={() => recordDownload(tool.id)}
                        >
                          📥 DL
                        </button>
                      ) : (
                        <button className="btn-sm btn-primary" onClick={() => setModalTool(tool)}>
                          📨 申請
                        </button>
                      )}

                      <Link to={`/tools/${tool.id}`} className="btn-sm btn-ghost">
                        📄 詳細
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modalTool && (
        <RequestModal
          tool={modalTool}
          onClose={() => setModalTool(null)}
          onSubmit={(reason) => {
            submitRequest(modalTool, reason)
            setModalTool(null)
          }}
        />
      )}
    </>
  )
}
