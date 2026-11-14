import { positionKey } from './chessUtil'

/** positionKey(FEN) -> [ECO, name, PGN of the defining move sequence]. */
export type OpeningDb = Record<string, [string, string, string]>

export interface OpeningMatch {
  eco: string
  name: string
  /** The move sequence that defines this opening in the database. */
  pgn: string
  /** Ply (1-based count of half-moves) at which the game reached this position. */
  ply: number
}

/**
 * Find the most specific named opening the game passed through. Matching is by position, so
 * transpositions are recognised. `fens[0]` is the start position, `fens[i]` the position after ply i.
 * Returns null when no position matches - callers must not invent a name.
 */
export function detectOpening(db: OpeningDb, fens: string[]): OpeningMatch | null {
  let found: OpeningMatch | null = null
  for (let i = 1; i < fens.length; i++) {
    const hit = db[positionKey(fens[i])]
    if (hit) found = { eco: hit[0], name: hit[1], pgn: hit[2], ply: i }
  }
  return found
}

/** Number of leading plies whose resulting positions are all in the database ("book" moves). */
export function bookPlyCount(db: OpeningDb, fens: string[]): number {
  let n = 0
  for (let i = 1; i < fens.length; i++) {
    if (!db[positionKey(fens[i])]) break
    n = i
  }
  return n
}
