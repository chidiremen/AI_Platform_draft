import { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

let inited = false
function initOnce() {
  if (inited) return
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      background: '#0e1b30',
      primaryColor: '#3a8dde',
      primaryTextColor: '#e8eef7',
      primaryBorderColor: '#4f9dde',
      lineColor: '#4f9dde',
      textColor: '#e8eef7',
      fontFamily: "'Segoe UI', 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif",
    },
    securityLevel: 'strict',
  })
  inited = true
}

let seq = 0

/**
 * Renders a `mermaid` diagram inside a scrolling container.
 * `code` is the raw mermaid source (contents of a ```mermaid fenced block).
 */
export default function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const idRef = useRef(`mmd-${++seq}`)

  useEffect(() => {
    initOnce()
    const el = ref.current
    if (!el) return
    let cancelled = false
    ;(async () => {
      try {
        const { svg } = await mermaid.render(idRef.current, code)
        if (!cancelled && ref.current) ref.current.innerHTML = svg
      } catch (e) {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = `<pre class="mermaid-error">Mermaid parse error:\n${
            e instanceof Error ? e.message : String(e)
          }</pre>`
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  return <div className="mermaid-block" ref={ref} />
}
