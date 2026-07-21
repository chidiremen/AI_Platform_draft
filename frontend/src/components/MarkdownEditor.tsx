import { useCallback, useRef, useState } from 'react'
import MarkdownView from './MarkdownView'
import * as api from '../api'
import { USE_MOCK } from '../config'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}

/**
 * Markdown 編集エリア + プレビュー切替。
 * Ctrl+V で画像を貼り付けると、実API モードでは画像をアップロードして
 * `![](url)` を挿入する。モックでは data URL を挿入。
 * Mermaid コードブロックにも対応（プレビュー時に描画）。
 */
export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 14,
}: Props) {
  const [tab, setTab] = useState<'edit' | 'preview' | 'split'>('split')
  const [uploading, setUploading] = useState(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  /** テキストエリアのカーソル位置にテキストを挿入する */
  const insertAtCursor = useCallback(
    (insert: string) => {
      const ta = taRef.current
      if (!ta) {
        onChange(value + insert)
        return
      }
      const start = ta.selectionStart ?? value.length
      const end = ta.selectionEnd ?? value.length
      const next = value.slice(0, start) + insert + value.slice(end)
      onChange(next)
      // カーソルを挿入後の位置に置く
      requestAnimationFrame(() => {
        ta.focus()
        const pos = start + insert.length
        ta.setSelectionRange(pos, pos)
      })
    },
    [value, onChange],
  )

  const onPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items ?? []
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          e.preventDefault()
          const file = it.getAsFile()
          if (!file) continue
          if (USE_MOCK) {
            // モック: dataURL 埋め込み
            const url = await new Promise<string>((resolve, reject) => {
              const r = new FileReader()
              r.onload = () => resolve(r.result as string)
              r.onerror = reject
              r.readAsDataURL(file)
            })
            insertAtCursor(`\n![貼り付けた画像](${url})\n`)
          } else {
            setUploading(true)
            try {
              const url = await api.uploadDocAttachment(file)
              insertAtCursor(`\n![貼り付けた画像](${url})\n`)
            } catch (err) {
              insertAtCursor(
                `\n<!-- 画像アップロード失敗: ${
                  err instanceof Error ? err.message : String(err)
                } -->\n`,
              )
            } finally {
              setUploading(false)
            }
          }
          return
        }
      }
    },
    [insertAtCursor],
  )

  return (
    <div className="md-editor">
      <div className="md-editor-tabs">
        <button
          type="button"
          className={`md-tab ${tab === 'edit' ? 'active' : ''}`}
          onClick={() => setTab('edit')}
        >
          ✏️ 編集
        </button>
        <button
          type="button"
          className={`md-tab ${tab === 'preview' ? 'active' : ''}`}
          onClick={() => setTab('preview')}
        >
          👁 プレビュー
        </button>
        <button
          type="button"
          className={`md-tab ${tab === 'split' ? 'active' : ''}`}
          onClick={() => setTab('split')}
        >
          ⇆ 並列
        </button>
        <div className="md-editor-hint">
          {uploading
            ? '📤 画像アップロード中…'
            : 'Ctrl+V で画像貼り付け・```mermaid で図表'}
        </div>
      </div>
      <div className={`md-editor-panes tab-${tab}`}>
        {tab !== 'preview' && (
          <textarea
            ref={taRef}
            className="textarea md-editor-textarea"
            style={{ minHeight: rows * 22 }}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={onPaste}
            placeholder={
              placeholder ??
              '## 見出し\n本文（Markdown）\n\n```mermaid\ngraph LR\n  A --> B\n```'
            }
          />
        )}
        {tab !== 'edit' && (
          <div className="md-editor-preview">
            <MarkdownView source={value} />
          </div>
        )}
      </div>
    </div>
  )
}
