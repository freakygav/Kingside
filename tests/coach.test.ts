import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { COACHES, getCoach } from '../src/shared/coach/coaches'
import { explainCandidates, explainSafety, explainTopic, judgeMove, parseQuestion, type CoachTopic } from '../src/shared/coach/explain'
import { hangingPieces, kingCatchesPawn, opposition, outposts, overloadedDefenders, pinsAgainst } from '../src/shared/coach/features'
import { analyzeMove, materialSwing } from '../src/shared/coach/motifs'
import { buildCoachReport, TAG_INFO } from '../src/shared/coach/report'
import { getLesson } from '../src/shared/lessons'
import { positionProblem } from '../src/shared/position'
import { PUZZLE_CATEGORIES, RATING_BANDS, unpackPuzzle, type PackedPuzzle } from '../src/shared/puzzles'
import { buildReview, type PositionAnalysis } from '../src/shared/review'
import type { AnalysisLine } from '../src/shared/types'
import { engineCandidates } from '../src/main/engine/locate'
import { UciEngine } from '../src/main/engine/uci'

const line = (pv: string[], cp: number, multipv = 1): AnalysisLine => ({ multipv, depth: 18, cp, pv })

describe('position features', () => {
  it('finds hanging, pinned and overloaded pieces', () => {
    const c = new Chess('4k3/8/8/1r6/8/2N5/8/7K b - - 0 1')
    expect(hangingPieces(c, 'b').map((h) => h.square)).toEqual(['b5'])
    const pin = new Chess('4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1')
    expect(pinsAgainst(pin, 'b')[0]).toMatchObject({ absolute: true, pinned: { square: 'c6' } })
    // The d7-queen is the only guard of the knights on c6 and e6, both attacked.
    const ov = new Chess('4k3/3q4/2n1n3/8/2Q1Q3/8/8/4K3 b - - 0 1')
    expect(overloadedDefenders(ov, 'b').map((o) => o.defender.square)).toContain('d7')
  })

  it('outposts, opposition and the rule of the square', () => {
    expect(outposts(new Chess('r1bqkb1r/pp1n2pp/2p1pn2/3p1p2/3P1P2/2P1PN2/PP4PP/RNBQKB1R w KQkq - 0 8'), 'w')).toEqual(['e5'])
    expect(opposition(new Chess('8/8/4k3/8/4K3/8/4P3/8 b - - 0 1'))).toEqual({ has: 'w', kind: 'file' })
    expect(kingCatchesPawn('a4', 'b', 'c2', 'b')).toBe(true)
    expect(kingCatchesPawn('a4', 'b', 'f1', 'b')).toBe(false)
  })
})

describe('motif detection on real moves', () => {
  it('fork, pin, skewer, discovered attack, back-rank mate', () => {
    const kinds = (fen: string, uci: string) => analyzeMove(fen, uci)!.motifs.map((m) => m.kind)
    expect(kinds('2q1k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5d6')).toEqual(expect.arrayContaining(['check', 'fork']))
    expect(kinds('4k3/8/8/4q3/8/8/5K2/R7 w - - 0 1', 'a1e1')).toContain('pin')
    expect(kinds('4q3/8/8/4k3/8/8/8/R5K1 w - - 0 1', 'a1e1')).toContain('skewer')
    expect(kinds('3k4/8/8/8/3N3q/8/6PP/3R2K1 w - - 0 1', 'd4f5')).toEqual(expect.arrayContaining(['discoveredAttack', 'check']))
    expect(kinds('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8')).toContain('backRankMate')
    expect(analyzeMove('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'e1e5')).toBeNull()
  })

  it('material swing along a line', () => {
    expect(materialSwing('2q1k3/8/8/1N6/8/8/8/4K3 w - - 0 1', ['b5d6', 'e8e7', 'd6c8'])).toBe(9)
  })
})

describe('coaches adapt the explanation, not the facts', () => {
  const fen = '4k3/8/8/1r6/8/2N5/8/7K b - - 0 1' // Black's rook on b5 is hanging
  const ctx = { fen, lines: [line(['b5b1'], 0)], perspective: 'b' as const }

  it('every coach reports the same hanging rook in its own words', () => {
    const texts = COACHES.map((c) => explainSafety(ctx, c).paragraphs.join(' '))
    for (const t of texts) expect(t).toMatch(/b5/)
    // Beginner, developing and intermediate+ wordings are all different.
    expect(new Set(texts).size).toBeGreaterThanOrEqual(3)
    expect(texts[0]).toMatch(/not protected.*without losing anything/i)
    expect(texts[5]).toMatch(/loose: 1 attacker/i)
    expect(texts[0]).not.toEqual(texts[5])
  })

  it('candidate count and line length follow the coach level', () => {
    const start = new Chess().fen()
    const lines = [line(['e2e4', 'e7e5', 'g1f3', 'b8c6'], 30, 1), line(['d2d4', 'd7d5', 'c2c4'], 25, 2), line(['g1f3', 'g8f6'], 20, 3), line(['c2c4', 'e7e5'], 15, 4), line(['b1c3', 'd7d5'], 5, 5)]
    for (const c of COACHES) {
      const m = explainCandidates({ fen: start, lines, perspective: 'w' }, c)
      if (c.tier === 1) expect(m.paragraphs[0]).toMatch(/\*\*e4\*\*/)
      else expect(m.lines!.length).toBe(Math.min(c.candidates, lines.length))
      // Numbers only from the Intermediate coach up.
      expect(JSON.stringify(m).includes('+0.30')).toBe(c.tier >= 3)
    }
  })

  it('judges a blunder from engine lines: names the refutation and the better move', () => {
    // After 1.e4 e5 2.Qh5 Nc6 3.Bc4, 3...Nf6?? allows Qxf7#.
    const before = new Chess()
    for (const m of ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4']) before.move(m)
    const fen = before.fen()
    const bLines = [line(['g7g6', 'h5f3', 'g8f6'], -10, 1), line(['d8e7', 'g1f3'], -20, 2)]
    const after = new Chess(fen)
    after.move('Nf6')
    const aLines: AnalysisLine[] = [{ multipv: 1, depth: 30, mate: 1, pv: ['h5f7'] }]
    for (const c of [getCoach('beginner'), getCoach('master')]) {
      const j = judgeMove(fen, 'g8f6', bLines, aLines, { perspective: 'b' }, c)
      expect(j.cls).toBe('blunder')
      expect(j.tags).toContain('kingSafety')
      const text = j.paragraphs.join(' ')
      expect(text).toMatch(/Qxf7#/)
      expect(text).toMatch(/g6/)
    }
  })

  it('understands questions about the actual position', () => {
    const start = new Chess().fen()
    expect(parseQuestion('Why is Nf3 good?', start)).toEqual({ topic: 'move', move: 'g1f3' })
    expect(parseQuestion('what should I be thinking about here', start).topic).toBe('thinking')
    expect(parseQuestion('give me some candidate moves', start).topic).toBe('candidates')
    expect(parseQuestion('explain the opening', start).topic).toBe('opening')
    expect(parseQuestion('Is Bxf7+ possible?', start)).toEqual({ topic: 'move', move: 'Bxf7+' })
    expect(parseQuestion('tell me a joke', start).topic).toBe('overview')
  })
})

describe('coach game report', () => {
  it('builds a plan that points to real lessons and puzzle categories', () => {
    const c = new Chess()
    const sans = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']
    const fens = [c.fen()]
    const moves = sans.map((s) => {
      const color = c.turn()
      const m = c.move(s)
      fens.push(c.fen())
      return { san: m.san, uci: m.from + m.to, color }
    })
    const positions: PositionAnalysis[] = fens.map((fen, i) => {
      if (i === fens.length - 1) return { fen, lines: [], terminal: 'checkmate' as const }
      if (i === 5) return { fen, lines: [line(['g7g6', 'h5f3'], -10, 1), line(['d8e7'], -30, 2)] }
      if (i === 6) return { fen, lines: [{ multipv: 1, depth: 20, mate: 1, pv: ['h5f7'] }] }
      return { fen, lines: [line([['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4'][i] ?? 'a2a3'], 20, 1), line(['a2a3'], 0, 2)] }
    })
    const review = buildReview(moves, positions, 2)
    for (const coach of COACHES) {
      const r = buildCoachReport({ moves, positions, review, playerColor: 'b', result: 'loss', opening: null, bookPlies: 2 }, coach)
      expect(r.summary.length).toBeGreaterThan(0)
      expect(r.moments.some((m) => m.title.includes('Nf6'))).toBe(true)
      expect(r.plan.length).toBeGreaterThan(0)
      for (const p of r.plan) for (const id of p.lessons) expect(getLesson(id), id).toBeDefined()
    }
  })

  it('every mistake tag maps to existing lessons and puzzle categories', () => {
    const cats = new Set(PUZZLE_CATEGORIES.map((c) => c.id))
    for (const [tag, info] of Object.entries(TAG_INFO)) {
      for (const l of info.lessons) expect(getLesson(l), `${tag} -> ${l}`).toBeDefined()
      for (const p of info.puzzles) expect(cats.has(p), `${tag} -> ${p}`).toBe(true)
    }
  })
})

describe('FEN import validation', () => {
  it('accepts legal positions and explains illegal ones', () => {
    expect(positionProblem('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBeNull()
    expect(positionProblem('8/8/8/8/8/8/8/4K2k w - -')).toBeNull()
    expect(positionProblem('k7/8/1K6/8/8/8/8/7Q w - - 0 1')).toMatch(/Black is in check/)
    expect(positionProblem('4k3/8/8/8/8/8/P7/4K3 w - - 0 1')).toBeNull()
    expect(positionProblem('P3k3/8/8/8/8/8/8/4K3 w - - 0 1')).toMatch(/first or last rank|edge/)
    expect(positionProblem('8/8/8/8/8/8/8/4K3 w - - 0 1')).toMatch(/one king|Invalid/)
    expect(positionProblem('not a fen')).toMatch(/FEN/)
    expect(positionProblem('')).toMatch(/empty/)
  })
})

describe('bundled puzzles', () => {
  const all = (JSON.parse(readFileSync(join(__dirname, '../src/renderer/src/data/puzzles.json'), 'utf8')) as PackedPuzzle[]).map(unpackPuzzle)

  it('every puzzle replays legally, and mate puzzles end in mate in the stated length', () => {
    expect(all.length).toBeGreaterThan(2000)
    for (const p of all) {
      const c = new Chess(p.fen)
      for (const u of p.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      const m = p.themes.find((t) => /^mateIn\d$/.test(t))
      if (m) {
        expect(c.isCheckmate(), p.id).toBe(true)
        expect(p.moves.length / 2, p.id).toBe(Number(m.slice(6)))
      }
    }
  })

  it('every category has puzzles, and most category/band cells are populated', () => {
    let filled = 0
    let cells = 0
    for (const cat of PUZZLE_CATEGORIES) {
      const inCat = all.filter((p) => cat.match(new Set(p.themes)))
      expect(inCat.length, cat.id).toBeGreaterThan(20)
      for (const b of RATING_BANDS) {
        cells++
        if (inCat.some((p) => p.rating >= b.min && p.rating < b.max)) filled++
      }
    }
    expect(filled / cells).toBeGreaterThan(0.9)
  })
})

// --- Real engine: every coach answers every topic from real analysis without inventing moves ---
const enginePath = engineCandidates({ settingsPath: null, bundledDir: join(__dirname, '..', 'resources', 'engine') })[0]?.path
describe.skipIf(!enginePath)('coaches on live Stockfish analysis', () => {
  let eng: UciEngine
  beforeAll(async () => {
    eng = await UciEngine.start(enginePath!)
    eng.setOption('MultiPV', '5')
  })
  afterAll(() => eng?.quit())

  it('all topics x all coaches mention only legal moves of the position', async () => {
    const positions = [
      'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', // Qxf7# available
      '8/8/4k3/8/3K4/8/4P3/8 w - - 0 1', // pawn endgame
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2' // opening
    ]
    const topics: CoachTopic[] = ['overview', 'evaluation', 'safety', 'candidates', 'thinking', 'tactics', 'opening', 'endgame']
    for (const fen of positions) {
      const res = await eng.search(fen, 'movetime 400', 10_000)
      const legal = new Set(new Chess(fen).moves())
      for (const coach of COACHES) {
        for (const t of topics) {
          const msg = explainTopic(t, { fen, lines: res.lines, perspective: new Chess(fen).turn() }, coach)
          expect(msg.paragraphs.length, `${coach.id}/${t}`).toBeGreaterThan(0)
          // Any bolded move (the coach's recommendation) must be legal here.
          for (const p of msg.paragraphs) for (const [, san] of p.matchAll(/\*\*([^*]+)\*\*/g)) expect(legal.has(san), `${coach.id}/${t}: ${san}`).toBe(true)
        }
      }
      if (fen.startsWith('r1bqkb1r')) {
        const msg = explainTopic('tactics', { fen, lines: res.lines, perspective: 'w' }, getCoach('beginner'))
        expect(JSON.stringify(msg)).toMatch(/Qxf7#/)
      }
    }
  }, 60_000)
})
