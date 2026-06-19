import { useEffect, useRef, useState } from 'react'

export interface ColumnOption {
  key: string
  label: string
}

interface Props {
  options: ColumnOption[]
  visible: Set<string>
  onChange: (key: string) => void
}

/**
 * テーブルの列表示/非表示を切り替えるポップオーバー。
 * ツール名とアクション列は常に表示のため、ここには含めない。
 */
export default function ColumnToggle({ options, visible, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const hiddenCount = options.length - options.filter((o) => visible.has(o.key)).length

  return (
    <div className="column-toggle" ref={ref}>
      <button className="btn" onClick={() => setOpen((v) => !v)} title="表示する列を選択">
        ⚙ 表示項目
        {hiddenCount > 0 && (
          <span className="badge" style={{ marginLeft: 6 }}>
            {hiddenCount}件非表示
          </span>
        )}
      </button>
      {open && (
        <div className="column-popover" role="menu">
          <div className="column-popover-title">表示する列</div>
          {options.map((o) => (
            <label key={o.key} className="column-popover-item">
              <input
                type="checkbox"
                checked={visible.has(o.key)}
                onChange={() => onChange(o.key)}
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
