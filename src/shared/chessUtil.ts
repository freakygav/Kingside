import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js'
import type { Color } from './types'

export const FILES = 'abcdefgh'

export function squareAt(file: number, rank: number): Square {
  return `${FILES[file]}${rank + 1}` as Square
}

export function fileOf(sq: string): number {
  return sq.charCodeAt(0) - 97
}

export function rankOf(sq: string): number {
  return Number(sq[1]) - 1
}

export const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Position key for opening lookup and repetition: placement, side, castling, en passant. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

export function uciOf(m: Pick<Move, 'from' | 'to' | 'promotion'>): string {
  return `${m.from}${m.to}${m.promotion ?? ''}`
}

export function parseUci(uci: string): { from: Square; to: Square; promotion?: PieceSymbol } | null {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci)
  if (!m) return null
  return { from: m[1] as Square, to: m[2] as Square, promotion: m[3] as PieceSymbol | undefined }
}

/** Material balance (white minus black) in pawn units. */
export function materialBalance(chess: Chess): number {
  let sum = 0
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p) continue
      sum += (p.color === 'w' ? 1 : -1) * PIECE_VALUE[p.type]
    }
  }
  return sum
}

/**
 * Whether `color` still has enough material to possibly deliver mate (FIDE 6.9: on flag fall, the
 * game is drawn if the opponent cannot checkmate by any series of legal moves). Lone king, K+B and
 * K+N cannot; anything else (including K+N+N) can in principle.
 */
export function canCheckmate(chess: Chess, color: Color): boolean {
  let minors = 0
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue
      if (p.type === 'p' || p.type === 'r' || p.type === 'q') return true
      minors++
    }
  }
  return minors >= 2
}

/** Convert a UCI line to SAN from a FEN, stopping at the first illegal move. */
export function uciLineToSan(fen: string, uci: string[], maxPlies = 10): string[] {
  const c = new Chess(fen)
  const out: string[] = []
  for (const u of uci.slice(0, maxPlies)) {
    const p = parseUci(u)
    if (!p) break
    try {
      out.push(c.move(p).san)
    } catch {
      break
    }
  }
  return out
}

/** Format SAN moves with move numbers, given the FEN they start from. */
export function formatLine(fen: string, san: string[]): string {
  const parts = fen.split(' ')
  let moveNo = Number(parts[5]) || 1
  let white = parts[1] === 'w'
  const out: string[] = []
  san.forEach((s, i) => {
    if (white) out.push(`${moveNo}. ${s}`)
    else {
      out.push(i === 0 ? `${moveNo}... ${s}` : s)
      moveNo++
    }
    white = !white
  })
  return out.join(' ')
}

/** Legal destinations grouped by origin square for the side to move. */
export function legalDests(chess: Chess): Map<Square, Square[]> {
  const map = new Map<Square, Square[]>()
  for (const m of chess.moves({ verbose: true })) {
    const list = map.get(m.from) ?? []
    if (!list.includes(m.to)) list.push(m.to)
    map.set(m.from, list)
  }
  return map
}

export function isPromotionMove(chess: Chess, from: Square, to: Square): boolean {
  const p = chess.get(from)
  if (!p || p.type !== 'p') return false
  return (p.color === 'w' && to[1] === '8') || (p.color === 'b' && to[1] === '1')
}
