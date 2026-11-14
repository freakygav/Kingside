import type { Chess, Square } from 'chess.js'
import { fileOf, rankOf, squareAt } from './chessUtil'
import type { Color } from './types'

/**
 * Squares a piece could *possibly* reach after the opponent's next move - used to offer premoves.
 * The opponent can still move or capture anything, so this is pure geometry: sliding pieces get the
 * full ray (ignoring blockers), pawns may always premove diagonally, and the king may premove a
 * castle if it and the rook are still on their original squares with castling rights intact.
 * Legality is re-checked when the turn actually arrives.
 */
export function premoveDests(chess: Chess, from: Square, color: Color): Square[] {
  const piece = chess.get(from)
  if (!piece || piece.color !== color) return []
  const f = fileOf(from)
  const r = rankOf(from)
  const out = new Set<Square>()
  const add = (df: number, dr: number) => {
    const nf = f + df
    const nr = r + dr
    if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) out.add(squareAt(nf, nr))
  }
  const ray = (df: number, dr: number) => {
    for (let i = 1; i < 8; i++) add(df * i, dr * i)
  }

  switch (piece.type) {
    case 'p': {
      const dir = color === 'w' ? 1 : -1
      add(0, dir)
      if ((color === 'w' && r === 1) || (color === 'b' && r === 6)) add(0, 2 * dir)
      add(-1, dir)
      add(1, dir)
      break
    }
    case 'n':
      for (const [df, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(df, dr)
      break
    case 'b':
      ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1)
      break
    case 'r':
      ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1)
      break
    case 'q':
      ray(1, 1); ray(1, -1); ray(-1, 1); ray(-1, -1); ray(1, 0); ray(-1, 0); ray(0, 1); ray(0, -1)
      break
    case 'k': {
      for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) if (df || dr) add(df, dr)
      const homeRank = color === 'w' ? '1' : '8'
      if (from === `e${homeRank}`) {
        const rights = chess.getCastlingRights(color)
        const rook = (sq: string) => {
          const p = chess.get(sq as Square)
          return p && p.type === 'r' && p.color === color
        }
        if (rights.k && rook(`h${homeRank}`)) out.add(`g${homeRank}` as Square)
        if (rights.q && rook(`a${homeRank}`)) out.add(`c${homeRank}` as Square)
      }
      break
    }
  }
  // Never premove onto a square occupied by your own king (it can't be captured away).
  for (const sq of [...out]) {
    const p = chess.get(sq)
    if (p && p.color === color && p.type === 'k') out.delete(sq)
  }
  out.delete(from)
  return [...out]
}

export interface Premove {
  from: Square
  to: Square
  promotion?: 'q' | 'r' | 'b' | 'n'
}

/** Try to play a queued premove on the live game. Returns the SAN played, or null if illegal. */
export function tryPremove(chess: Chess, pm: Premove, color: Color): string | null {
  if (chess.turn() !== color) return null
  const legal = chess.moves({ verbose: true }).find(
    (m) => m.from === pm.from && m.to === pm.to && (!m.promotion || m.promotion === (pm.promotion ?? 'q'))
  )
  if (!legal) return null
  return chess.move({ from: pm.from, to: pm.to, promotion: legal.promotion ? pm.promotion ?? 'q' : undefined }).san
}
