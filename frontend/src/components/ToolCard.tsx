import { Link } from 'react-router-dom'
import type { Tool } from '../types'
import { AspiceBadge, ToolTypeBadge, WorkCategoryBadge } from './Badges'
import { TOOL_TYPE_MAP } from '../data/toolTypes'

export default function ToolCard({ tool }: { tool: Tool }) {
  const isZip = TOOL_TYPE_MAP[tool.toolType].action === 'download'
  return (
    <Link to={`/tools/${tool.id}`} className="tool-card">
      <div className="tool-card-head">
        <h3 className="tool-card-title">{tool.title}</h3>
      </div>

      <div className="tool-card-badges">
        <ToolTypeBadge type={tool.toolType} />
        {tool.aspiceProcesses.map((id) => (
          <AspiceBadge key={id} id={id} />
        ))}
        {(tool.workCategories ?? []).map((id) => (
          <WorkCategoryBadge key={id} id={id} />
        ))}
      </div>

      <p className="tool-card-summary">{tool.summary}</p>

      <div className="tool-card-meta">
        <span>{tool.author}</span>
        <div className="metric-row">
          <span title="いいね">♥ {tool.likes}</span>
          <span title="閲覧数">👁 {tool.views}</span>
          {isZip ? (
            <span title="ダウンロード数">📥 {tool.downloads ?? 0}</span>
          ) : (
            <span title="申請数">📨 {tool.accessRequests ?? 0}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
