import { Chess } from 'chess.js'
import { getCoach } from '@shared/coach/coaches'
import { buildCoachReport } from '@shared/coach/report'
import { acplFrom, fensOf, type GameMeta, type StoredGame } from '@shared/library'
import type { PositionAnalysis, ReviewResult } from '@shared/review'
import type { Color } from '@shared/types'
import { openingFor } from './reviewRunner'
import type { GameRecord, MoveRecord } from './session'

/** Adapt a library game to the GameRecord shape the existing review screen uses. */
export function recordFromStored(g: StoredGame, perspective: Color): GameRecord {
  const fens = fensOf(g)
  const c = new Chess(g.startFen)
  const moves: MoveRecord[] = g.ucis.map((u) => {
    const color = c.turn()
    const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    return { san: m.san, uci: u, from: m.from, to: m.to, color, captured: !!m.captured, castle: m.isKingsideCastle() || m.isQueensideCastle(), check: c.inCheck(), clockAfter: 0 }
  })
  const r = g.meta.result
  return {
    id: g.meta.id,
    levelId: 'e1500',
    playerColor: perspective,
    startFen: g.startFen,
    moves,
    fens,
    result: r === '*' ? null : { winner: r === '1-0' ? 'w' : r === '0-1' ? 'b' : null, reason: 'imported' },
    date: g.meta.date ?? new Date(g.meta.importedAt).toISOString()
  }
}

/** Summary stored with the analysis cache: accuracy, ACPL and mistake categories per side. */
export function analysisSummary(record: GameRecord, positions: PositionAnalysis[], bookPlies: number, review: ReviewResult, movetimeMs: number): NonNullable<GameMeta['analysis']> {
  const acpl = acplFrom(positions)
  const coach = getCoach('intermediate')
  const opening = openingFor(record.fens)
  const tags: Record<string, Record<string, number>> = {}
  for (const side of ['w', 'b'] as Color[]) {
    const rep = buildCoachReport({ moves: record.moves, positions, review, playerColor: side, result: 'unfinished', opening, bookPlies }, coach)
    tags[side] = rep.tags
  }
  return { accuracyW: review.accuracy.w, accuracyB: review.accuracy.b, acplW: acpl.w, acplB: acpl.b, movetimeMs, completedAt: Date.now(), tags }
}
