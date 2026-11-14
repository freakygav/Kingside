import { useEffect, useState } from 'react'
import { formatClock } from '@shared/clock'
import type { Color } from '@shared/types'
import type { GameSession } from '../game/session'
import { PIECE_URL } from '../pieces'

const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }

/** Pieces `color` has captured, plus its material lead (0 if behind). */
export function capturedBy(fen: string, color: Color): { pieces: string[]; lead: number } {
  const placement = fen.split(' ')[0]
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } } as Record<Color, Record<string, number>>
  for (const ch of placement) {
    const t = ch.toLowerCase()
    if (!(t in VAL)) continue
    count[ch === t ? 'b' : 'w'][t]++
  }
  const opp: Color = color === 'w' ? 'b' : 'w'
  const pieces: string[] = []
  for (const t of ['p', 'n', 'b', 'r', 'q']) {
    const missing = Math.max(0, START_COUNT[t] - count[opp][t])
    for (let i = 0; i < missing; i++) pieces.push(opp + t.toUpperCase())
  }
  const mat = (c: Color) => Object.entries(count[c]).reduce((s, [t, n]) => s + VAL[t] * n, 0)
  return { pieces, lead: Math.max(0, mat(color) - mat(opp)) }
}

function ClockFace({ session, color, live }: { session: GameSession; color: Color; live: boolean }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setTick((t) => t + 1), 100)
    return () => clearInterval(id)
  }, [live])
  const ms = session.clock.timeLeft(color, performance.now())
  const running = session.status === 'playing' && session.clock.runningColor === color
  return (
    <div className={`clock${running ? ' running' : ''}${ms < 30_000 ? ' low' : ''}${ms <= 0 ? ' flagged' : ''}`} data-testid={`clock-${color}`}>
      {formatClock(ms)}
    </div>
  )
}

interface Props {
  name: string
  subtitle?: string
  avatar: 'bot' | 'you'
  color: Color
  fen: string
  session?: GameSession
  thinking?: boolean
  accuracy?: number | null
  /** Static clock value (review), when no live session clock applies. */
  staticClockMs?: number | null
}

export function PlayerBar(p: Props) {
  const cap = capturedBy(p.fen, p.color)
  return (
    <div className="player-bar">
      <div className={`avatar ${p.avatar} ${p.color === 'w' ? 'white' : 'black'}`}>
        {p.avatar === 'bot' ? (
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <rect x="5" y="7" width="14" height="11" rx="3" fill="currentColor" />
            <circle cx="9.5" cy="12" r="1.6" fill="var(--avatar-eye)" />
            <circle cx="14.5" cy="12" r="1.6" fill="var(--avatar-eye)" />
            <rect x="11.2" y="3" width="1.6" height="4" fill="currentColor" />
            <circle cx="12" cy="3" r="1.4" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <circle cx="12" cy="8.5" r="4" fill="currentColor" />
            <path d="M4 20c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5" fill="currentColor" />
          </svg>
        )}
      </div>
      <div className="player-meta">
        <div className="player-name">
          {p.name}
          {p.subtitle && <span className="player-sub">{p.subtitle}</span>}
          {p.thinking && <span className="thinking" title="Thinking"><i /><i /><i /></span>}
        </div>
        <div className="captured">
          {cap.pieces.map((c, i) => (
            <img key={i} src={PIECE_URL[c]} alt="" className={i > 0 && cap.pieces[i - 1][1] !== c[1] ? 'gap' : ''} />
          ))}
          {cap.lead > 0 && <span className="lead">+{cap.lead}</span>}
        </div>
      </div>
      {p.accuracy !== undefined && p.accuracy !== null && <div className="acc-chip">{p.accuracy.toFixed(1)}%</div>}
      {p.session && <ClockFace session={p.session} color={p.color} live={p.session.status === 'playing'} />}
      {!p.session && p.staticClockMs != null && <div className="clock">{formatClock(p.staticClockMs)}</div>}
    </div>
  )
}
