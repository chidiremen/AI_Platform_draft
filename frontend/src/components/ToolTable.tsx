import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { SortKey, Tool } from '../types'
import { AspiceBadge, ToolTypeBadge } from './Badges'
import { TOOL_TYPE_MAP } from '../data/toolTypes'
import { useApp } from '../store'
import RequestModal from './RequestModal'

interface Props {
  tools: Tool[]
  sort: SortKey
  onSort: (key: SortKey) => void
}

interface ColumnDef {
  key: SortKey | 'aspice' | 'type' | 'actions'
  label: string
  sortable: boolean
  width?: string
}

const COLUMNS: ColumnDef[] = [
  { key: 'name_asc', label: 'ツール名', sortable: true },
  { key: 'type', label: '種別', sortable: false, width: '140px' },
  { key: 'aspice', label: 'A-SPICE', sortable: false, width: '160px' },
  { key: 'likes', label: '♥ いいね', sortable: true, width: '90px' },
  { key: 'views', label: '👁 閲覧', sortable: true, width: '90px' },
  { key: 'requests', label: '📨 申請', sortable: true, width: '90px' },
  { key: 'downloads', label: '📥 DL', sortable: true, width: '80px' },
  { key: 'newest', label: '登録日', sortable: true, width: '110px' },
  { key: 'actions', label: 'アクション', sortable: false, width: '220px' },
]

export default function ToolTable({ tools, sort, onSort }: Props) {
  const { likedIds, toggleLike, submitRequest, recordDownload } = useApp()
  const [modalTool, setModalTool] = useState<Tool | null>(null)

  function sortIndicator(col: ColumnDef) {
    if (!col.sortable) return ''
    return col.key === sort ? ' ▼' : ''
  }

  return (
    <>
      <div className="table-scroll">
        <table className="tool-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width, cursor: col.sortable ? 'pointer' : 'default' }}
                  className={col.sortable ? 'sortable' : ''}
                  onClick={() => col.sortable && onSort(col.key as SortKey)}
                >
                  {col.label}
                  {sortIndicator(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tools.map((tool) => {
              const typeInfo = TOOL_TYPE_MAP[tool.toolType]
              const isZip = typeInfo.action === 'download'
              const liked = likedIds.has(tool.id)
              return (
                <tr key={tool.id}>
                  {/* ツール名 */}
                  <td>
                    <Link to={`/tools/${tool.id}`} className="table-tool-name">
                      {tool.title}
                    </Link>
                    <div className="table-tool-summary">{tool.summary}</div>
                  </td>
                  {/* 種別 */}
                  <td>
                    <ToolTypeBadge type={tool.toolType} />
                  </td>
                  {/* A-SPICE */}
                  <td>
                    <div className="table-badges">
                      {tool.aspiceProcesses.map((id) => (
                        <AspiceBadge key={id} id={id} />
                      ))}
                    </div>
                  </td>
                  {/* いいね */}
                  <td className="num-cell">{tool.likes}</td>
                  {/* 閲覧 */}
                  <td className="num-cell">{tool.views}</td>
                  {/* 申請 */}
                  <td className="num-cell">{tool.accessRequests ?? 0}</td>
                  {/* DL */}
                  <td className="num-cell">{tool.downloads ?? '—'}</td>
                  {/* 登録日 */}
                  <td className="date-cell">{tool.createdAt}</td>
                  {/* アクション */}
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
                        <button
                          className="btn-sm btn-primary"
                          onClick={() => setModalTool(tool)}
                        >
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
