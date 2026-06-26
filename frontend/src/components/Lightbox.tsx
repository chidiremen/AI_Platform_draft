import { useCallback, useEffect, useState } from 'react'
import type { ScreenshotInfo } from '../types'

interface LightboxProps {
  screenshots: ScreenshotInfo[]
  initialIndex: number
  onClose: () => void
}

/**
 * スクリーンショット用ライトボックス。
 * - 矢印キー/ボタンで前後の画像へ移動
 * - Escキー または オーバーレイクリックで閉じる
 * - ページ遷移は発生しない
 */
export default function Lightbox({ screenshots, initialIndex, onClose }: LightboxProps) {
  const [index, setIndex] = useState(initialIndex)

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + screenshots.length) % screenshots.length)
  }, [screenshots.length])
  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % screenshots.length)
  }, [screenshots.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    document.addEventListener('keydown', onKey)
    // 背面のスクロールを止める
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [goPrev, goNext, onClose])

  const current = screenshots[index]
  if (!current) return null
  const hasMultiple = screenshots.length > 1

  return (
    <div
      className="lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="スクリーンショット拡大表示"
      onClick={onClose}
    >
      <button
        type="button"
        className="lightbox-close"
        onClick={onClose}
        aria-label="閉じる"
      >
        ✕
      </button>

      {hasMultiple && (
        <button
          type="button"
          className="lightbox-nav lightbox-nav-prev"
          onClick={(e) => { e.stopPropagation(); goPrev() }}
          aria-label="前の画像"
        >
          ‹
        </button>
      )}

      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <img src={current.url} alt={`スクリーンショット ${index + 1}`} />
        {hasMultiple && (
          <div className="lightbox-counter">
            {index + 1} / {screenshots.length}
          </div>
        )}
      </div>

      {hasMultiple && (
        <button
          type="button"
          className="lightbox-nav lightbox-nav-next"
          onClick={(e) => { e.stopPropagation(); goNext() }}
          aria-label="次の画像"
        >
          ›
        </button>
      )}
    </div>
  )
}
