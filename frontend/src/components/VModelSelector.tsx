import { useMemo } from 'react'
import {
  ASPICE_PROCESSES,
  ASPICE_MAP,
  CATEGORY_COLORS,
  V_MODEL_PATH_ORDER,
  V_MODEL_TRACE_PAIRS,
} from '../data/aspice'
import type { Tool } from '../types'

interface Props {
  selected: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
  tools: Tool[]
}

const NODE_W = 116
const NODE_H = 48

const CATEGORY_LABELS: { cat: string; label: string }[] = [
  { cat: 'SYS', label: 'システム' },
  { cat: 'SWE', label: 'ソフトウェア' },
  { cat: 'SUP', label: 'サポート' },
  { cat: 'MAN', label: 'マネジメント' },
  { cat: 'ACQ', label: '調達' },
]

export default function VModelSelector({ selected, onToggle, onClear, tools }: Props) {
  // プロセスごとのツール件数
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const t of tools) {
      for (const p of t.aspiceProcesses) c[p] = (c[p] ?? 0) + 1
    }
    return c
  }, [tools])

  const hasSelection = selected.size > 0

  const vPath = V_MODEL_PATH_ORDER.map((id) => {
    const p = ASPICE_MAP[id]
    return `${p.x},${p.y}`
  }).join(' ')

  return (
    <section className="vmodel">
      <div className="vmodel-head">
        <h2 className="vmodel-title">
          🅥 A-SPICE V字モデル セレクタ
          {hasSelection && (
            <span className="badge" style={{ marginLeft: 4 }}>
              {selected.size} プロセス選択中
            </span>
          )}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="vmodel-hint">
            プロセスをクリックして関連ツールを絞り込み（複数選択＝OR条件）
          </span>
          <button
            className="btn btn-ghost"
            onClick={onClear}
            disabled={!hasSelection}
            style={{ opacity: hasSelection ? 1 : 0.4 }}
          >
            すべてクリア
          </button>
        </div>
      </div>

      <svg viewBox="0 0 960 560" role="img" aria-label="A-SPICE V字モデル">
        {/* V字の折れ線 */}
        <polyline
          points={vPath}
          fill="none"
          stroke="#2f5180"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        {/* 水平トレーサビリティ（破線） */}
        {V_MODEL_TRACE_PAIRS.map(([a, b]) => {
          const pa = ASPICE_MAP[a]
          const pb = ASPICE_MAP[b]
          return (
            <line
              key={`${a}-${b}`}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke="#2a4a78"
              strokeDasharray="6 7"
              strokeWidth={1.5}
              opacity={0.55}
            />
          )
        })}

        {/* 開発系 / 検証系 ラベル */}
        <text x={150} y={28} className="vnode-name" style={{ fontSize: 13, fill: '#6b7d99' }}>
          ◀ 開発（仕様化・設計）
        </text>
        <text x={620} y={28} className="vnode-name" style={{ fontSize: 13, fill: '#6b7d99' }}>
          検証（テスト）▶
        </text>
        <line x1={40} y1={448} x2={920} y2={448} stroke="#1d3556" strokeWidth={1} />
        <text x={40} y={440} className="vnode-name" style={{ fontSize: 12, fill: '#6b7d99' }}>
          サポート・マネジメントプロセス
        </text>

        {/* プロセスノード */}
        {ASPICE_PROCESSES.map((p) => {
          const active = selected.has(p.id)
          const color = CATEGORY_COLORS[p.category]
          const x = p.x - NODE_W / 2
          const y = p.y - NODE_H / 2
          const dimmed = hasSelection && !active
          const cnt = counts[p.id] ?? 0
          return (
            <g
              key={p.id}
              className="vnode"
              onClick={() => onToggle(p.id)}
              role="button"
              aria-pressed={active}
            >
              <rect
                x={x}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={10}
                fill={active ? color : '#13243f'}
                stroke={color}
                strokeWidth={active ? 2.5 : 1.5}
                opacity={dimmed ? 0.4 : 1}
                style={
                  active
                    ? { filter: `drop-shadow(0 0 8px ${color})` }
                    : undefined
                }
              />
              <text
                x={p.x}
                y={p.y - 4}
                textAnchor="middle"
                className="vnode-id"
                style={{ fill: active ? '#fff' : '#e8eef7', opacity: dimmed ? 0.5 : 1 }}
              >
                {p.id}
              </text>
              <text
                x={p.x}
                y={p.y + 11}
                textAnchor="middle"
                className="vnode-name"
                style={{ fill: active ? 'rgba(255,255,255,0.85)' : '#9fb1cc', opacity: dimmed ? 0.5 : 1 }}
              >
                {truncate(p.name, 13)}
              </text>
              {cnt > 0 && (
                <>
                  <circle
                    cx={x + NODE_W - 8}
                    cy={y + 8}
                    r={9}
                    fill={active ? '#fff' : color}
                    opacity={dimmed ? 0.5 : 1}
                  />
                  <text
                    x={x + NODE_W - 8}
                    y={y + 11}
                    textAnchor="middle"
                    className="vnode-count"
                    style={{ fill: active ? color : '#0a1424' }}
                  >
                    {cnt}
                  </text>
                </>
              )}
            </g>
          )
        })}
      </svg>

      <div className="vmodel-legend">
        {CATEGORY_LABELS.map(({ cat, label }) => (
          <span key={cat}>
            <span className="legend-dot" style={{ background: CATEGORY_COLORS[cat] }} />
            {cat} — {label}
          </span>
        ))}
      </div>
    </section>
  )
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
