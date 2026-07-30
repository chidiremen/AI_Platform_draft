import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { scrollIntoViewSafe } from '../utils/scroll'

/**
 * 2ch 風のレス本文レンダラ。
 *
 *  - `>>3` `＞＞3` `>>3-5` を検出してレス参照リンクにする
 *  - リンクにマウスを乗せると参照先レスをポップアップ表示（2ch ブラウザ風）
 *  - クリックすると該当レスへスクロール
 *  - それ以外は改行を保った素のテキスト（Markdown ではなく掲示板的な扱い）
 *  - ``` で囲んだ部分だけは等幅ブロックとして表示
 */
interface Props {
  body: string
  /** 参照先レスの本文を番号から引くための辞書（1 = スレ本文） */
  bodyByNumber: Record<number, { body: string; author: string }>
  /** レス番号クリック時のスクロール用 id プレフィクス */
  anchorPrefix?: string
}

const REF_RE = /(?:&gt;&gt;|>>|＞＞)(\d+)(?:-(\d+))?/g

export default function ResBody({ body, bodyByNumber, anchorPrefix = 'res' }: Props) {
  // ``` フェンスで分割し、コード部分だけ等幅ブロック扱いにする
  const segments = useMemo(() => splitFences(body), [body])

  return (
    <div className="res-body">
      {segments.map((seg, i) =>
        seg.kind === 'code' ? (
          <pre key={i} className="res-code">
            {seg.text}
          </pre>
        ) : (
          <span key={i}>
            <TextWithRefs
              text={seg.text}
              bodyByNumber={bodyByNumber}
              anchorPrefix={anchorPrefix}
            />
          </span>
        ),
      )}
    </div>
  )
}

interface Segment {
  kind: 'text' | 'code'
  text: string
}

function splitFences(src: string): Segment[] {
  const out: Segment[] = []
  const parts = src.split('```')
  parts.forEach((p, i) => {
    if (i % 2 === 1) {
      // コードブロック（先頭行が言語指定なら落とす）
      const lines = p.split('\n')
      const first = lines[0]?.trim() ?? ''
      const text = /^[a-zA-Z0-9_+-]*$/.test(first)
        ? lines.slice(1).join('\n')
        : p
      out.push({ kind: 'code', text: text.replace(/\n$/, '') })
    } else if (p !== '') {
      out.push({ kind: 'text', text: p })
    }
  })
  return out.length ? out : [{ kind: 'text', text: src }]
}

function TextWithRefs({
  text,
  bodyByNumber,
  anchorPrefix,
}: {
  text: string
  bodyByNumber: Record<number, { body: string; author: string }>
  anchorPrefix: string
}) {
  const nodes: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  const re = new RegExp(REF_RE.source, 'g')
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const from = Number(m[1])
    const to = m[2] ? Number(m[2]) : null
    nodes.push(
      <ResRef
        key={`ref-${key++}`}
        label={m[0]}
        from={from}
        to={to}
        bodyByNumber={bodyByNumber}
        anchorPrefix={anchorPrefix}
      />,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}

function ResRef({
  label,
  from,
  to,
  bodyByNumber,
  anchorPrefix,
}: {
  label: string
  from: number
  to: number | null
  bodyByNumber: Record<number, { body: string; author: string }>
  anchorPrefix: string
}) {
  const [hover, setHover] = useState(false)
  const anchorRef = useRef<HTMLAnchorElement | null>(null)
  const popRef = useRef<HTMLSpanElement | null>(null)
  /** ポップアップの表示座標（viewport 基準）。null の間は非表示。 */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // ポップアップは position:fixed。実寸を測ってから、はみ出す場合は
  // 左右をクランプし、下に入らなければ上方向へ反転させる。
  useLayoutEffect(() => {
    if (!hover) {
      setPos(null)
      return
    }
    const a = anchorRef.current
    const pop = popRef.current
    if (!a || !pop) return
    const ar = a.getBoundingClientRect()
    const pr = pop.getBoundingClientRect()
    const M = 8 // 画面端との余白
    const GAP = 6 // リンクとポップアップの隙間

    let left = ar.left
    if (left + pr.width > window.innerWidth - M) {
      left = window.innerWidth - pr.width - M
    }
    if (left < M) left = M

    let top = ar.bottom + GAP
    if (top + pr.height > window.innerHeight - M) {
      const above = ar.top - pr.height - GAP
      // 上にも入らないときは画面内に収まる位置へフォールバック
      top = above >= M ? above : Math.max(M, window.innerHeight - pr.height - M)
    }
    setPos({ top, left })
  }, [hover])

  const targets: number[] = []
  if (to != null && to > from && to - from < 20) {
    for (let n = from; n <= to; n++) targets.push(n)
  } else {
    targets.push(from)
  }
  const known = targets.filter((n) => bodyByNumber[n])

  function jump(e: React.MouseEvent) {
    e.preventDefault()
    const el = document.getElementById(`${anchorPrefix}-${from}`)
    if (el) {
      scrollIntoViewSafe(el, { behavior: 'smooth', block: 'center' })
      el.classList.add('res-flash')
      window.setTimeout(() => el.classList.remove('res-flash'), 1200)
    }
  }

  return (
    <span
      className="res-ref-wrap"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <a
        ref={anchorRef}
        href={`#${anchorPrefix}-${from}`}
        className="res-ref"
        onClick={jump}
      >
        {label}
      </a>
      {hover && known.length > 0 && (
        <span
          ref={popRef}
          className={`res-ref-popup${pos ? ' positioned' : ''}`}
          style={pos ? { top: pos.top, left: pos.left } : undefined}
        >
          {known.map((n) => (
            <span key={n} className="res-ref-popup-item">
              <span className="res-ref-popup-head">
                {n} : {bodyByNumber[n].author}
              </span>
              <span className="res-ref-popup-body">
                {bodyByNumber[n].body.slice(0, 240)}
                {bodyByNumber[n].body.length > 240 ? '…' : ''}
              </span>
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

/** 2ch 風の日時表記: 2026/07/15(火) 12:34:56 */
export function formatResDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}(${wd}) ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
