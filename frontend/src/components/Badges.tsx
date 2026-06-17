import { ASPICE_MAP, CATEGORY_COLORS } from '../data/aspice'
import { TOOL_TYPE_MAP } from '../data/toolTypes'
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
