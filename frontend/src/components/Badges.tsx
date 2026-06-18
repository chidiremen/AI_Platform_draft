import { ASPICE_MAP, CATEGORY_COLORS } from '../data/aspice'
import { TOOL_TYPE_MAP } from '../data/toolTypes'
import { WORK_CATEGORY_MAP, type WorkCategoryId } from '../data/workCategories'
import type { ToolType } from '../types'

export function AspiceBadge({ id, title }: { id: string; title?: boolean }) {
  const p = ASPICE_MAP[id]
  if (!p) return null
  const color = CATEGORY_COLORS[p.category]
  return (
    <span
      className="badge badge-aspice"
      style={{ background: color }}
      title={p.name}
    >
      {id}
      {title ? ` ${p.name}` : ''}
    </span>
  )
}

export function ToolTypeBadge({ type }: { type: ToolType }) {
  const info = TOOL_TYPE_MAP[type]
  return (
    <span className="badge badge-type" style={{ borderColor: info.color }}>
      <span style={{ color: info.color }}>{info.icon}</span>
      {info.label}
    </span>
  )
}

export function WorkCategoryBadge({ id }: { id: string }) {
  const info = WORK_CATEGORY_MAP[id as WorkCategoryId]
  if (!info) return null
  return (
    <span
      className="badge"
      style={{
        background: info.color + '22',
        borderColor: info.color,
        color: info.color,
      }}
      title={info.description}
    >
      {info.icon} {info.name}
    </span>
  )
}
