import { useEffect, useRef } from 'react'
import { useApp } from '../store'

/**
 * 要素が画面に入った時点で1回だけインプレッションを記録する。
 * IntersectionObserver 非対応環境（テストのjsdom等）では何もしない。
 */
export function useImpression<T extends HTMLElement>(toolId: string) {
  const { recordActivity } = useApp()
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            recordActivity(toolId, 'impression')
            observer.disconnect() // 1回で十分
          }
        }
      },
      { threshold: 0.4 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [toolId, recordActivity])

  return ref
}

/**
 * 要素が画面に入った時点で1回だけ readme スクロール（README到達）を記録する。
 */
export function useReadmeScroll<T extends HTMLElement>(toolId: string) {
  const { recordActivity } = useApp()
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            recordActivity(toolId, 'readme_scroll')
            observer.disconnect()
          }
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [toolId, recordActivity])

  return ref
}
