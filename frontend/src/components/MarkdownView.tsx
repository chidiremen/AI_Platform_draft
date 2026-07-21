import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import MermaidBlock from './MermaidBlock'
import type { ComponentPropsWithoutRef } from 'react'

/**
 * Markdown レンダラ:
 *  - GFM (テーブル・チェックリスト等) を有効化
 *  - ```mermaid フェンスは `MermaidBlock` にディスパッチ
 *  - 画像/リンクは新規タブで開く（外部URL想定）
 */
export default function MarkdownView({ source }: { source: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
            const { inline, className, children, ...rest } = props
            const match = /language-(\w+)/.exec(className ?? '')
            const lang = match?.[1]
            if (!inline && lang === 'mermaid') {
              return <MermaidBlock code={String(children).trim()} />
            }
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            )
          },
          a(props) {
            const { href, children, ...rest } = props
            return (
              <a href={href} target="_blank" rel="noreferrer" {...rest}>
                {children}
              </a>
            )
          },
          img(props) {
            return (
              // 最大幅を親に合わせて拡大時にスクロールしないように
              <img {...props} alt={props.alt ?? ''} loading="lazy" />
            )
          },
        }}
      >
        {source || ''}
      </ReactMarkdown>
    </div>
  )
}
