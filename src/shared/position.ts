import { Chess } from 'chess.js'

/**
 * Full legality check for a FEN typed or imported by the user. chess.js accepts some impossible
 * positions (e.g. the side NOT to move standing in check), which Stockfish rejects by exiting, so
 * every user-supplied position goes through here before reaching the engine.
 * Returns null if valid, otherwise a human-readable reason.
 */
export function positionProblem(fen: string): string | null {
  const text = (fen ?? '').trim()
  if (!text) return 'The FEN is empty.'
  const parts = text.split(/\s+/)
  if (parts.length < 4) return 'A FEN needs at least 4 fields: pieces, side to move, castling and en passant.'
  const full = parts.length === 4 ? `${text} 0 1` : parts.length === 5 ? `${text} 1` : text
  let c: Chess
  try {
    c = new Chess(full)
  } catch (e) {
    return `Invalid FEN: ${(e as Error).message.replace(/^Invalid FEN: /, '')}`
  }
  const board = c.board()
  let wk = 0
  let bk = 0
  for (let r = 0; r < 8; r++)
    for (const p of board[r]) {
      if (!p) continue
      if (p.type === 'k') p.color === 'w' ? wk++ : bk++
      if (p.type === 'p' && (r === 0 || r === 7)) return 'Pawns cannot stand on the first or last rank.'
    }
  if (wk !== 1 || bk !== 1) return 'Each side must have exactly one king.'
  const turn = c.turn()
  const other = turn === 'w' ? 'b' : 'w'
  const theirKing = board.flat().find((p) => p && p.type === 'k' && p.color === other)!
  if (c.isAttacked(theirKing.square, turn)) return `Impossible position: ${other === 'w' ? 'White' : 'Black'} is in check but it is ${turn === 'w' ? 'White' : 'Black'}'s move.`
  const counts = { w: 0, b: 0 }
  for (const p of board.flat()) if (p) counts[p.color]++
  if (counts.w > 16 || counts.b > 16) return 'Too many pieces for one side.'
  return null
}

/** Normalise a FEN (adds missing move counters). Assumes positionProblem() returned null. */
export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/)
  if (parts.length === 4) return `${parts.join(' ')} 0 1`
  if (parts.length === 5) return `${parts.join(' ')} 1`
  return new Chess(parts.join(' ')).fen()
}
