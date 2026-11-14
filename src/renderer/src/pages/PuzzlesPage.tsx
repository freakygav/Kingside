import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { formatLine, legalDests, parseUci, uciLineToSan } from '@shared/chessUtil'
import { analyzeMove, materialSwing } from '@shared/coach/motifs'
import { NAME } from '@shared/coach/features'
import { bandFor, primaryTheme, PUZZLE_CATEGORIES, RATING_BANDS, THEME_TEXT, unpackPuzzle, type PackedPuzzle, type PuzzleRecord } from '@shared/puzzles'
import { expectedScore } from '@shared/rating'
import type { BoardTheme, Color } from '@shared/types'
import puzzlesJson from '../data/puzzles.json'
import { Board, type BoardMovable, type Promo } from '../components/Board'
import { BarChart, HBars, LineChart } from '../components/Charts'
import { analyzeFen } from '../game/analysisCache'
import { sounds } from '../game/sound'
import { useProfile } from '../profile'

const ALL: PuzzleRecord[] = (puzzlesJson as unknown as PackedPuzzle[]).map(unpackPuzzle)

type Phase = 'setup' | 'solving' | 'solved' | 'failed-review'

interface Props {
  theme: BoardTheme
  showCoords: boolean
  showLegal: boolean
  target: string | null
  onTargetHandled: () => void
  onAnalyze: (fen: string) => void
}

export function PuzzlesPage(props: Props) {
  const [tab, setTab] = useState<'train' | 'stats'>('train')
  return (
    <main className="page-split" data-testid="puzzles-page">
      <div className="sub-tabs">
        <button className={tab === 'train' ? 'active' : ''} onClick={() => setTab('train')}>Train</button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')} data-testid="puzzle-stats-tab">Statistics</button>
      </div>
      {tab === 'train' ? <Trainer {...props} /> : <PuzzleStats />}
    </main>
  )
}

function Trainer({ theme, showCoords, showLegal, target, onTargetHandled, onAnalyze }: Props) {
  const { profile, send } = useProfile()
  const [category, setCategory] = useState('mix')
  const [band, setBand] = useState<string>('auto')
  const [puzzle, setPuzzle] = useState<PuzzleRecord | null>(null)
  const [chess, setChess] = useState(() => new Chess())
  const [idx, setIdx] = useState(1)
  const [last, setLast] = useState<{ from: Square; to: Square } | null>(null)
  const [phase, setPhase] = useState<Phase>('setup')
  const [rated, setRated] = useState<{ result: 'win' | 'half' | 'loss'; delta: number } | null>(null)
  const [hints, setHints] = useState(0)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [mistakes, setMistakes] = useState(0)
  const startedAt = useRef(0)
  const token = useRef(0)
  /** Set synchronously so a puzzle is never rated twice (a miss followed by a solve). */
  const recorded = useRef(false)

  useEffect(() => {
    if (target) {
      setCategory(target)
      onTargetHandled()
    }
  }, [target, onTargetHandled])

  const rating = profile?.puzzles.rating ?? 1000
  const effectiveBand = band === 'auto' ? bandFor(rating).id : band
  const pool = useMemo(() => {
    const cat = PUZZLE_CATEGORIES.find((c) => c.id === category)!
    const b = RATING_BANDS.find((x) => x.id === effectiveBand)!
    return ALL.filter((p) => cat.match(new Set(p.themes)) && p.rating >= b.min && p.rating < b.max)
  }, [category, effectiveBand])

  const userColor: Color = useMemo(() => {
    if (!puzzle) return 'w'
    return new Chess(puzzle.fen).turn() === 'w' ? 'b' : 'w'
  }, [puzzle])

  const load = useCallback(() => {
    if (pool.length === 0) return
    const seen = new Set((profile?.puzzles.history ?? []).slice(0, 300).map((h) => h.id))
    const fresh = pool.filter((p) => !seen.has(p.id))
    const list = fresh.length ? fresh : pool
    const p = list[Math.floor(Math.random() * list.length)]
    const my = ++token.current
    setPuzzle(p)
    setChess(new Chess(p.fen))
    setLast(null)
    setIdx(1)
    setHints(0)
    setMistakes(0)
    setRated(null)
    recorded.current = false
    setFeedback(null)
    setPhase('setup')
    setBusy(true)
    // Play the opponent's set-up move after a beat, so the user sees what happened.
    setTimeout(() => {
      if (token.current !== my) return
      const c = new Chess(p.fen)
      const m = c.move(parseUci(p.moves[0])!)
      setChess(c)
      setLast({ from: m.from, to: m.to })
      setBusy(false)
      setPhase('solving')
      startedAt.current = Date.now()
      sounds.move()
    }, 700)
  }, [pool, profile])

  const recordResult = useCallback(async (result: 'win' | 'half' | 'loss') => {
    if (!puzzle || recorded.current) return
    recorded.current = true
    const out = await send({ type: 'puzzleResult', id: puzzle.id, puzzleRating: puzzle.rating, result, ms: Date.now() - startedAt.current, hints, themes: puzzle.themes })
    setRated({ result, delta: out?.ratingDelta ?? 0 })
  }, [puzzle, send, hints])

  const finishSolved = useCallback(() => {
    setPhase('solved')
    sounds.end()
    void recordResult(mistakes > 0 ? 'loss' : hints > 0 ? 'half' : 'win')
  }, [recordResult, mistakes, hints])

  const playOpponent = (c: Chess, at: number) => {
    if (!puzzle) return
    setBusy(true)
    setTimeout(() => {
      const n = new Chess(c.fen())
      const m = n.move(parseUci(puzzle.moves[at])!)
      setChess(n)
      setLast({ from: m.from, to: m.to })
      setIdx(at + 1)
      setBusy(false)
      sounds.move()
    }, 450)
  }

  const onMove = (from: Square, to: Square, promotion?: Promo) => {
    if (!puzzle || phase !== 'solving' || busy) return
    const probe = new Chess(chess.fen())
    let mv
    try {
      mv = probe.move({ from, to, promotion })
    } catch {
      return
    }
    const uci = mv.from + mv.to + (mv.promotion ?? '')
    const expected = puzzle.moves[idx]
    const isLast = idx === puzzle.moves.length - 1
    // Lichess rule: the solution move, or any move that mates on the final move.
    const ok = uci === expected || (isLast && probe.isCheckmate())
    if (!ok) {
      sounds.illegal()
      setMistakes((n) => n + 1)
      void recordResult('loss')
      setFeedback({ ok: false, text: `${mv.san} is not the solution. Checking why…` })
      const fenBefore = chess.fen()
      void explainWrong(fenBefore, uci, mv.san).then((t) => setFeedback({ ok: false, text: t }))
      return
    }
    sounds.move()
    setChess(probe)
    setLast({ from: mv.from, to: mv.to })
    if (isLast || idx + 1 >= puzzle.moves.length) {
      setIdx(puzzle.moves.length)
      setFeedback({ ok: true, text: 'Correct!' })
      finishSolved()
      return
    }
    setFeedback({ ok: true, text: `${mv.san} — correct, keep going.` })
    playOpponent(probe, idx + 1)
  }

  const showSolution = () => {
    if (!puzzle) return
    void recordResult('loss')
    setPhase('failed-review')
    const c = new Chess(chess.fen())
    let i = idx
    const step = () => {
      if (i >= puzzle.moves.length) return
      const m = c.move(parseUci(puzzle.moves[i])!)
      setChess(new Chess(c.fen()))
      setLast({ from: m.from, to: m.to })
      i++
      setIdx(i)
      if (i < puzzle.moves.length) setTimeout(step, 650)
    }
    step()
  }

  const movable: BoardMovable | null = useMemo(() => {
    if (phase !== 'solving' || busy || chess.turn() !== userColor) return null
    const map = legalDests(chess)
    return { color: userColor, mode: 'move', dests: (f: Square) => map.get(f) ?? [] }
  }, [chess, phase, busy, userColor])

  const cat = PUZZLE_CATEGORIES.find((c) => c.id === category)!
  const expectedMove = puzzle && idx < puzzle.moves.length ? parseUci(puzzle.moves[idx]) : null
  const highlights: { square: string; kind: 'hint' | 'focus' }[] = []
  if (phase === 'solving' && expectedMove) {
    if (hints >= 2) highlights.push({ square: expectedMove.from, kind: 'hint' })
    if (hints >= 3) highlights.push({ square: expectedMove.to, kind: 'focus' })
  }
  const pt = puzzle ? primaryTheme(puzzle.themes) : null
  const hintText = () => {
    if (!puzzle || !expectedMove) return ''
    const piece = chess.get(expectedMove.from)
    const texts = [
      pt && THEME_TEXT[pt] ? `Idea: ${THEME_TEXT[pt].idea}` : 'Idea: look at every check, capture and threat first.',
      piece ? `Candidate: your ${NAME[piece.type]} on ${expectedMove.from} is the piece to move.` : '',
      `Destination: the ${piece ? NAME[piece.type] : 'piece'} goes to the highlighted square ${expectedMove.to}.`
    ]
    return texts.slice(0, hints).filter(Boolean)
  }
  const bandCounts = useMemo(() => {
    const c = PUZZLE_CATEGORIES.find((x) => x.id === category)!
    return Object.fromEntries(RATING_BANDS.map((b) => [b.id, ALL.filter((p) => c.match(new Set(p.themes)) && p.rating >= b.min && p.rating < b.max).length]))
  }, [category])
  const odds = puzzle ? Math.round(expectedScore(rating, puzzle.rating) * 100) : null

  return (
    <div className="stage puzzle-stage">
      <section className="board-col">
        <div className="puzzle-banner">
          {puzzle ? (
            <>
              <span className={`turn-dot ${userColor}`} /> <b>{userColor === 'w' ? 'White' : 'Black'} to move</b> · {cat.goal}
              <span className="muted small"> · Puzzle rating {puzzle.rating}</span>
            </>
          ) : (
            <span className="muted">Pick a category and difficulty, then press Start.</span>
          )}
        </div>
        <div className="board-wrap">
          <Board fen={chess.fen()} orientation={userColor} movable={movable} onMove={onMove} lastMove={last} theme={theme} showCoords={showCoords} showLegal={showLegal} highlights={highlights} annotationKey={puzzle?.id} />
        </div>
      </section>
      <aside className="side-panel">
        <div className="panel-body">
          <div className="puzzle-rating-row">
            <div><span className="stat-label">Puzzle rating</span><span className="big-num" data-testid="puzzle-rating">{rating}</span></div>
            <div><span className="stat-label">Streak</span><span className="big-num">{profile?.puzzles.streak ?? 0}</span></div>
            <div><span className="stat-label">Solved</span><span className="big-num">{profile?.puzzles.solved ?? 0}</span></div>
          </div>
          <label className="field">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="puzzle-category">
              {PUZZLE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Difficulty</span>
            <select value={band} onChange={(e) => setBand(e.target.value)} data-testid="puzzle-band">
              <option value="auto">Match my rating ({bandFor(rating).label})</option>
              {RATING_BANDS.map((b) => <option key={b.id} value={b.id} disabled={bandCounts[b.id] === 0}>{b.label} ({bandCounts[b.id]} puzzles)</option>)}
            </select>
          </label>
          {pool.length === 0 ? (
            <div className="warn-box">No bundled puzzles in this category at this rating. The lichess database has very few of them — try a neighbouring range.</div>
          ) : (
            <button className="primary-btn big" onClick={load} disabled={busy} data-testid="puzzle-start">{puzzle ? 'Next puzzle' : 'Start'}</button>
          )}

          {puzzle && (
            <div className="puzzle-status">
              {phase === 'setup' && <div className="muted">Watch the opponent's move…</div>}
              {feedback && <div className={`feedback ${feedback.ok ? 'ok' : 'bad'}`} data-testid="puzzle-feedback">{feedback.ok ? '✓ ' : '✗ '}{feedback.text}</div>}
              {phase === 'solving' && (
                <>
                  {hints > 0 && <ul className="hint-list">{(hintText() as string[]).map((h, i) => <li key={i}>{h}</li>)}</ul>}
                  <div className="row-btns">
                    <button className="ghost-btn small" disabled={hints >= 3} onClick={() => setHints((h) => Math.min(3, h + 1))} data-testid="puzzle-hint">💡 Hint {hints}/3</button>
                    <button className="ghost-btn small" onClick={showSolution}>Show solution</button>
                  </div>
                  <div className="muted small">{mistakes ? 'Rated as missed — keep trying for practice.' : hints ? 'Hints used: solving now counts as half credit.' : `Expected chance to solve at your rating: ${odds}%`}</div>
                </>
              )}
              {(phase === 'solved' || phase === 'failed-review') && (
                <SolvedCard puzzle={puzzle} rated={rated} onAnalyze={() => onAnalyze(chess.fen())} />
              )}
            </div>
          )}
          <p className="muted small attribution">
            Puzzles: lichess.org open database (CC0). {ALL.length.toLocaleString()} puzzles bundled for offline use; every solution was replayed and verified when the set was built.
          </p>
        </div>
      </aside>
    </div>
  )
}

/** Engine-backed explanation of a wrong puzzle move: what the opponent does in reply. */
async function explainWrong(fen: string, uci: string, san: string): Promise<string> {
  const after = new Chess(fen)
  after.move(parseUci(uci)!)
  if (after.isStalemate()) return `${san} stalemates — the game would be a draw. Try again.`
  try {
    const lines = await analyzeFen(after.fen(), 1, 500)
    const reply = lines[0]
    if (!reply?.pv[0]) return `${san} doesn't work here. Try again.`
    const rf = analyzeMove(after.fen(), reply.pv[0])
    const swing = -materialSwing(after.fen(), reply.pv, 4)
    const motif = rf?.motifs.find((m) => ['mate', 'backRankMate', 'fork', 'pin', 'skewer', 'discoveredAttack', 'capture', 'check'].includes(m.kind))
    let text = `${san} doesn't work: the opponent answers ${rf?.san ?? 'strongly'}`
    if (reply.mate !== undefined && reply.mate > 0) text += `, which leads to checkmate in ${reply.mate}`
    else if (motif) text += ` (${motif.text})`
    if (swing <= -2) text += ` and you end up ${-swing} points of material down`
    return `${text}. Try again.`
  } catch {
    const f = analyzeMove(fen, uci)
    const hang = f?.motifs.find((m) => m.kind === 'hangsPiece')
    return hang ? `${san} ${hang.text}. Try again.` : `${san} isn't the solution. Try again.`
  }
}

function SolvedCard({ puzzle, rated, onAnalyze }: { puzzle: PuzzleRecord; rated: { result: string; delta: number } | null; onAnalyze: () => void }) {
  const start = useMemo(() => {
    const c = new Chess(puzzle.fen)
    c.move(parseUci(puzzle.moves[0])!)
    return c.fen()
  }, [puzzle])
  const san = uciLineToSan(start, puzzle.moves.slice(1), 20)
  // Explain the solver's moves with real motif detection.
  const steps = useMemo(() => {
    const c = new Chess(start)
    const out: string[] = []
    puzzle.moves.slice(1).forEach((u, i) => {
      if (i % 2 === 0) {
        const f = analyzeMove(c.fen(), u)
        const all = f?.motifs.filter((x) => !['develops', 'hangsPiece'].includes(x.kind)) ?? []
        // A mating move is explained by the mate alone; incidental side-effects are noise.
        const mate = all.filter((x) => x.kind === 'mate' || x.kind === 'backRankMate')
        const m = (mate.length ? mate : all).slice(0, 2)
        if (f) out.push(`${f.san}${m && m.length ? ` — ${m.map((x) => x.text).join(', ')}` : ''}`)
      }
      c.move(parseUci(u)!)
    })
    return out
  }, [puzzle, start])
  const themes = puzzle.themes.filter((t) => THEME_TEXT[t]).slice(0, 4)
  return (
    <div className="solved-card" data-testid="puzzle-solved">
      {rated && (
        <div className={`rating-delta ${rated.delta >= 0 ? 'up' : 'down'}`}>
          {rated.result === 'win' ? 'Solved!' : rated.result === 'half' ? 'Solved with hints' : 'Missed'} · {rated.delta >= 0 ? '+' : ''}{rated.delta}
        </div>
      )}
      <div className="line"><span className="line-label">Solution</span> {formatLine(start, san)}</div>
      <ul className="why-list">{steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
      {themes.length > 0 && (
        <div className="theme-chips">{themes.map((t) => <span key={t} className="ach-chip" title={THEME_TEXT[t].idea}>{THEME_TEXT[t].name}</span>)}</div>
      )}
      {themes[0] && <p className="muted small">{THEME_TEXT[themes[0]].idea}</p>}
      <div className="row-btns">
        <button className="ghost-btn small" onClick={onAnalyze}>Ask a coach about this position</button>
        <button className="link-btn" onClick={() => void window.kingside.openExternal(`https://lichess.org/training/${puzzle.id}`)}>lichess #{puzzle.id}</button>
      </div>
    </div>
  )
}

function PuzzleStats() {
  const { profile } = useProfile()
  if (!profile) return null
  const p = profile.puzzles
  const acc = p.attempted ? Math.round((p.solved / p.attempted) * 100) : 0
  const clean = p.attempted ? Math.round((p.cleanSolved / p.attempted) * 100) : 0
  const avg = p.solved ? Math.round(p.totalSolveMs / p.solved / 1000) : 0
  const days = [...Array(14)].map((_, i) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (13 - i))
    const next = d.getTime() + 86_400_000
    const n = p.history.filter((h) => h.t >= d.getTime() && h.t < next && h.result !== 'loss').length
    return { label: `${d.getMonth() + 1}/${d.getDate()}`, v: n, title: d.toDateString() }
  })
  const themeRows = Object.entries(p.themeStats)
    .filter(([t, s]) => THEME_TEXT[t] && s.attempts >= 2)
    .sort((a, b) => b[1].attempts - a[1].attempts)
    .slice(0, 10)
    .map(([t, s]) => ({ label: THEME_TEXT[t].name, value: s.solved / s.attempts, detail: `${s.solved}/${s.attempts} solved` }))
  return (
    <div className="page stats-page" data-testid="puzzle-stats">
      <div className="dash-grid">
        <div className="stat-card"><span className="stat-label">Rating</span><span className="stat-value">{p.rating}</span></div>
        <div className="stat-card"><span className="stat-label">Solved</span><span className="stat-value">{p.solved}<small>/{p.attempted}</small></span></div>
        <div className="stat-card"><span className="stat-label">Accuracy</span><span className="stat-value">{acc}%</span><span className="muted small">{clean}% without hints or mistakes</span></div>
        <div className="stat-card"><span className="stat-label">Streak</span><span className="stat-value">{p.streak}</span><span className="muted small">best {p.bestStreak}</span></div>
        <div className="stat-card"><span className="stat-label">Avg. solve time</span><span className="stat-value">{avg}<small>s</small></span></div>
      </div>
      <div className="chart-grid">
        <div className="chart-card"><h3>Puzzle rating over time</h3><LineChart points={p.ratingHistory.map((h) => ({ t: h.t, v: h.r }))} empty="Solve puzzles to build your rating history." /></div>
        <div className="chart-card"><h3>Puzzles solved per day (last 14 days)</h3><BarChart bars={days} /></div>
        <div className="chart-card"><h3>Accuracy by theme</h3><HBars rows={themeRows} /></div>
        <div className="chart-card">
          <h3>Recent puzzles</h3>
          {p.history.length === 0 ? <div className="chart-empty">No puzzles yet.</div> : (
            <table className="hist-table">
              <tbody>
                {p.history.slice(0, 12).map((h) => (
                  <tr key={h.t + h.id}>
                    <td className={h.result === 'loss' ? 'bad-text' : 'good-text'}>{h.result === 'win' ? '✓' : h.result === 'half' ? '½' : '✗'}</td>
                    <td>{h.rating}</td>
                    <td className="muted">{h.themes.filter((t) => THEME_TEXT[t]).slice(0, 2).map((t) => THEME_TEXT[t].name).join(', ')}</td>
                    <td className={h.delta >= 0 ? 'good-text' : 'bad-text'}>{h.delta >= 0 ? '+' : ''}{h.delta}</td>
                    <td className="muted">{Math.round(h.ms / 1000)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
