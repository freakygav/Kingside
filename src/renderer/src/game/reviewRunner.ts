import { Chess } from 'chess.js'
import { bookPlyCount, detectOpening, type OpeningDb, type OpeningMatch } from '@shared/openings'
import { buildReview, type PositionAnalysis, type ReviewResult } from '@shared/review'
import openingsJson from '../data/openings.json'
import type { GameRecord } from './session'

export const OPENINGS = openingsJson as unknown as OpeningDb

export function openingFor(fens: string[]): OpeningMatch | null {
  return detectOpening(OPENINGS, fens)
}

export interface ReviewProgress {
  done: number
  total: number
  positions: PositionAnalysis[]
}

/**
 * Analyse every position of a finished game with the analysis engine (MultiPV 2), then classify.
 * Positions that fail twice are marked failed; their moves are left unclassified instead of guessed.
 */
export async function runReview(
  record: GameRecord,
  movetimeMs: number,
  onProgress: (p: ReviewProgress) => void,
  isCancelled: () => boolean
): Promise<{ review: ReviewResult; failures: number; positions: PositionAnalysis[]; bookPlies: number }> {
  const positions: PositionAnalysis[] = []
  const total = record.fens.length
  let failures = 0
  for (let i = 0; i < total; i++) {
    if (isCancelled()) throw new Error('cancelled')
    const fen = record.fens[i]
    const chess = new Chess(fen)
    const isLast = i === total - 1
    const r = record.result
    if (chess.isCheckmate()) {
      positions.push({ fen, lines: [], terminal: 'checkmate' })
    } else if (chess.isStalemate() || chess.isInsufficientMaterial() || (isLast && r && ['threefold', 'fifty'].includes(r.reason))) {
      positions.push({ fen, lines: [], terminal: 'draw' })
    } else {
      let pos: PositionAnalysis | null = null
      for (let attempt = 0; attempt < 2 && !pos; attempt++) {
        const res = await window.kingside.analyze({ fen, multipv: 2, movetimeMs })
        if (isCancelled()) throw new Error('cancelled')
        if (res.ok && res.value.lines.length > 0) pos = { fen, lines: res.value.lines }
      }
      if (!pos) {
        failures++
        pos = { fen, lines: [], failed: true }
      }
      positions.push(pos)
    }
    onProgress({ done: i + 1, total, positions: [...positions] })
  }
  const bookPlies = bookPlyCount(OPENINGS, record.fens)
  const review = buildReview(
    record.moves.map((m) => ({ san: m.san, uci: m.uci, color: m.color })),
    positions,
    bookPlies
  )
  return { review, failures, positions, bookPlies }
}
