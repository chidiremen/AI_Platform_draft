import { useMemo } from 'react'
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
import { ASPICE_PROCESSES, CATEGORY_COLORS } from '../data/aspice'
import { TOOL_TYPES, TOOL_TYPE_MAP } from '../data/toolTypes'
import { WORK_CATEGORIES } from '../data/workCategories'

const CHART_AXIS = '#6b7d99'
const GRID = '#1d3556'

const tooltipStyle = {
  background: '#0e1b30',
  border: '1px solid #24426e',
  borderRadius: 8,
  color: '#e8eef7',
  fontSize: 13,
}

export default function DashboardPage() {
  const { tools } = useApp()

  const totals = useMemo(() => {
    const impressions = tools.reduce((s, t) => s + t.impressions, 0)
    const views = tools.reduce((s, t) => s + t.views, 0)
    const requests = tools.reduce((s, t) => s + (t.accessRequests ?? 0), 0)
    const downloads = tools.reduce((s, t) => s + (t.downloads ?? 0), 0)
    const hours = tools.reduce((s, t) => s + (t.effectHoursPerMonth ?? 0), 0)
    return { impressions, views, requests, downloads, hours }
  }, [tools])

  const funnelData = useMemo(
    () => [
      { name: 'インプレッション', value: totals.impressions, fill: '#3a8dde' },
      { name: '詳細閲覧', value: totals.views, fill: '#41c7b9' },
      {
        name: '申請 / DL',
        value: totals.requests + totals.downloads,
        fill: '#e0a458',
      },
    ],
    [totals],
  )

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

  return (
    <div className="container section">
      <h1 className="page-title">📊 管理者ダッシュボード</h1>
      <p className="page-sub">AI活用率をファネルメトリクスとして定量把握する</p>

      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi">
          <div className="kpi-num">{tools.length}</div>
          <div className="kpi-lbl">登録ツール総数</div>
          <div className="kpi-sub">＋3 件（今月）</div>
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
            変換率 {((totals.requests + totals.downloads) / totals.impressions * 100).toFixed(1)}%
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{totals.hours}h</div>
          <div className="kpi-lbl">累計削減工数 / 月（自己申告）</div>
          <div className="kpi-sub">Layer 2 データ</div>
        </div>
      </div>

      <div className="dash-grid">
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
