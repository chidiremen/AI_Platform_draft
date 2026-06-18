import VModelSelector from './VModelSelector'
import type { Tool } from '../types'

interface Props {
  selected: Set<string>
  onToggle: (id: string) => void
  onClear: () => void
  onClose: () => void
  tools: Tool[]
}

/**
 * A-SPICE V字モデルセレクタをモーダルで表示する。
 * トップに直接置くと初見ユーザーに「これは何？」となるため、
 * 「A-SPICEで絞り込む」ボタンから開く形にした。
 */
export default function AspiceModal({ selected, onToggle, onClear, onClose, tools }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="閉じる">
          ✕
        </button>
        <VModelSelector
          selected={selected}
          onToggle={onToggle}
          onClear={onClear}
          tools={tools}
        />
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            この条件で絞り込む
          </button>
        </div>
      </div>
    </div>
  )
}
