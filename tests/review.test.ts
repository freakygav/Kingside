import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { bookPlyCount, detectOpening, type OpeningDb } from '../src/shared/openings'
import {
  aggregateAccuracy,
  buildReview,
  classifyMove,
  isSacrifice,
  moveAccuracy,
  winProbability,
  type ClassifyContext,
  type PositionAnalysis
} from '../src/shared/review'

const db = JSON.parse(readFileSync(join(__dirname, '../src/renderer/src/data/openings.json'), 'utf8')) as OpeningDb

/** Find cp (side-to-move POV) that yields a target expected score. */
const cpFor = (ep: number) => Math.round(Math.log(ep / (1 - ep)) / 0.00368208)

function pos(fen: string, cps: number[], pv: string[][] = []): PositionAnalysis {
  return { fen, lines: cps.map((cp, i) => ({ multipv: i + 1, depth: 18, cp, pv: pv[i] ?? ['a2a3'] })) }
}

const START = new Chess().fen()
const AFTER_E4 = (() => {
  const c = new Chess()
  c.move('e4')
  return c.fen()
})()

function ctx(over: Partial<ClassifyContext> & Pick<ClassifyContext, 'before' | 'after'>): ClassifyContext {
  return {
    ply: 0,
    move: { san: 'e4', uci: 'e2e4', color: 'w' },
    legalMoves: 20,
    isBook: false,
    prevLoss: 0,
    prevMoverEp: null,
    prevUci: null,
    ...over
  }
}

describe('expected points model', () => {
  it('is 0.5 at equality and saturates for mates', () => {
    expect(winProbability(0)).toBeCloseTo(0.5)
    expect(winProbability(300)).toBeGreaterThan(0.7)
    expect(winProbability(100_000)).toBe(1)
    expect(winProbability(-100_000)).toBe(0)
  })

  it('accuracy is ~100 for no loss and drops with loss', () => {
    expect(moveAccuracy(50, 50)).toBeCloseTo(100, 0)
    expect(moveAccuracy(60, 30)).toBeLessThan(40)
    expect(aggregateAccuracy([])).toBeNull()
    expect(aggregateAccuracy([100, 100])).toBe(100)
    expect(aggregateAccuracy([100, 10])!).toBeLessThan(55)
  })
})

describe('classifyMove thresholds', () => {
  const before = pos(START, [cpFor(0.6)], [['d2d4']])
  const bands: [number, string][] = [
    [0.59, 'excellent'],
    [0.565, 'good'],
    [0.53, 'inaccuracy'],
    [0.45, 'mistake'],
    [0.3, 'blunder']
  ]
  for (const [epAfter, expected] of bands) {
    it(`loss ${(0.6 - epAfter).toFixed(3)} -> ${expected}`, () => {
      // After the move it's Black to move: Black's EP = 1 - epAfter.
      const after = pos(AFTER_E4, [cpFor(1 - epAfter)])
      expect(classifyMove(ctx({ before, after })).cls).toBe(expected)
    })
  }

  it('the engine move is Best even if the re-search is slightly lower', () => {
    const b = pos(START, [cpFor(0.6), cpFor(0.59)], [['e2e4'], ['d2d4']])
    const after = pos(AFTER_E4, [cpFor(1 - 0.58)])
    expect(classifyMove(ctx({ before: b, after })).cls).toBe('best')
  })

  it('forced and book override bands', () => {
    const after = pos(AFTER_E4, [cpFor(0.9)])
    expect(classifyMove(ctx({ before, after, legalMoves: 1 })).cls).toBe('forced')
    expect(classifyMove(ctx({ before, after, isBook: true })).cls).toBe('book')
  })

  it('Miss: opponent blundered into a winning position for us and we gave it back', () => {
    const b = pos(START, [cpFor(0.85)], [['d2d4']])
    const after = pos(AFTER_E4, [cpFor(1 - 0.55)])
    const r = classifyMove(ctx({ before: b, after, prevLoss: 0.3, prevMoverEp: 0.5 }))
    expect(r.cls).toBe('miss')
    // Without the opponent's error it's just a blunder.
    expect(classifyMove(ctx({ before: b, after, prevLoss: 0, prevMoverEp: 0.85 })).cls).toBe('blunder')
  })

  it('Great: the only move that holds', () => {
    const b = pos(START, [cpFor(0.5), cpFor(0.2)], [['e2e4'], ['d2d4']])
    const after = pos(AFTER_E4, [cpFor(0.5)])
    expect(classifyMove(ctx({ before: b, after })).cls).toBe('great')
  })

  it('failed analysis leaves the move unclassified', () => {
    const after: PositionAnalysis = { fen: AFTER_E4, lines: [], failed: true }
    expect(classifyMove(ctx({ before, after })).cls).toBeNull()
  })
})

describe('sacrifice detection (Brilliant)', () => {
  it('flags a piece left en prise to a pawn', () => {
    // White knight jumps to d5 where the e6 pawn can take it.
    const fen = 'r1bqkbnr/pppp1ppp/2n1p3/8/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3'
    expect(isSacrifice(fen, 'c3d5', [])).toBe(true)
  })
  it('does not flag a defended even trade', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
    expect(isSacrifice(fen, 'e4d5', ['d8d5'])).toBe(false)
  })
  it('a sound sacrifice classified best becomes Brilliant', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n1p3/8/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 0 3'
    const c = new Chess(fen)
    c.move({ from: 'c3', to: 'd5' })
    const b = pos(fen, [cpFor(0.6), cpFor(0.55)], [['c3d5'], ['d2d4']])
    const after = pos(c.fen(), [cpFor(0.4)], [['e6d5']])
    const r = classifyMove(ctx({ before: b, after, move: { san: 'Nd5', uci: 'c3d5', color: 'w' } }))
    expect(r.cls).toBe('brilliant')
  })
})

describe('openings', () => {
  const fensOf = (sans: string[]) => {
    const c = new Chess()
    const out = [c.fen()]
    for (const s of sans) {
      c.move(s)
      out.push(c.fen())
    }
    return out
  }

  it('names the Italian Game / Giuoco Piano and returns its defining moves', () => {
    const m = detectOpening(db, fensOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']))!
    expect(m.eco).toBe('C50')
    expect(m.name).toMatch(/Italian Game/)
    expect(m.pgn).toBe('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5')
  })

  it('recognises transpositions by position', () => {
    const a = detectOpening(db, fensOf(['d4', 'd5', 'c4', 'e6']))
    const b = detectOpening(db, fensOf(['c4', 'e6', 'd4', 'd5']))
    expect(a?.name).toBe("Queen's Gambit Declined")
    expect(b?.name).toBe(a?.name)
    expect(detectOpening(db, fensOf(['Nf3', 'c5', 'e4', 'd6']))?.name).toBe('Sicilian Defense: Modern Variations')
  })

  it('counts book plies and stops at the first novelty', () => {
    const fens = fensOf(['e4', 'e5', 'Nf3', 'Nc6', 'Ke2'])
    expect(bookPlyCount(db, fens)).toBe(4)
  })

  it('returns null (no invented name) when nothing matches', () => {
    expect(detectOpening(db, [new Chess().fen()])).toBeNull()
  })
})

describe('buildReview', () => {
  it('produces one reviewed move per move with summary counts', () => {
    const c = new Chess()
    const sans = ['f3', 'e5', 'g4', 'Qh4#']
    const fens = [c.fen()]
    const moves = sans.map((s) => {
      const color = c.turn()
      const m = c.move(s)
      fens.push(c.fen())
      return { san: m.san, uci: m.from + m.to, color }
    })
    const positions: PositionAnalysis[] = fens.map((fen, i) => {
      if (i === fens.length - 1) return { fen, lines: [], terminal: 'checkmate' as const }
      if (i === 3) return pos(fen, [100_000 - 100], [['d8h4']]) // black has mate in 1
      if (i === 2) return pos(fen, [-50], [['e2e4']])
      return pos(fen, [20], [['e2e4']])
    })
    const r = buildReview(moves, positions, bookPlyCount(db, fens))
    expect(r.moves).toHaveLength(4)
    expect(r.moves[3].cls).toBe('best') // Qh4# was the engine move
    expect(r.moves[2].cls).toBe('blunder') // g4 allows mate
    expect(r.whiteExpected).toHaveLength(5)
    expect(r.whiteExpected[4]).toBe(0)
    expect(r.accuracy.w).not.toBeNull()
    expect(() => buildReview(moves, positions.slice(1), 0)).toThrow()
  })
})
