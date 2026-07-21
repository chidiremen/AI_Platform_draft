import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { DocCategory } from '../types'

/**
 * ガイド/Q&A 共通の左側インデックス。
 * カテゴリを階層でネスト表示し、折りたたみ可能。
 * `items` はカテゴリ配下に紐づくリーフ（ガイド記事 or 質問）を渡す。
 *  - items[categoryId] = [{ href, label, badge? }]
 */
interface Leaf {
  href: string
  label: string
  badge?: string
  activeCheck?: (path: string) => boolean
}

interface Props {
  title: string
  categories: DocCategory[]
  items: Record<number, Leaf[]>
  /** ヘッダ下の追加操作 (「新規作成」ボタン等) */
  headerActions?: React.ReactNode
  /** カテゴリを持たない topLevel の leaves（Q&Aの「カテゴリなし」等） */
  uncategorized?: Leaf[]
  uncategorizedLabel?: string
}

const COLLAPSE_KEY = 'aitc_docs_sidebar_collapsed_v1'

function loadCollapsed(): Set<number> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as number[])
  } catch {
    return new Set()
  }
}
function saveCollapsed(s: Set<number>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s]))
  } catch {
    /* ignore */
  }
}

export default function DocsSidebar({
  title,
  categories,
  items,
  headerActions,
  uncategorized = [],
  uncategorizedLabel = 'その他',
}: Props) {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState<Set<number>>(() => loadCollapsed())

  useEffect(() => {
    saveCollapsed(collapsed)
  }, [collapsed])

  const tree = useMemo(() => buildTree(categories), [categories])

  const toggle = (id: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <aside className="docs-sidebar">
      <div className="docs-sidebar-header">
        <div className="docs-sidebar-title">{title}</div>
        {headerActions}
      </div>
      <nav className="docs-sidebar-tree">
        {tree.map((node) => (
          <CategoryNode
            key={node.id}
            node={node}
            depth={0}
            collapsed={collapsed}
            toggle={toggle}
            items={items}
            location={location.pathname}
          />
        ))}
        {uncategorized.length > 0 && (
          <div className="docs-cat">
            <div className="docs-cat-row" style={{ paddingLeft: 8 }}>
              <span className="docs-cat-name">📎 {uncategorizedLabel}</span>
            </div>
            <ul className="docs-leaves">
              {uncategorized.map((l) => (
                <LeafItem key={l.href} leaf={l} location={location.pathname} depth={0} />
              ))}
            </ul>
          </div>
        )}
      </nav>
    </aside>
  )
}

interface TreeNode extends DocCategory {
  children: TreeNode[]
}

function buildTree(cats: DocCategory[]): TreeNode[] {
  const map = new Map<number, TreeNode>()
  cats.forEach((c) => map.set(c.id, { ...c, children: [] }))
  const roots: TreeNode[] = []
  map.forEach((node) => {
    if (node.parent != null && map.has(node.parent)) {
      map.get(node.parent)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    arr.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

function CategoryNode({
  node,
  depth,
  collapsed,
  toggle,
  items,
  location,
}: {
  node: TreeNode
  depth: number
  collapsed: Set<number>
  toggle: (id: number) => void
  items: Record<number, Leaf[]>
  location: string
}) {
  const isCollapsed = collapsed.has(node.id)
  const leaves = items[node.id] ?? []
  const hasContent = leaves.length > 0 || node.children.length > 0

  return (
    <div className="docs-cat" style={{ paddingLeft: depth * 8 }}>
      <div className="docs-cat-row">
        {hasContent ? (
          <button
            type="button"
            className={`docs-caret ${isCollapsed ? 'closed' : 'open'}`}
            onClick={() => toggle(node.id)}
            aria-label={isCollapsed ? '展開' : '折りたたむ'}
          >
            ▶
          </button>
        ) : (
          <span className="docs-caret placeholder" />
        )}
        <span className="docs-cat-name">
          {node.icon && <span className="docs-cat-icon">{node.icon} </span>}
          {node.name}
        </span>
      </div>
      {!isCollapsed && (
        <>
          {leaves.length > 0 && (
            <ul className="docs-leaves">
              {leaves.map((l) => (
                <LeafItem key={l.href} leaf={l} location={location} depth={depth + 1} />
              ))}
            </ul>
          )}
          {node.children.map((c) => (
            <CategoryNode
              key={c.id}
              node={c}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
              items={items}
              location={location}
            />
          ))}
        </>
      )}
    </div>
  )
}

function LeafItem({
  leaf,
  location,
  depth,
}: {
  leaf: Leaf
  location: string
  depth: number
}) {
  const active = leaf.activeCheck
    ? leaf.activeCheck(location)
    : location === leaf.href
  return (
    <li
      className={`docs-leaf ${active ? 'active' : ''}`}
      style={{ paddingLeft: 20 + depth * 8 }}
    >
      <Link to={leaf.href}>{leaf.label}</Link>
      {leaf.badge && <span className="docs-leaf-badge">{leaf.badge}</span>}
    </li>
  )
}
