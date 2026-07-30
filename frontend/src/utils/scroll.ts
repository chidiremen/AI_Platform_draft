/**
 * `scrollIntoView` を安全に呼ぶヘルパ。
 * jsdom など未実装の環境では黙って何もしない（テストで例外にならないように）。
 */
export function scrollIntoViewSafe(
  el: Element | null | undefined,
  opts?: ScrollIntoViewOptions,
) {
  if (!el) return
  const fn = (el as HTMLElement).scrollIntoView
  if (typeof fn !== 'function') return
  try {
    fn.call(el, opts)
  } catch {
    /* ignore */
  }
}
