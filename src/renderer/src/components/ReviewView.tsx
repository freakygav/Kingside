import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { formatLine, legalDests, parseUci, uciLineToSan } from '@shared/chessUtil'
import type { GameMeta } from '@shared/library'
import { buildReview, CLASS_LABEL, CLASS_ORDER, formatEval, THRESHOLDS, whiteCpOf, winProbability, type MoveClass, type PositionAnalysis, type ReviewResult } from '@shared/review'
import { getLevel, lineCp, levelLabel } from '@shared/strength'
import type { AnalysisLine, Color, Settings } from '@shared/types'
import { analyzeFen } from '../game/analysisCache'
import { openingFor, runReview } from '../game/reviewRunner'
import { resultText, type GameRecord } from '../game/session'
import { Board, type Arrow, type BoardMovable, type Promo } from './Board'
import { ClassIcon } from './ClassIcon'
import { MoveList, NavControls } from './MoveList'
import { PlayerBar } from './PlayerBar'
import { CoachReview } from './CoachReview'

/** Extra context when reviewing a game from the import library (Chess.com, Lichess, PGN). */
export interface ImportedContext {
  meta: GameMeta
  /** Which side "you" played, if known. */
  userColor: Color | null
  /** Previously computed analysis (loaded instead of re-running Stockfish). */
  cached: { positions: PositionAnalysis[]; bookPlies: number } | null
  /** Start the engine immediately (the "Analyze" action) instead of waiting for a click. */
  autoStart: boolean
  onAnalyzed: (positions: PositionAnalysis[], bookPlies: number, review: ReviewResult, movetimeMs: number) => void
  onExport: () => void
  /** Original PGN text (kept untouched). */
  pgn: string
}

interface Props {
  record: GameRecord
  settings: Settings
  onExit: () => void
  onOpenLesson: (id: string) => void
  onOpenPuzzles: (category: string) => void
  onAnalyze: (fen: string) => void
  imported?: ImportedContext
}

const NOTABLE: MoveClass[] = ['brilliant', 'great', 'inaccuracy', 'mistake', 'blunder', 'miss']

function pgnOf(record: GameRecord): string {
  const c = new Chess(record.startFen)
  const bot = `Kingside Bot (${levelLabel(getLevel(record.levelId))})`
  c.setHeader('Event', 'Kingside rapid vs bot')
  c.setHeader('Date', record.date.slice(0, 10).replace(/-/g, '.'))
  c.setHeader('White', record.playerColor === 'w' ? 'You' : bot)
  c.setHeader('Black', record.playerColor === 'b' ? 'You' : bot)
  c.setHeader('TimeControl', '600')
  const r = record.result
  const res = !r || r.reason === 'abort' ? '*' : r.winner === 'w' ? '1-0' : r.winner === 'b' ? '0-1' : '1/2-1/2'
  c.setHeader('Result', res)
  for (const m of record.moves) c.move(parseUci(m.uci)!)
  return c.pgn()
}

const SOURCE_LABEL: Record<string, string> = { chesscom: 'Chess.com', lichess: 'Lichess', pgn: 'PGN file' }

export function ReviewView({ record, settings, onExit, onOpenLesson, onOpenPuzzles, onAnalyze, imported }: Props) {
  const [tab, setTab] = useState<'analysis' | 'coach'>('analysis')
  const [positions, setPositions] = useState<PositionAnalysis[] | null>(null)
  const [bookPlies, setBookPlies] = useState(0)
  const total = record.moves.length
  const [ply, setPly] = useState(imported ? 0 : total)
  const perspectiveDefault: Color = imported ? imported.userColor ?? 'w' : record.playerColor
  const [perspective, setPerspective] = useState<Color>(perspectiveDefault)
  const [orientation, setOrientation] = useState<Color>(perspectiveDefault)
  const [progress, setProgress] = useState<{ done: number; total: number; positions: PositionAnalysis[] }>({ done: 0, total: record.fens.length, positions: [] })
  const [review, setReview] = useState<ReviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failures, setFailures] = useState(0)
  const [copied, setCopied] = useState(false)
  const [runId, setRunId] = useState(0)
  const [started, setStarted] = useState(!imported || imported.autoStart)
  const [ms, setMs] = useState(settings.analysisMs)
  const [cancelledMsg, setCancelledMsg] = useState(false)
  const [usedCache, setUsedCache] = useState(!!imported?.cached)
  const [replaying, setReplaying] = useState(false)
  const [explore, setExplore] = useState<{ base: number; line: { san: string; uci: string; fen: string }[] } | null>(null)
  const [exploreLines, setExploreLines] = useState<AnalysisLine[] | null>(null)
  const cancelled = useRef(false)
  const onAnalyzedRef = useRef(imported?.onAnalyzed)
  onAnalyzedRef.current = imported?.onAnalyzed

  // Cached analysis: rebuild the review instantly, no engine needed (works offline).
  useEffect(() => {
    if (!usedCache || !imported?.cached || imported.cached.positions.length !== total + 1) return
    const r = buildReview(record.moves.map((m) => ({ san: m.san, uci: m.uci, color: m.color })), imported.cached.positions, imported.cached.bookPlies)
    setReview(r)
    setPositions(imported.cached.positions)
    setBookPlies(imported.cached.bookPlies)
    setProgress({ done: total + 1, total: total + 1, positions: imported.cached.positions })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedCache])

  useEffect(() => {
    if (usedCache || !started) return
    // Each run gets its own token, so a cancelled run can never resume when a new one starts.
    const run = { cancelled: false }
    cancelled.current = false
    setReview(null)
    setError(null)
    setCancelledMsg(false)
    if (total === 0) return
    runReview(record, ms, setProgress, () => run.cancelled)
      .then((r) => {
        if (run.cancelled) return
        setReview(r.review)
        setFailures(r.failures)
        setPositions(r.positions)
        setBookPlies(r.bookPlies)
        onAnalyzedRef.current?.(r.positions, r.bookPlies, r.review, ms)
      })
      .catch((e: Error) => {
        if (!run.cancelled) setError(e.message)
      })
    return () => {
      run.cancelled = true
      cancelled.current = true
      void window.kingside.stop('analysis')
    }
  }, [record, ms, runId, total, started, usedCache])

  const cancelAnalysis = () => {
    setStarted(false)
    setCancelledMsg(true)
  }
  const startAnalysis = () => {
    setUsedCache(false)
    setReview(null)
    setStarted(true)
    setRunId((n) => n + 1)
  }

  // Replay: step through the game automatically.
  useEffect(() => {
    if (!replaying) return
    const t = setInterval(() => {
      setPly((p) => {
        if (p >= total) {
          setReplaying(false)
          return p
        }
        return p + 1
      })
    }, 900)
    return () => clearInterval(t)
  }, [replaying, total])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return
      if (explore) return
      if (e.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1))
      else if (e.key === 'ArrowRight') setPly((p) => Math.min(total, p + 1))
      else if (e.key === 'Home') setPly(0)
      else if (e.key === 'End') setPly(total)
      else if (e.key === 'f' || e.key === 'F') setOrientation((o) => (o === 'w' ? 'b' : 'w'))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total, explore])

  const exploreFen = explore ? (explore.line.length ? explore.line[explore.line.length - 1].fen : record.fens[explore.base]) : null
  useEffect(() => {
    if (!exploreFen) return
    let alive = true
    setExploreLines(null)
    analyzeFen(exploreFen, 3, 700).then((l) => alive && setExploreLines(l)).catch(() => alive && setExploreLines([]))
    return () => {
      alive = false
    }
  }, [exploreFen])

  const opening = useMemo(() => openingFor(record.fens), [record])
  const fen = exploreFen ?? record.fens[ply]
  const move = ply > 0 ? record.moves[ply - 1] : null
  const rm = review && ply > 0 && !explore ? review.moves[ply - 1] : null
  const chessAtPly = useMemo(() => new Chess(fen), [fen])
  let checkSquare: Square | null = null
  if (chessAtPly.inCheck()) {
    for (const row of chessAtPly.board()) for (const p of row) if (p && p.type === 'k' && p.color === chessAtPly.turn()) checkSquare = p.square
  }

  const pos = progress.positions[ply]
  const exploreCp = explore && exploreLines?.[0] ? (chessAtPly.turn() === 'w' ? lineCp(exploreLines[0]) : -lineCp(exploreLines[0])) : null
  const whiteCp = explore ? exploreCp : review ? review.whiteCp[ply] : pos && !pos.failed ? whiteCpOf(pos) : null

  const arrows: Arrow[] = []
  if (rm && rm.bestUci && rm.bestUci !== rm.uci && rm.cls && !['best', 'book', 'forced', 'brilliant', 'great'].includes(rm.cls)) {
    const b = parseUci(rm.bestUci)
    if (b) arrows.push({ from: b.from, to: b.to, color: 'best' })
  }
  if (explore && exploreLines?.[0]?.pv[0]) {
    const b = parseUci(exploreLines[0].pv[0])
    if (b) arrows.push({ from: b.from, to: b.to, color: 'best' })
  }

  // Exploring is a separate, throw-away line: the game itself is never modified.
  const exploreMovable: BoardMovable | null = useMemo(() => {
    if (!explore) return null
    const map = legalDests(chessAtPly)
    return { color: chessAtPly.turn(), mode: 'move', dests: (f: Square) => map.get(f) ?? [] }
  }, [explore, chessAtPly])
  const onExploreMove = (from: Square, to: Square, promotion?: Promo) => {
    if (!explore) return
    const c = new Chess(fen)
    const m = c.move({ from, to, promotion })
    setExplore({ ...explore, line: [...explore.line, { san: m.san, uci: m.from + m.to + (m.promotion ?? ''), fen: c.fen() }] })
  }
  const exploreLast = explore?.line.length ? parseUci(explore.line[explore.line.length - 1].uci) : null

  const youColor = perspective
  const botSub = imported ? undefined : levelLabel(getLevel(record.levelId))
  const topColor: Color = orientation === 'w' ? 'b' : 'w'
  const nameOf = (c: Color) => {
    if (imported) return c === 'w' ? imported.meta.white : imported.meta.black
    return c === record.playerColor ? 'You' : 'Kingside Bot'
  }
  const subOf = (c: Color) => {
    if (imported) {
      const r = c === 'w' ? imported.meta.whiteElo : imported.meta.blackElo
      return `${r ?? ''}${imported.userColor === c ? ' (you)' : ''}`.trim() || undefined
    }
    return c === record.playerColor ? undefined : botSub
  }
  const avatarOf = (c: Color): 'you' | 'bot' => (imported ? 'you' : c === record.playerColor ? 'you' : 'bot')
  const res = imported
    ? importedResult(imported.meta)
    : record.result ? resultText(record.result, record.playerColor) : { title: 'Unfinished game', detail: 'Interrupted before a result' }
  const lastClock = (c: Color) => {
    if (imported) return null
    for (let i = Math.min(ply, total) - 1; i >= 0; i--) if (record.moves[i].color === c) return record.moves[i].clockAfter
    return 600_000
  }

  const analysing = started && !usedCache && total > 0 && !review && !error
  return (
    <main className="stage review" data-testid="review-view">
      <section className="board-col">
        <PlayerBar name={nameOf(topColor)} subtitle={subOf(topColor)} avatar={avatarOf(topColor)} color={topColor} fen={fen} accuracy={review?.accuracy[topColor]} staticClockMs={lastClock(topColor)} />
        <div className="board-row">
          <EvalBar whiteCp={whiteCp} orientation={orientation} />
          <div className="board-wrap">
            <Board
              fen={fen}
              orientation={orientation}
              movable={exploreMovable}
              onMove={onExploreMove}
              lastMove={explore ? (exploreLast ? { from: exploreLast.from, to: exploreLast.to } : null) : move ? { from: move.from, to: move.to } : null}
              checkSquare={checkSquare}
              theme={settings.theme}
              showCoords={settings.showCoordinates}
              showLegal={settings.showLegalMoves}
              extraArrows={arrows}
              badge={rm?.cls ? { square: rm.uci.slice(2, 4) as Square, cls: rm.cls } : null}
              annotationKey={explore ? `x${explore.line.length}` : ply}
            />
            {explore && (
              <button className="history-banner" onClick={() => setExplore(null)} data-testid="back-to-game">
                Exploring from move {Math.ceil(explore.base / 2) || 'start'}{explore.line.length ? ` · ${explore.line.map((m) => m.san).join(' ')}` : ''} — the game is unchanged. <b>Back to game ⏎</b>
              </button>
            )}
          </div>
        </div>
        <PlayerBar name={nameOf(orientation)} subtitle={subOf(orientation)} avatar={avatarOf(orientation)} color={orientation} fen={fen} accuracy={review?.accuracy[orientation]} staticClockMs={lastClock(orientation)} />
      </section>

      <aside className="side-panel">
        <div className="panel-head">
          <button className="ghost-btn small" onClick={onExit}>← Back</button>
          <h2 className="panel-title">{imported ? 'Game Analysis' : 'Game Review'}</h2>
        </div>
        <div className="sub-tabs in-panel">
          <button className={tab === 'analysis' ? 'active' : ''} onClick={() => setTab('analysis')}>Analysis</button>
          <button className={tab === 'coach' ? 'active' : ''} onClick={() => setTab('coach')} disabled={total === 0} data-testid="coach-review-tab">Coach review</button>
        </div>
        {tab === 'coach' ? (
          <>
            {imported && (
              <div className="perspective-row">
                <span className="muted small">Review as</span>
                {(['w', 'b'] as Color[]).map((c) => (
                  <button key={c} className={`chip${perspective === c ? ' on' : ''}`} onClick={() => setPerspective(c)}>{c === 'w' ? imported.meta.white : imported.meta.black} ({c === 'w' ? 'White' : 'Black'})</button>
                ))}
              </div>
            )}
            {!review && !analysing ? (
              <div className="panel-body"><div className="info-box"><p>The coach needs the engine analysis first. Go to the Analysis tab and press <b>Analyze with Stockfish</b>.</p></div></div>
            ) : (
              <CoachReview record={record} perspective={perspective} review={review} positions={positions} bookPlies={bookPlies} opening={opening} progress={progress} onJump={(p) => { setExplore(null); setPly(p) }} onOpenLesson={onOpenLesson} onOpenPuzzles={onOpenPuzzles} onAnalyze={onAnalyze} />
            )}
          </>
        ) : (
        <div className="panel-body review-body">
          <div className="result-line">
            <b>{res.title}</b> <span className="muted">· {res.detail}</span>
          </div>
          {imported && <GameInfo meta={imported.meta} />}

          {total === 0 && <p className="muted">No moves were played, so there is nothing to review.</p>}

          {total > 0 && !started && !review && (
            <div className="analyze-box" data-testid="analyze-box">
              {cancelledMsg && <div className="warn-box">Analysis cancelled. Nothing was saved for this run.</div>}
              <label className="set-row">
                <span>Time per position</span>
                <select value={ms} onChange={(e) => setMs(Number(e.target.value))} data-testid="analysis-depth">
                  <option value={200}>Fast (0.2 s)</option>
                  <option value={500}>Standard (0.5 s)</option>
                  <option value={1000}>Deep (1 s)</option>
                  <option value={2000}>Deeper (2 s)</option>
                </select>
              </label>
              <button className="primary-btn" onClick={startAnalysis} data-testid="start-analysis">Analyze with Stockfish</button>
              <span className="muted small">About {Math.ceil(((total + 1) * ms) / 1000)} s for {total} moves. Results are cached, so you only analyse a game once.</span>
            </div>
          )}

          {analysing && (
            <div className="progress" data-testid="review-progress">
              <div className="progress-label">
                Analyzing with Stockfish… {progress.done}/{progress.total}
                <button className="link-btn cancel-link" onClick={cancelAnalysis} data-testid="cancel-analysis">Cancel</button>
              </div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
              <div className="muted small">{ms} ms per position · you can browse moves meanwhile</div>
            </div>
          )}
          {error && (
            <div className="error-box">
              Analysis failed: {error}
              <button className="ghost-btn small" onClick={() => setRunId((n) => n + 1)}>Retry</button>
            </div>
          )}
          {review && failures > 0 && <div className="warn-box">{failures} position(s) could not be analysed; affected moves are left unclassified.</div>}
          {review && usedCache && <div className="muted small cache-note">Loaded saved analysis. <button className="link-btn" onClick={startAnalysis}>Re-analyse</button></div>}

          {review && (
            <>
              <EvalGraph review={review} ply={ply} onSelect={(p) => { setExplore(null); setPly(p) }} />
              <SummaryTable review={review} youColor={youColor} names={imported ? { w: imported.meta.white, b: imported.meta.black } : undefined} />
            </>
          )}

          <div className="opening-box">
            {opening ? (
              <>
                <div className="opening-name"><span className="eco">{opening.eco}</span> {opening.name}</div>
                <div className="opening-moves muted">{opening.pgn}</div>
              </>
            ) : (
              <div className="muted">
                {total === 0 ? 'Starting position' : imported?.meta.opening ? `${imported.meta.opening} (from the game data; not in the bundled database)` : 'Opening not found in the bundled database (lichess chess-openings).'}
              </div>
            )}
          </div>

          {explore ? (
            <ExplorePanel fen={fen} lines={exploreLines} onBack={() => setExplore(null)} />
          ) : (
            <>
              {rm && <MoveCard rm={rm} />}
              {!rm && move && review === null && <div className="move-card muted">Classification appears when analysis finishes.</div>}
            </>
          )}

          <MoveList moves={record.moves} shownPly={ply} onSelect={(p) => { setExplore(null); setPly(p) }} classes={review?.moves.map((m) => m.cls)} />
          <NavControls ply={ply} max={total} onGo={(p) => { setExplore(null); setPly(p) }} onFlip={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />

          <div className="row-btns">
            <button className="ghost-btn small" onClick={() => { setExplore(null); if (ply >= total) setPly(0); setReplaying((r) => !r) }} data-testid="replay">{replaying ? '⏸ Stop replay' : '▶ Replay game'}</button>
            <button className="ghost-btn small" onClick={() => { setReplaying(false); setExplore({ base: ply, line: [] }) }} disabled={!!explore} data-testid="explore">Explore from here</button>
            <button
              className="ghost-btn small"
              onClick={async () => {
                await navigator.clipboard.writeText(imported ? imported.pgn : pgnOf(record))
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? 'Copied!' : 'Copy PGN'}
            </button>
            {imported && <button className="ghost-btn small" onClick={imported.onExport}>Export PGN{review ? ' (annotated)' : ''}</button>}
            {imported?.meta.url && <button className="ghost-btn small" onClick={() => void window.kingside.openExternal(imported.meta.url!)}>Open original ↗</button>}
          </div>
          <MethodNotes />
        </div>
        )}
      </aside>
    </main>
  )
}

function importedResult(m: GameMeta): { title: string; detail: string } {
  if (m.result === '1-0') return { title: '1–0', detail: `${m.white} won` }
  if (m.result === '0-1') return { title: '0–1', detail: `${m.black} won` }
  if (m.result === '1/2-1/2') return { title: '½–½', detail: 'Draw' }
  return { title: '*', detail: 'Result unknown or game unfinished' }
}

function GameInfo({ meta }: { meta: GameMeta }) {
  return (
    <div className="game-info" data-testid="game-info">
      <span><b>{SOURCE_LABEL[meta.source]}</b></span>
      {meta.date && <span>{meta.date}</span>}
      {meta.timeControl && <span>{meta.timeControl} · {meta.timeClass}</span>}
      {meta.event && <span>{meta.event}</span>}
      {meta.eco && <span>ECO {meta.eco}</span>}
    </div>
  )
}

function ExplorePanel({ fen, lines, onBack }: { fen: string; lines: AnalysisLine[] | null; onBack: () => void }) {
  const turn = new Chess(fen).turn()
  return (
    <div className="move-card" data-testid="explore-panel">
      <div className="move-card-head"><span className="move-card-title">Exploring</span><button className="link-btn" onClick={onBack} style={{ marginLeft: 'auto' }}>Back to game</button></div>
      <p className="small">Move pieces for either side to test ideas. The engine analyses each position; the game record stays untouched.</p>
      {!lines && <div className="muted small">Stockfish is analysing…</div>}
      {lines?.length === 0 && <div className="muted small">No engine lines (game over, or the engine is unavailable).</div>}
      {lines?.map((l) => (
        <div key={l.multipv} className="line"><span className="line-label">{formatEval(turn === 'w' ? lineCp(l) : -lineCp(l))}</span> {formatLine(fen, uciLineToSan(fen, l.pv, 8))}</div>
      ))}
    </div>
  )
}

function MoveCard({ rm }: { rm: ReviewResult['moves'][number] }) {
  const notable = rm.cls && NOTABLE.includes(rm.cls)
  return (
    <div className={`move-card cls-border-${rm.cls ?? 'none'}`} data-testid="move-card">
      <div className="move-card-head">
        {rm.cls && <ClassIcon cls={rm.cls} size={22} />}
        <span className="move-card-title">
          {rm.san} {rm.cls ? <>· {CLASS_LABEL[rm.cls]}</> : null}
        </span>
        <span className="eval-chip">{formatEval(rm.evalAfter)}</span>
      </div>
      <p>{rm.note}</p>
      <div className="muted small">
        Eval {formatEval(rm.evalBefore)} → {formatEval(rm.evalAfter)} · expected points lost {rm.loss.toFixed(3)}
      </div>
      {rm.bestSan && rm.bestUci !== rm.uci && (
        <div className="line">
          <span className="line-label">Best</span> {formatLine(rm.fenBefore, rm.bestLineSan.length ? rm.bestLineSan : [rm.bestSan])}
        </div>
      )}
      {(notable || rm.cls === 'best') && rm.replyLineSan.length > 0 && (
        <div className="line">
          <span className="line-label">After {rm.san}</span> {formatLine(rm.fenAfter, rm.replyLineSan)}
        </div>
      )}
    </div>
  )
}

function SummaryTable({ review, youColor, names }: { review: ReviewResult; youColor: Color; names?: Record<Color, string> }) {
  const cols: Color[] = youColor === 'w' ? ['w', 'b'] : ['b', 'w']
  return (
    <div className="summary">
      <div className="summary-head">
        <span />
        {cols.map((c) => (
          <span key={c} className="summary-col">
            {names ? names[c].slice(0, 12) : c === youColor ? 'You' : 'Bot'}
            <b>{review.accuracy[c] !== null ? `${review.accuracy[c]!.toFixed(1)}` : '–'}</b>
          </span>
        ))}
      </div>
      <div className="summary-sub muted small">Accuracy (approximate)</div>
      {CLASS_ORDER.map((cls) => (
        <div className="summary-row" key={cls}>
          <span className="summary-label"><ClassIcon cls={cls} size={16} /> {CLASS_LABEL[cls]}</span>
          {cols.map((c) => (
            <span key={c} className={`summary-n cls-text-${cls}`}>{review.counts[c][cls]}</span>
          ))}
        </div>
      ))}
    </div>
  )
}

function EvalBar({ whiteCp, orientation }: { whiteCp: number | null; orientation: Color }) {
  const share = whiteCp === null ? 0.5 : winProbability(whiteCp)
  const label = whiteCp === null ? '' : formatEval(whiteCp).replace('+', '')
  const whiteOnBottom = orientation === 'w'
  return (
    <div className={`eval-bar${whiteOnBottom ? '' : ' flipped'}`} title="Evaluation (White's point of view)">
      <div className="eval-white" style={{ height: `${share * 100}%` }} />
      <span className={`eval-text ${share >= 0.5 ? 'white-adv' : 'black-adv'}`}>{label}</span>
    </div>
  )
}

function EvalGraph({ review, ply, onSelect }: { review: ReviewResult; ply: number; onSelect: (p: number) => void }) {
  const n = review.whiteExpected.length - 1
  const W = 300
  const H = 70
  const x = (i: number) => (n === 0 ? 0 : (i / n) * W)
  const y = (v: number) => H - v * H
  const pts = review.whiteExpected.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const ref = useRef<SVGSVGElement>(null)
  return (
    <svg
      ref={ref}
      className="eval-graph"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      onClick={(e) => {
        const r = ref.current!.getBoundingClientRect()
        onSelect(Math.round(((e.clientX - r.left) / r.width) * n))
      }}
    >
      <rect x="0" y="0" width={W} height={H} className="eg-bg" />
      <polygon points={`0,${H} ${pts} ${W},${H}`} className="eg-white" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="eg-mid" />
      <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} className="eg-cursor" />
      {review.moves.map((m) =>
        m.cls && ['blunder', 'mistake', 'miss', 'brilliant', 'great', 'inaccuracy'].includes(m.cls) ? (
          <circle key={m.ply} cx={x(m.ply + 1)} cy={y(review.whiteExpected[m.ply + 1])} r="3.2" className={`eg-dot cls-fill-${m.cls}`} />
        ) : null
      )}
    </svg>
  )
}

function MethodNotes() {
  return (
    <details className="method">
      <summary>How moves are classified</summary>
      <p>
        Each position is searched by Stockfish. Its score is turned into an <b>expected score</b> (0 = loss, 0.5 = draw, 1 = win)
        with the logistic curve lichess publishes for its accuracy metric. A move's cost is how much expected score it gives up
        compared with the engine's best move.
      </p>
      <table>
        <tbody>
          <tr><td><ClassIcon cls="best" size={14} /> Best</td><td>the engine's top move</td></tr>
          <tr><td><ClassIcon cls="excellent" size={14} /> Excellent</td><td>≤ {THRESHOLDS.excellent} lost</td></tr>
          <tr><td><ClassIcon cls="good" size={14} /> Good</td><td>≤ {THRESHOLDS.good}</td></tr>
          <tr><td><ClassIcon cls="inaccuracy" size={14} /> Inaccuracy</td><td>≤ {THRESHOLDS.inaccuracy}</td></tr>
          <tr><td><ClassIcon cls="mistake" size={14} /> Mistake</td><td>≤ {THRESHOLDS.mistake}</td></tr>
          <tr><td><ClassIcon cls="blunder" size={14} /> Blunder</td><td>&gt; {THRESHOLDS.mistake}</td></tr>
        </tbody>
      </table>
      <p>
        These cut-offs match the expected-points bands chess.com documents publicly, but the curve here doesn't depend on rating.
        Special labels are heuristics: <b>Brilliant</b> is a best or near-best move that sacrifices a piece (left en prise, or
        material stays down along the engine line) without being in a lost or already trivially won position. <b>Great</b> is the
        only good move, where the next-best option costs at least 0.15. <b>Miss</b> means your opponent's last move handed you a
        winning chance and your reply gave it back. <b>Book</b> means the position is in the bundled opening database. <b>Forced</b>{' '}
        means it was the only legal move.
      </p>
      <p className="muted">
        Labels come from a time-limited engine search and simple rules. Treat them as a guide, not an objective verdict. Deeper
        analysis can disagree, and labels from other sites will differ.
      </p>
    </details>
  )
}
