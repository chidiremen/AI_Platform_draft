import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useApp } from '../store'
import { useThemeStore } from '../hooks/useThemes'
import type { ThemeSummary } from '../types'
import * as api from '../api'
import { ASPICE_PROCESSES, CATEGORY_COLORS } from '../data/aspice'
import { TOOL_TYPES, TOOL_TYPE_MAP } from '../data/toolTypes'
import { WORK_CATEGORIES } from '../data/workCategories'
import { isAdminRole } from '../data/users'

const FUNNEL_PALETTE = ['#3a8dde', '#41c7b9', '#b88ad6', '#e0a458', '#e07a8b']

const CHART_AXIS = '#6b7d99'
const GRID = '#1d3556'

const tooltipStyle = {
  background: '#0e1b30',
  border: '1px solid #24426e',
  borderRadius: 8,
  color: '#e8eef7',
  fontSize: 13,
}

/**
 * テーマ（進行中の取り組み）の状況パネル。
 *
 * 成果物になった分だけを見ていると「いま何が動いているか」が分からない。
 * 着手中・停滞・凍結を並べて、途中の取り組みと止まった取り組みも
 * 部門として把握できるようにする。
 */
function ThemeStatusPanel() {
  const store = useThemeStore()
  const [summary, setSummary] = useState<ThemeSummary | null>(null)
  const loadSummary = store.loadSummary

  useEffect(() => {
    void loadSummary().then(setSummary).catch(() => setSummary(null))
  }, [loadSummary])

  if (!summary) return null
  const s = summary
  const live = s.byStatus.active + s.byStatus.recruiting

  return (
    <div className="dash-card col-12">
      <h3>🚀 進行中のテーマ</h3>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-num">{live}</div>
          <div className="kpi-lbl">動いているテーマ</div>
          <div className="kpi-sub">着手中 {s.byStatus.active} / 募集中 {s.byStatus.recruiting}</div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{s.stalled}</div>
          <div className="kpi-lbl">停滞（要フォロー）</div>
          <div className="kpi-sub">{s.stalledAfterDays}日以上 進捗なし</div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{s.byStatus.frozen}</div>
          <div className="kpi-lbl">凍結（知見として蓄積）</div>
          <div className="kpi-sub">理由つきで記録済み</div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{s.ideaOpen}</div>
          <div className="kpi-lbl">未着手のアイデア</div>
          <div className="kpi-sub">実装者を待っている</div>
        </div>
      </div>

      {s.frozenReasons.length > 0 && (
        <>
          <h4 className="filter-group-label">🧊 凍結したテーマと、その理由</h4>
          <ul className="theme-frozen-digest">
            {s.frozenReasons.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link to={`/themes/${r.id}`}>{r.title}</Link>
                <span className="dim"> — {r.owner}</span>
                <p>{r.reason}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link className="btn btn-ghost btn-sm" to="/themes">
        テーマ一覧へ →
      </Link>
    </div>
  )
}

export default function DashboardPage() {
  const { tools: allTools, currentUser, mode } = useApp()
  const isAdmin = isAdminRole(currentUser?.role)

  // 権限によるスコープ：管理者は全ツール、メンバーは自分が登録したツールのみ
  const tools = useMemo(
    () => (isAdmin ? allTools : allTools.filter((t) => t.author === currentUser?.name)),
    [allTools, isAdmin, currentUser],
  )

  // 実APIモード: 閲覧/インプレッション/ファネルはバックエンドの集計(ActivityLog)を使う。
  // （一覧シリアライザに含まれないため、クライアント集計では0になる）
  const [apiSummary, setApiSummary] = useState<api.DashboardSummary | null>(null)
  const [apiFunnel, setApiFunnel] = useState<api.DashboardFunnelStage[] | null>(null)

  useEffect(() => {
    if (mode !== 'api') return
    let active = true
    ;(async () => {
      try {
        const [summary, funnel] = await Promise.all([
          api.dashboardSummary(),
          api.dashboardFunnel(),
        ])
        if (!active) return
        setApiSummary(summary)
        setApiFunnel(funnel.funnel)
      } catch {
        /* 取得失敗時はクライアント集計にフォールバック */
      }
    })()
    return () => {
      active = false
    }
  }, [mode, currentUser])

  const clientTotals = useMemo(() => {
    const impressions = tools.reduce((s, t) => s + t.impressions, 0)
    const views = tools.reduce((s, t) => s + t.views, 0)
    const requests = tools.reduce((s, t) => s + (t.accessRequests ?? 0), 0)
    const downloads = tools.reduce((s, t) => s + (t.downloads ?? 0), 0)
    const hours = tools.reduce((s, t) => s + (t.effectHoursPerMonth ?? 0), 0)
    return { impressions, views, requests, downloads, hours }
  }, [tools])

  // 実APIモードかつ集計取得済みならバックエンド集計を優先
  const totals =
    mode === 'api' && apiSummary
      ? {
          impressions: apiSummary.total_impressions,
          views: apiSummary.total_views,
          requests: apiSummary.total_requests,
          downloads: apiSummary.total_downloads,
          hours: clientTotals.hours,
        }
      : clientTotals

  const funnelData = useMemo(() => {
    if (mode === 'api' && apiFunnel) {
      return apiFunnel.map((s, i) => ({
        name: s.label,
        value: s.count,
        fill: FUNNEL_PALETTE[i % FUNNEL_PALETTE.length],
      }))
    }
    return [
      { name: 'インプレッション', value: totals.impressions, fill: '#3a8dde' },
      { name: '詳細閲覧', value: totals.views, fill: '#41c7b9' },
      { name: '申請 / DL', value: totals.requests + totals.downloads, fill: '#e0a458' },
    ]
  }, [mode, apiFunnel, totals])

  const aspiceDist = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of tools)
      for (const p of t.aspiceProcesses) counts[p] = (counts[p] ?? 0) + 1
    return ASPICE_PROCESSES.map((p) => ({
      id: p.id,
      count: counts[p.id] ?? 0,
      color: CATEGORY_COLORS[p.category],
    }))
  }, [tools])

  const typeDist = useMemo(
    () =>
      TOOL_TYPES.map((t) => ({
        name: t.label,
        value: tools.filter((x) => x.toolType === t.value).length,
        color: t.color,
      })).filter((d) => d.value > 0),
    [tools],
  )

  const workDist = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of tools) {
      for (const c of t.workCategories ?? []) counts[c] = (counts[c] ?? 0) + 1
    }
    return WORK_CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      count: counts[c.id] ?? 0,
      color: c.color,
    }))
  }, [tools])

  const monthlyTrend = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of tools) {
      const m = t.createdAt.slice(0, 7)
      counts[m] = (counts[m] ?? 0) + 1
    }
    const months = Object.keys(counts).sort()
    let cumulative = 0
    return months.map((m) => {
      cumulative += counts[m]
      return { month: m, 月次: counts[m], 累計: cumulative }
    })
  }, [tools])

  const ranking = useMemo(
    () => [...tools].sort((a, b) => b.likes - a.likes).slice(0, 5),
    [tools],
  )

  const emptyProcesses = aspiceDist.filter((d) => d.count === 0).map((d) => d.id)

  // 直近月の新規登録数（monthlyTrend 末尾）
  const latestMonthAdded = monthlyTrend.length ? monthlyTrend[monthlyTrend.length - 1].月次 : 0

  return (
    <div className="container section">
      <h1 className="page-title">📊 ダッシュボード</h1>
      <p className="page-sub">
        {isAdmin ? (
          <>AI活用率をファネルメトリクスとして定量把握する（組織全体ビュー）</>
        ) : (
          <>
            あなたが登録したツールのメトリクスです（メンバービュー）。組織全体の指標は管理者のみ閲覧できます。
          </>
        )}
      </p>
      {!isAdmin && tools.length === 0 && (
        <div className="empty">
          まだツールを登録していません。ツールを登録すると、ここに利用状況が表示されます。
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi">
          <div className="kpi-num">{tools.length}</div>
          <div className="kpi-lbl">登録ツール総数</div>
          <div className="kpi-sub">＋{latestMonthAdded} 件（直近月）</div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{totals.impressions.toLocaleString()}</div>
          <div className="kpi-lbl">インプレッション数</div>
          <div className="kpi-sub">閲覧 {totals.views.toLocaleString()} 回</div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{totals.requests + totals.downloads}</div>
          <div className="kpi-lbl">アクセス権申請 / DL（最重要KPI）</div>
          <div className="kpi-sub">
            変換率{' '}
            {totals.impressions > 0
              ? (((totals.requests + totals.downloads) / totals.impressions) * 100).toFixed(1)
              : '0.0'}
            %
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{totals.hours}h</div>
          <div className="kpi-lbl">累計削減工数 / 月（自己申告）</div>
          <div className="kpi-sub">Layer 2 データ</div>
        </div>
      </div>

      <div className="dash-grid">
        <ThemeStatusPanel />

        {/* ファネル */}
        <div className="dash-card col-4">
          <h3>ファネル（インプレッション → 閲覧 → 申請）</h3>
          <ResponsiveContainer width="100%" height={260}>
            <FunnelChart>
              <Tooltip contentStyle={tooltipStyle} />
              <Funnel dataKey="value" data={funnelData} isAnimationActive>
                <LabelList
                  position="right"
                  fill="#e8eef7"
                  stroke="none"
                  dataKey="name"
                  fontSize={12}
                />
                <LabelList
                  position="center"
                  fill="#0a1424"
                  stroke="none"
                  dataKey="value"
                  fontSize={13}
                  fontWeight={700}
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>

        {/* A-SPICE分布 */}
        <div className="dash-card col-8">
          <h3>A-SPICEプロセス別 ツール分布</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={aspiceDist} margin={{ top: 10, right: 10, bottom: 4, left: -20 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="id" stroke={CHART_AXIS} fontSize={11} interval={0} angle={-35} textAnchor="end" height={50} />
              <YAxis stroke={CHART_AXIS} fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {aspiceDist.map((d) => (
                  <Cell key={d.id} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {emptyProcesses.length > 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--amber)', margin: '6px 0 0' }}>
              ⚠️ 空白領域（ツール未登録）: {emptyProcesses.join(', ')}
            </p>
          )}
        </div>

        {/* 業務シーン分布 */}
        <div className="dash-card col-12">
          <h3>業務シーン別 ツール分布</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={workDist} margin={{ top: 10, right: 10, bottom: 4, left: -20 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="name" stroke={CHART_AXIS} fontSize={11} interval={0} />
              <YAxis stroke={CHART_AXIS} fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {workDist.map((d) => (
                  <Cell key={d.id} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 月次推移 */}
        <div className="dash-card col-6">
          <h3>登録ツール 月次推移</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthlyTrend} margin={{ top: 10, right: 16, bottom: 4, left: -20 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="month" stroke={CHART_AXIS} fontSize={11} />
              <YAxis stroke={CHART_AXIS} fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="累計" stroke="#4f9dde" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="月次" stroke="#41c7b9" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 種別分布 */}
        <div className="dash-card col-3" style={{ gridColumn: 'span 3' }}>
          <h3>ツール種別分布</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={typeDist}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={45}
                paddingAngle={2}
              >
                {typeDist.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 人気ランキング */}
        <div className="dash-card col-3" style={{ gridColumn: 'span 3' }}>
          <h3>人気ツール（いいね数）</h3>
          <div className="rank-list">
            {ranking.map((t, i) => (
              <Link key={t.id} to={`/tools/${t.id}`} className="rank-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className={`rank-num ${i === 0 ? 'top' : ''}`}>{i + 1}</span>
                <span className="rank-title">{t.title}</span>
                <span className="rank-val">♥ {t.likes}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 18 }}>
        ※ 数値はデモ用ダミーデータです（{TOOL_TYPE_MAP['copilot_agent'].label} 他）。
      </p>
    </div>
  )
}
