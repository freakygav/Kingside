import { Chess, type PieceSymbol, type Square } from 'chess.js'
import { FILES, fileOf, rankOf, squareAt } from '../chessUtil'
import type { Color } from '../types'

/**
 * Static position facts used by the coaches. Everything here is computed from the actual board -
 * no guessing - so every sentence a coach says can be traced back to one of these functions.
 */

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
export const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')
export const sideName = (c: Color) => (c === 'w' ? 'White' : 'Black')

export interface Placed {
  square: Square
  type: PieceSymbol
  color: Color
}

export function pieces(chess: Chess, color?: Color): Placed[] {
  const out: Placed[] = []
  for (const row of chess.board()) for (const p of row) if (p && (!color || p.color === color)) out.push({ square: p.square, type: p.type, color: p.color })
  return out
}

export function kingSquare(chess: Chess, color: Color): Square {
  return pieces(chess, color).find((p) => p.type === 'k')!.square
}

export interface Hanging extends Placed {
  attackers: Square[]
  defenders: Square[]
  /** Cheapest attacker's value. */
  cheapest: number
  reason: 'undefended' | 'attacked-by-cheaper'
}

/** Pieces of `color` (not the king) that the opponent can win: undefended, or attacked by a cheaper piece. */
export function hangingPieces(chess: Chess, color: Color): Hanging[] {
  const out: Hanging[] = []
  for (const p of pieces(chess, color)) {
    if (p.type === 'k') continue
    const attackers = chess.attackers(p.square, other(color))
    if (attackers.length === 0) continue
    const defenders = chess.attackers(p.square, color)
    const cheapest = Math.min(...attackers.map((s) => VALUE[chess.get(s)!.type]))
    if (defenders.length === 0) out.push({ ...p, attackers, defenders, cheapest, reason: 'undefended' })
    else if (cheapest < VALUE[p.type]) out.push({ ...p, attackers, defenders, cheapest, reason: 'attacked-by-cheaper' })
  }
  return out.sort((a, b) => VALUE[b.type] - VALUE[a.type])
}

/** Defenders that are the *only* guard of two or more attacked friendly pieces. */
export function overloadedDefenders(chess: Chess, color: Color): { defender: Placed; duties: Placed[] }[] {
  const duties = new Map<Square, Placed[]>()
  for (const p of pieces(chess, color)) {
    if (p.type === 'k') continue
    if (chess.attackers(p.square, other(color)).length === 0) continue
    const defs = chess.attackers(p.square, color)
    if (defs.length === 1) duties.set(defs[0], [...(duties.get(defs[0]) ?? []), p])
  }
  const out: { defender: Placed; duties: Placed[] }[] = []
  for (const [sq, list] of duties) {
    const d = chess.get(sq)!
    if (list.length >= 2) out.push({ defender: { square: sq, type: d.type, color: d.color }, duties: list })
  }
  return out
}

const DIRS: Record<'r' | 'b', [number, number][]> = {
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]]
}

export interface Pin {
  pinned: Placed
  /** The enemy slider creating the pin. */
  by: Placed
  /** What sits behind the pinned piece (king = absolute pin). */
  behind: Placed
  absolute: boolean
}

/** Pins against `color`: a `color` piece that can't move without exposing its king or a more valuable piece. */
export function pinsAgainst(chess: Chess, color: Color): Pin[] {
  const out: Pin[] = []
  for (const slider of pieces(chess, other(color))) {
    const kinds: ('r' | 'b')[] = slider.type === 'q' ? ['r', 'b'] : slider.type === 'r' ? ['r'] : slider.type === 'b' ? ['b'] : []
    for (const k of kinds) {
      for (const [df, dr] of DIRS[k]) {
        let f = fileOf(slider.square) + df
        let r = rankOf(slider.square) + dr
        let first: Placed | null = null
        while (f >= 0 && f < 8 && r >= 0 && r < 8) {
          const sq = squareAt(f, r)
          const pc = chess.get(sq)
          if (pc) {
            if (pc.color !== color) break
            if (!first) first = { square: sq, type: pc.type, color: pc.color }
            else {
              const behind: Placed = { square: sq, type: pc.type, color: pc.color }
              if (first.type !== 'k' && (behind.type === 'k' || VALUE[behind.type] > VALUE[first.type]))
                out.push({ pinned: first, by: slider, behind, absolute: behind.type === 'k' })
              break
            }
          }
          f += df
          r += dr
        }
      }
    }
  }
  return out
}

export interface PawnStructure {
  isolated: Square[]
  doubledFiles: string[]
  passed: Square[]
  islands: number
  backward: Square[]
}

export function pawnStructure(chess: Chess, color: Color): PawnStructure {
  const mine = pieces(chess, color).filter((p) => p.type === 'p')
  const theirs = pieces(chess, other(color)).filter((p) => p.type === 'p')
  const files = new Set(mine.map((p) => fileOf(p.square)))
  const isolated = mine.filter((p) => !files.has(fileOf(p.square) - 1) && !files.has(fileOf(p.square) + 1)).map((p) => p.square)
  const doubledFiles = [...files].filter((f) => mine.filter((p) => fileOf(p.square) === f).length > 1).map((f) => FILES[f])
  const ahead = (from: number, to: number) => (color === 'w' ? to > from : to < from)
  const passed = mine
    .filter((p) => !theirs.some((t) => Math.abs(fileOf(t.square) - fileOf(p.square)) <= 1 && ahead(rankOf(p.square), rankOf(t.square))))
    .map((p) => p.square)
  let islands = 0
  for (let f = 0; f < 8; f++) if (files.has(f) && !files.has(f - 1)) islands++
  // Backward: no friendly pawn on adjacent files level or behind, and the stop square is hit by an enemy pawn.
  const dir = color === 'w' ? 1 : -1
  const backward = mine
    .filter((p) => {
      const f = fileOf(p.square)
      const r = rankOf(p.square)
      const support = mine.some((q) => Math.abs(fileOf(q.square) - f) === 1 && (color === 'w' ? rankOf(q.square) <= r : rankOf(q.square) >= r))
      if (support || isolated.includes(p.square)) return false
      const stop = r + dir
      if (stop < 0 || stop > 7) return false
      return theirs.some((t) => Math.abs(fileOf(t.square) - f) === 1 && rankOf(t.square) === stop + dir)
    })
    .map((p) => p.square)
  return { isolated, doubledFiles, passed, islands, backward }
}

/** Can a pawn of `byColor` ever attack this square (pawns only move forward)? */
function pawnCanEverAttack(chess: Chess, sq: Square, byColor: Color): boolean {
  const f = fileOf(sq)
  const r = rankOf(sq)
  return pieces(chess, byColor).some((p) => {
    if (p.type !== 'p' || Math.abs(fileOf(p.square) - f) !== 1) return false
    return byColor === 'w' ? rankOf(p.square) < r : rankOf(p.square) > r
  })
}

/**
 * Outposts for `color`: squares in the opponent's half (ranks 4-6 from color's side), supported by
 * a friendly pawn, that no enemy pawn can ever attack. Returns squares a knight/bishop could use.
 */
export function outposts(chess: Chess, color: Color): Square[] {
  const out: Square[] = []
  const ranks = color === 'w' ? [3, 4, 5] : [4, 3, 2]
  for (const r of ranks) {
    for (let f = 1; f < 7; f++) {
      const sq = squareAt(f, r)
      const occ = chess.get(sq)
      if (occ && (occ.color !== color || occ.type === 'p')) continue
      const supported = chess.attackers(sq, color).some((s) => chess.get(s)!.type === 'p')
      if (supported && !pawnCanEverAttack(chess, sq, other(color))) out.push(sq)
    }
  }
  return out
}

/** Weak squares in `color`'s camp = outposts for the opponent. */
export function weakSquares(chess: Chess, color: Color): Square[] {
  return outposts(chess, other(color))
}

export interface KingSafety {
  square: Square
  castled: boolean
  canCastle: { k: boolean; q: boolean }
  /** Friendly pawns directly in front of the king (3 files, 2 ranks). */
  shield: number
  /** Open or half-open files next to the king. */
  openFiles: string[]
  /** Squares around the king attacked by the opponent. */
  attackedNear: number
  inCheck: boolean
}

export function kingSafety(chess: Chess, color: Color): KingSafety {
  const k = kingSquare(chess, color)
  const f = fileOf(k)
  const r = rankOf(k)
  const home = color === 'w' ? 0 : 7
  const dir = color === 'w' ? 1 : -1
  const myPawns = pieces(chess, color).filter((p) => p.type === 'p')
  let shield = 0
  for (let df = -1; df <= 1; df++) for (const dr of [1, 2]) if (myPawns.some((p) => p.square === squareAt(Math.min(7, Math.max(0, f + df)), Math.min(7, Math.max(0, r + dir * dr))))) shield++
  const openFiles: string[] = []
  for (let df = -1; df <= 1; df++) {
    const ff = f + df
    if (ff < 0 || ff > 7) continue
    if (!myPawns.some((p) => fileOf(p.square) === ff)) openFiles.push(FILES[ff])
  }
  let attackedNear = 0
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue
      const ff = f + df
      const rr = r + dr
      if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue
      if (chess.isAttacked(squareAt(ff, rr), other(color))) attackedNear++
    }
  const castled = r === home && (f >= 6 || f <= 2)
  return { square: k, castled, canCastle: chess.getCastlingRights(color), shield, openFiles, attackedNear, inCheck: chess.turn() === color && chess.inCheck() }
}

export function material(chess: Chess): { w: number; b: number; nonPawn: { w: number; b: number }; counts: Record<Color, Record<PieceSymbol, number>> } {
  const counts = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } } as Record<Color, Record<PieceSymbol, number>>
  for (const p of pieces(chess)) counts[p.color][p.type]++
  const sum = (c: Color, pawns: boolean) => (['p', 'n', 'b', 'r', 'q'] as PieceSymbol[]).reduce((s, t) => s + (pawns || t !== 'p' ? VALUE[t] * counts[c][t] : 0), 0)
  return { w: sum('w', true), b: sum('b', true), nonPawn: { w: sum('w', false), b: sum('b', false) }, counts }
}

export type Phase = 'opening' | 'middlegame' | 'endgame'

export function gamePhase(chess: Chess): Phase {
  const m = material(chess)
  if (m.nonPawn.w + m.nonPawn.b <= 26 || (m.counts.w.q === 0 && m.counts.b.q === 0 && m.nonPawn.w + m.nonPawn.b <= 32)) return 'endgame'
  const moveNo = Number(chess.fen().split(' ')[5]) || 1
  const backRankMinors = pieces(chess).filter((p) => (p.type === 'n' || p.type === 'b') && (rankOf(p.square) === 0 || rankOf(p.square) === 7)).length
  if (moveNo <= 12 && backRankMinors >= 3) return 'opening'
  return 'middlegame'
}

export function development(chess: Chess, color: Color): { undeveloped: Placed[]; castled: boolean; queenMoved: boolean } {
  const home = color === 'w' ? '1' : '8'
  const starts: Record<string, PieceSymbol> = { b: 'n', g: 'n', c: 'b', f: 'b' }
  const undeveloped: Placed[] = []
  for (const [file, type] of Object.entries(starts)) {
    const sq = `${file}${home}` as Square
    const p = chess.get(sq)
    if (p && p.color === color && p.type === type) undeveloped.push({ square: sq, type, color })
  }
  const q = chess.get(`d${home}` as Square)
  return { undeveloped, castled: kingSafety(chess, color).castled, queenMoved: !(q && q.type === 'q' && q.color === color) }
}

const CENTER: Square[] = ['d4', 'e4', 'd5', 'e5']

export function centerControl(chess: Chess, color: Color): { occupied: Square[]; attacks: number } {
  const occupied = CENTER.filter((s) => chess.get(s)?.color === color)
  const attacks = CENTER.reduce((n, s) => n + chess.attackers(s, color).length, 0)
  return { occupied, attacks }
}

export function openFiles(chess: Chess): { open: string[]; halfOpen: Record<Color, string[]> } {
  const pawnsOn = (c: Color, f: number) => pieces(chess, c).some((p) => p.type === 'p' && fileOf(p.square) === f)
  const open: string[] = []
  const halfOpen: Record<Color, string[]> = { w: [], b: [] }
  for (let f = 0; f < 8; f++) {
    const w = pawnsOn('w', f)
    const b = pawnsOn('b', f)
    if (!w && !b) open.push(FILES[f])
    else if (!w) halfOpen.w.push(FILES[f])
    else if (!b) halfOpen.b.push(FILES[f])
  }
  return { open, halfOpen }
}

/** Rooks of `color` already on open/half-open files, and open files still free for them. */
export function rookActivity(chess: Chess, color: Color): { onOpen: Square[]; freeFiles: string[] } {
  const of = openFiles(chess)
  const good = new Set([...of.open, ...of.halfOpen[color]])
  const rooks = pieces(chess, color).filter((p) => p.type === 'r')
  const onOpen = rooks.filter((r) => good.has(r.square[0])).map((r) => r.square)
  const taken = new Set(onOpen.map((s) => s[0]))
  return { onOpen, freeFiles: [...good].filter((f) => !taken.has(f)) }
}

export function bishopPair(chess: Chess, color: Color): boolean {
  return pieces(chess, color).filter((p) => p.type === 'b').length >= 2
}

/** Distance of a king from the centre (0 = centre, 3 = corner area). */
export function kingCentrality(sq: Square): number {
  const f = fileOf(sq)
  const r = rankOf(sq)
  return Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5)) - 0.5
}

/**
 * Direct opposition in a king-and-pawn ending: kings on the same file or rank with one square
 * between them. The side NOT to move "has the opposition".
 */
export function opposition(chess: Chess): { has: Color; kind: 'file' | 'rank' } | null {
  const w = kingSquare(chess, 'w')
  const b = kingSquare(chess, 'b')
  const df = Math.abs(fileOf(w) - fileOf(b))
  const dr = Math.abs(rankOf(w) - rankOf(b))
  if (df === 0 && dr === 2) return { has: other(chess.turn()), kind: 'file' }
  if (dr === 0 && df === 2) return { has: other(chess.turn()), kind: 'rank' }
  return null
}

/**
 * Rule of the square for a passed pawn against the enemy king (no other pieces assumed):
 * true if the king can catch the pawn.
 */
export function kingCatchesPawn(pawn: Square, pawnColor: Color, enemyKing: Square, sideToMove: Color): boolean {
  const promoRank = pawnColor === 'w' ? 7 : 0
  let dist = Math.abs(promoRank - rankOf(pawn))
  if ((pawnColor === 'w' && rankOf(pawn) === 1) || (pawnColor === 'b' && rankOf(pawn) === 6)) dist-- // double step
  const kingDist = Math.max(Math.abs(fileOf(enemyKing) - fileOf(pawn)), Math.abs(rankOf(enemyKing) - promoRank))
  return kingDist - (sideToMove === pawnColor ? 0 : 1) <= dist
}

/** Squares strictly between two squares on a line (empty if not aligned). */
export function between(a: Square, b: Square): Square[] {
  const df = Math.sign(fileOf(b) - fileOf(a))
  const dr = Math.sign(rankOf(b) - rankOf(a))
  const lenF = Math.abs(fileOf(b) - fileOf(a))
  const lenR = Math.abs(rankOf(b) - rankOf(a))
  if (!(lenF === 0 || lenR === 0 || lenF === lenR)) return []
  const out: Square[] = []
  let f = fileOf(a) + df
  let r = rankOf(a) + dr
  while (f !== fileOf(b) || r !== rankOf(b)) {
    out.push(squareAt(f, r))
    f += df
    r += dr
  }
  return out
}

/** A copy of the position with the other side to move (for "what does the opponent threaten?"). */
export function withSideToMove(fen: string, color: Color): Chess | null {
  const parts = fen.split(' ')
  if (parts[1] === color) return new Chess(fen)
  parts[1] = color
  parts[3] = '-'
  try {
    const c = new Chess(parts.join(' '))
    return c
  } catch {
    return null
  }
}
