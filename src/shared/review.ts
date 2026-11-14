import { Chess, type Square } from 'chess.js'
import { lineCp } from './strength'
import { materialBalance, parseUci, PIECE_VALUE, uciLineToSan } from './chessUtil'
import type { AnalysisLine, Color } from './types'

/**
 * Game review classification.
 *
 * Method (documented in the app's "How this works" panel):
 * 1. Every position is searched by Stockfish (MultiPV 2). Scores are converted to an expected
 *    score for the side to move with the logistic curve lichess publishes for its accuracy metric:
 *    E = 1 / (1 + exp(-0.00368208 * cp)). Mates count as 1 / 0.
 * 2. A move's cost is E(best move) - E(position after the move), from the mover's point of view.
 * 3. Cost bands follow the expected-points cutoffs chess.com documents publicly:
 *    best 0, excellent <= .02, good <= .05, inaccuracy <= .10, mistake <= .20, blunder > .20.
 *    Unlike chess.com, the curve here does not depend on player rating.
 * 4. Special labels are heuristics layered on top (see classifyMove).
 * These are engine-derived opinions at a limited search depth, not objective truth.
 */
export type MoveClass =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss'
  | 'forced'

export const CLASS_ORDER: MoveClass[] = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'forced', 'inaccuracy', 'mistake', 'miss', 'blunder'
]

export const CLASS_LABEL: Record<MoveClass, string> = {
  brilliant: 'Brilliant',
  great: 'Great',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  book: 'Book',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
  miss: 'Miss',
  forced: 'Forced'
}

export const THRESHOLDS = { excellent: 0.02, good: 0.05, inaccuracy: 0.1, mistake: 0.2 } as const
/** Expected score at or above which a side counts as "winning" (about +2.3 pawns). */
export const WINNING = 0.7

export interface PositionAnalysis {
  fen: string
  /** Engine lines from the side to move's POV, best first. Empty for terminal positions. */
  lines: AnalysisLine[]
  /** Set for positions where the game is over: the side to move is mated, or it is a draw. */
  terminal?: 'checkmate' | 'draw'
  /** Analysis failed for this position; moves touching it are left unclassified. */
  failed?: boolean
}

export interface GameMove {
  san: string
  uci: string
  color: Color
}

export interface ReviewedMove {
  ply: number
  color: Color
  san: string
  uci: string
  fenBefore: string
  fenAfter: string
  cls: MoveClass | null
  /** Expected points the move gave away (0..1), mover's POV. */
  loss: number
  /** Expected score for the mover before (with best play) and after the move. */
  epBest: number
  epAfter: number
  /** White-POV evaluation before and after the move, in centipawns (mates as +/-100000-ish). */
  evalBefore: number
  evalAfter: number
  bestUci: string | null
  bestSan: string | null
  /** Engine continuation from the position *before* the move (starting with the best move). */
  bestLineSan: string[]
  /** Engine continuation from the position *after* the move (the opponent's best reply first). */
  replyLineSan: string[]
  accuracy: number
  /** One-sentence explanation for the move card. */
  note: string
}

export interface ReviewResult {
  moves: ReviewedMove[]
  accuracy: Record<Color, number | null>
  counts: Record<Color, Record<MoveClass, number>>
  /** White-POV expected score for each position (index 0 = start), for the graph. */
  whiteExpected: number[]
  /** White-POV centipawn eval per position. */
  whiteCp: number[]
}

export function winProbability(cp: number): number {
  if (cp >= 50_000) return 1
  if (cp <= -50_000) return 0
  return 1 / (1 + Math.exp(-0.00368208 * cp))
}

/** Expected score for the side to move in this position. */
export function expectedForMover(pos: PositionAnalysis): number {
  if (pos.terminal === 'checkmate') return 0
  if (pos.terminal === 'draw') return 0.5
  if (pos.lines.length === 0) return 0.5
  return winProbability(lineCp(pos.lines[0]))
}

/** Side-to-move centipawns for the position. */
function moverCp(pos: PositionAnalysis): number {
  if (pos.terminal === 'checkmate') return -100_000
  if (pos.terminal === 'draw') return 0
  return pos.lines.length ? lineCp(pos.lines[0]) : 0
}

function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w'
}

/** White-POV centipawns for a position. */
export function whiteCpOf(pos: PositionAnalysis): number {
  const cp = moverCp(pos)
  return sideToMove(pos.fen) === 'w' ? cp : -cp
}

/** Lichess-style per-move accuracy from win% before/after (0..100 each). */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const drop = Math.max(0, winBefore - winAfter)
  const acc = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669 + 1
  return Math.min(100, Math.max(0, acc))
}

/** Combine per-move accuracies: mean of arithmetic and harmonic means (punishes big errors). */
export function aggregateAccuracy(values: number[]): number | null {
  if (values.length === 0) return null
  const arith = values.reduce((a, b) => a + b, 0) / values.length
  const harm = values.length / values.reduce((a, v) => a + 1 / Math.max(1, v), 0)
  return Math.round(((arith + harm) / 2) * 10) / 10
}

function materialFor(chess: Chess, color: Color): number {
  const m = materialBalance(chess)
  return color === 'w' ? m : -m
}

/**
 * Heuristic: did this move sacrifice material (minor piece or more)? True if either
 *  - the moved piece is left en prise: capturable for a net loss of >= 2 pawns of material, or
 *  - along the engine's best line after the move, the mover is down >= 2 points versus before the
 *    move both after the opponent's reply and after the mover's next move (not simply recaptured).
 */
export function isSacrifice(fenBefore: string, uci: string, replyPv: string[]): boolean {
  const mv = parseUci(uci)
  if (!mv) return false
  const chess = new Chess(fenBefore)
  const mover = chess.turn()
  const opp: Color = mover === 'w' ? 'b' : 'w'
  const before = materialFor(chess, mover)
  let played
  try {
    played = chess.move(mv)
  } catch {
    return false
  }
  const movedType = played.promotion ?? played.piece
  const v = PIECE_VALUE[movedType]
  const captured = played.captured ? PIECE_VALUE[played.captured] : 0

  if (v >= 3) {
    const attackers = chess.attackers(played.to as Square, opp)
    if (attackers.length > 0) {
      const lowest = Math.min(...attackers.map((sq) => PIECE_VALUE[chess.get(sq)!.type] || 100))
      const defended = chess.attackers(played.to as Square, mover).length > 0
      const net = (defended ? v - Math.min(lowest, v) : v) - captured
      if (net >= 2) return true
    }
  }

  // Line-based check.
  const line = new Chess(chess.fen())
  const after: number[] = []
  for (const u of replyPv.slice(0, 3)) {
    const p = parseUci(u)
    if (!p) break
    try {
      line.move(p)
    } catch {
      break
    }
    after.push(materialFor(line, mover))
  }
  if (after.length >= 3) return after[0] <= before - 2 && after[2] <= before - 2
  return false
}

function isRecapture(fenBefore: string, uci: string, prevUci: string | null): boolean {
  if (!prevUci) return false
  const mv = parseUci(uci)
  const prev = parseUci(prevUci)
  if (!mv || !prev || mv.to !== prev.to) return false
  const c = new Chess(fenBefore)
  return !!c.get(mv.to)
}

export interface ClassifyContext {
  ply: number
  move: GameMove
  before: PositionAnalysis
  after: PositionAnalysis
  legalMoves: number
  isBook: boolean
  /** Expected-points loss of the opponent's previous move (0 if none). */
  prevLoss: number
  /** Mover's expected score before the opponent's previous move (null at ply 0). */
  prevMoverEp: number | null
  prevUci: string | null
}

export function classifyMove(ctx: ClassifyContext): { cls: MoveClass | null; loss: number; epBest: number; epAfter: number } {
  const { before, after, move } = ctx
  if (before.failed || after.failed) return { cls: null, loss: 0, epBest: 0.5, epAfter: 0.5 }
  const epBest = expectedForMover(before)
  const epAfter = 1 - expectedForMover(after)
  const bestUci = before.lines[0]?.pv[0] ?? null
  const isBest = bestUci === move.uci
  const loss = isBest ? 0 : Math.max(0, epBest - epAfter)

  if (ctx.legalMoves <= 1) return { cls: 'forced', loss, epBest, epAfter }
  if (ctx.isBook) return { cls: 'book', loss, epBest, epAfter }

  let cls: MoveClass
  if (isBest) cls = 'best'
  else if (loss <= THRESHOLDS.excellent) cls = 'excellent'
  else if (loss <= THRESHOLDS.good) cls = 'good'
  else if (loss <= THRESHOLDS.inaccuracy) cls = 'inaccuracy'
  else if (loss <= THRESHOLDS.mistake) cls = 'mistake'
  else cls = 'blunder'

  // Miss: the opponent just handed over a winning chance and this move gave it back.
  if ((cls === 'inaccuracy' || cls === 'mistake' || cls === 'blunder') && ctx.prevMoverEp !== null) {
    const opportunity = ctx.prevLoss >= THRESHOLDS.inaccuracy && ctx.prevMoverEp < WINNING && epBest >= WINNING
    if (opportunity && epAfter < WINNING) cls = 'miss'
  }

  const nearBest = isBest || loss <= THRESHOLDS.excellent
  const deliversMate = after.terminal === 'checkmate'
  if (nearBest && !deliversMate) {
    const second = before.lines[1]
    const epSecond = second ? winProbability(lineCp(second)) : null
    // Brilliant: a sound sacrifice when the alternatives weren't already completely winning.
    const notTrivial = epSecond === null || epSecond <= 0.9
    if (notTrivial && epAfter >= 0.45 && isSacrifice(before.fen, move.uci, after.lines[0]?.pv ?? [])) {
      return { cls: 'brilliant', loss, epBest, epAfter }
    }
    // Great: the only good move - the next-best option costs a lot - and it keeps you in the game.
    if (
      isBest &&
      epSecond !== null &&
      epBest - epSecond >= 0.15 &&
      epAfter >= 0.3 &&
      !isRecapture(before.fen, move.uci, ctx.prevUci)
    ) {
      return { cls: 'great', loss, epBest, epAfter }
    }
  }
  return { cls, loss, epBest, epAfter }
}

function fmtCp(whiteCp: number): string {
  if (Math.abs(whiteCp) >= 50_000) {
    const n = Math.max(0, Math.round((100_000 - Math.abs(whiteCp)) / 100))
    return `${whiteCp > 0 ? '' : '-'}M${n}`
  }
  const p = whiteCp / 100
  return `${p >= 0 ? '+' : ''}${p.toFixed(2)}`
}

export function formatEval(whiteCp: number): string {
  return fmtCp(whiteCp)
}

function noteFor(m: Omit<ReviewedMove, 'note'>): string {
  const best = m.bestSan ? `${m.bestSan}` : 'the engine move'
  const swing = `${fmtCp(m.evalBefore)} → ${fmtCp(m.evalAfter)}`
  switch (m.cls) {
    case 'brilliant':
      return `${m.san} is a sound sacrifice the engine approves of (${swing}).`
    case 'great':
      return `${m.san} was the only move that holds the position; the next-best option was much worse.`
    case 'best':
      return `${m.san} is the engine's top choice.`
    case 'excellent':
      return `${m.san} is nearly as good as ${best}.`
    case 'good':
      return `${m.san} is reasonable. ${best} was slightly better.`
    case 'book':
      return `${m.san} is a known opening move.`
    case 'forced':
      return `${m.san} was the only legal move.`
    case 'inaccuracy':
      return `${m.san} is an inaccuracy (${swing}). ${best} was better.`
    case 'mistake':
      return `${m.san} is a mistake (${swing}). ${best} was stronger.`
    case 'blunder':
      return `${m.san} is a blunder (${swing}). ${best} was the move.`
    case 'miss':
      return `${m.san} misses the chance your opponent gave you (${swing}). ${best} kept a winning position.`
    default:
      return `${m.san}: analysis unavailable for this move.`
  }
}

function emptyCounts(): Record<MoveClass, number> {
  return Object.fromEntries(CLASS_ORDER.map((c) => [c, 0])) as Record<MoveClass, number>
}

/**
 * Build the full review. `positions[i]` is the position before move i (length = moves + 1).
 * `bookPlies` is how many opening moves (from the start) match the opening database.
 */
export function buildReview(moves: GameMove[], positions: PositionAnalysis[], bookPlies: number): ReviewResult {
  if (positions.length !== moves.length + 1) throw new Error('buildReview: need one position per move plus the start')
  const out: ReviewedMove[] = []
  const counts = { w: emptyCounts(), b: emptyCounts() }
  const acc: Record<Color, number[]> = { w: [], b: [] }
  let prevLoss = 0
  let prevMoverEpStack: number | null = null

  for (let i = 0; i < moves.length; i++) {
    const before = positions[i]
    const after = positions[i + 1]
    const chess = new Chess(before.fen)
    const legalMoves = chess.moves().length
    const r = classifyMove({
      ply: i,
      move: moves[i],
      before,
      after,
      legalMoves,
      isBook: i < bookPlies,
      prevLoss,
      prevMoverEp: prevMoverEpStack,
      prevUci: i > 0 ? moves[i - 1].uci : null
    })
    const bestUci = before.lines[0]?.pv[0] ?? null
    const bestLineSan = before.lines[0] ? uciLineToSan(before.fen, before.lines[0].pv, 8) : []
    const replyLineSan = after.lines[0] ? uciLineToSan(after.fen, after.lines[0].pv, 8) : []
    const base = {
      ply: i,
      color: moves[i].color,
      san: moves[i].san,
      uci: moves[i].uci,
      fenBefore: before.fen,
      fenAfter: after.fen,
      cls: r.cls,
      loss: r.loss,
      epBest: r.epBest,
      epAfter: r.epAfter,
      evalBefore: whiteCpOf(before),
      evalAfter: whiteCpOf(after),
      bestUci,
      bestSan: bestLineSan[0] ?? null,
      bestLineSan,
      replyLineSan,
      accuracy: r.cls ? moveAccuracy(r.epBest * 100, Math.min(r.epBest, r.epAfter) * 100) : 0
    }
    out.push({ ...base, note: noteFor(base) })
    if (r.cls) {
      counts[moves[i].color][r.cls]++
      acc[moves[i].color].push(base.accuracy)
    }
    // For the next move (by the opponent): their EP before *this* move, and this move's loss.
    prevMoverEpStack = r.cls ? 1 - r.epBest : null
    prevLoss = r.cls ? r.loss : 0
  }

  const whiteCp = positions.map(whiteCpOf)
  return {
    moves: out,
    accuracy: { w: aggregateAccuracy(acc.w), b: aggregateAccuracy(acc.b) },
    counts,
    whiteExpected: whiteCp.map(winProbability),
    whiteCp
  }
}
