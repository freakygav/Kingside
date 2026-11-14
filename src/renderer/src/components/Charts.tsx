import { useRef, useState } from 'react'

/**
 * Small single-series charts. The title (rendered by the caller) names the series, so there is no
 * legend. One hue (brand amber) for the data, recessive grid, 2px lines, hover tooltips.
 */

interface LinePoint {
  t: number
  v: number
}

export function LineChart({ points, height = 140, format = (v) => String(Math.round(v)), empty = 'No data yet' }: { points: LinePoint[]; height?: number; format?: (v: number) => string; empty?: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  if (points.length < 2) return <div className="chart-empty">{points.length === 1 ? `${format(points[0].v)} — one data point so far` : empty}</div>
  const W = 520
  const H = height
  const pad = { l: 40, r: 10, t: 10, b: 20 }
  const vs = points.map((p) => p.v)
  let lo = Math.min(...vs)
  let hi = Math.max(...vs)
  if (hi - lo < 40) {
    lo -= 20
    hi += 20
  }
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b)
  const ticks = [lo, (lo + hi) / 2, hi]
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const fx = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((fx - pad.l) / (W - pad.l - pad.r)) * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }
  const hp = hover !== null ? points[hover] : null
  return (
    <div className="chart-wrap">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} className="axis" textAnchor="end">{format(t)}</text>
          </g>
        ))}
        <path d={d} className="series-line" />
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1].v)} r={4} className="series-dot" />
        {hp && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={H - pad.b} className="crosshair" />
            <circle cx={x(hover!)} cy={y(hp.v)} r={4} className="series-dot" />
          </>
        )}
      </svg>
      {hp && (
        <div className="chart-tip" style={{ left: `${(x(hover!) / W) * 100}%` }}>
          <b>{format(hp.v)}</b>
          <span>{new Date(hp.t).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  )
}

export function BarChart({ bars, height = 120, unit = '' }: { bars: { label: string; v: number; title?: string }[]; height?: number; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 520
  const H = height
  const pad = { l: 8, r: 8, t: 8, b: 20 }
  const max = Math.max(1, ...bars.map((b) => b.v))
  const bw = (W - pad.l - pad.r) / bars.length
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" onMouseLeave={() => setHover(null)} role="img">
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} className="grid" />
        {bars.map((b, i) => {
          const h = (b.v / max) * (H - pad.t - pad.b)
          const bx = pad.l + i * bw + 1
          const w = Math.max(2, bw - 2)
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {b.v > 0 && <path d={roundedTop(bx, H - pad.b, w, h)} className={`series-bar${hover === i ? ' active' : ''}`} />}
              {(i === 0 || i === bars.length - 1 || i % 7 === 0) && (
                <text x={bx + w / 2} y={H - 6} className="axis" textAnchor="middle">{b.label}</text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((pad.l + (hover + 0.5) * bw) / W) * 100}%` }}>
          <b>{bars[hover].v}{unit}</b>
          <span>{bars[hover].title ?? bars[hover].label}</span>
        </div>
      )}
    </div>
  )
}

function roundedTop(x: number, base: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h)
  const top = base - h
  return `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${base} Z`
}

/** Horizontal bars for proportions (0..1), value labels in text colour. */
export function HBars({ rows }: { rows: { label: string; value: number; detail: string }[] }) {
  if (rows.length === 0) return <div className="chart-empty">Solve a few puzzles to see your theme accuracy.</div>
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hbar-row" title={r.detail}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track"><span className="hbar-fill" style={{ width: `${Math.max(2, r.value * 100)}%` }} /></span>
          <span className="hbar-value">{Math.round(r.value * 100)}%</span>
        </div>
      ))}
    </div>
  )
}
