import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { LESSONS, lessonsByLevel, squareAnswer, isLevelUnlocked, type MoveExercise } from '../src/shared/lessons'
import { engineCandidates } from '../src/main/engine/locate'
import { UciEngine } from '../src/main/engine/uci'
import { lineCp } from '../src/shared/strength'
import { positionProblem } from '../src/shared/position'
import { winProbability } from '../src/shared/review'

const sq = /^[a-h][1-8]$/

describe('lesson catalogue', () => {
  it('has every requested lesson in the right track', () => {
    expect(lessonsByLevel('beginner').map((l) => l.id)).toEqual([
      'piece-movement', 'basic-rules', 'check-checkmate', 'castling', 'en-passant', 'promotion', 'center-control', 'developing-pieces', 'opening-principles', 'protecting-king'
    ])
    expect(lessonsByLevel('intermediate').map((l) => l.id)).toEqual([
      'forks', 'pins', 'skewers', 'discovered-attacks', 'double-attacks', 'deflection', 'decoy', 'removing-defender', 'back-rank-mate', 'basic-endgames', 'rook-endgames', 'king-pawn-endgames'
    ])
    expect(lessonsByLevel('advanced').map((l) => l.id)).toEqual([
      'zwischenzug', 'zugzwang', 'opposition', 'positional-sacrifices', 'exchange-sacrifices', 'prophylaxis', 'positional-advantages', 'pawn-structures', 'weak-squares', 'outposts', 'advanced-endgames', 'tactical-combinations'
    ])
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length)
  })

  it.each(LESSONS.map((l) => [l.id, l] as const))('%s: explanation, board demo, interactive move exercise, knowledge check', (_id, l) => {
    expect(l.steps[0].kind).toBe('concept')
    expect(l.steps.some((s) => s.kind === 'demo')).toBe(true)
    expect(l.steps.some((s) => s.kind === 'exercise')).toBe(true)
    expect(l.steps[l.steps.length - 1].kind).toBe('quiz')
    expect(l.steps.filter((s) => s.kind === 'quiz').length).toBeGreaterThanOrEqual(2)
  })
})

describe('lesson positions are legal and solutions check out', () => {
  for (const l of LESSONS) {
    it(l.id, () => {
      l.steps.forEach((s, i) => {
        const where = `${l.id} step ${i}`
        if ('fen' in s && s.fen) expect(positionProblem(s.fen), where).toBeNull()
        if ('arrows' in s) for (const a of s.arrows ?? []) expect(a, where).toMatch(/^[a-h][1-8][a-h][1-8]$/)
        if ('squares' in s && Array.isArray(s.squares)) for (const q of s.squares) expect(q, where).toMatch(sq)
        if (s.kind === 'demo') {
          const c = new Chess(s.fen)
          for (const m of s.moves) expect(() => c.move(m.san), `${where} demo ${m.san}`).not.toThrow()
        }
        if (s.kind === 'quiz') {
          expect(s.answer).toBeGreaterThanOrEqual(0)
          expect(s.answer).toBeLessThan(s.options.length)
        }
        if (s.kind === 'squares') {
          expect(new Set(squareAnswer(s.fen, s.check)), where).toEqual(new Set(s.answer))
        }
        if (s.kind === 'exercise') {
          const play = (firstAlt?: { ply: number; san: string }) => {
            const c = new Chess(s.fen)
            s.solution.forEach((san, ply) => {
              const mv = firstAlt && firstAlt.ply === ply ? firstAlt.san : san
              expect(() => c.move(mv), `${where} solution ${mv}`).not.toThrow()
            })
            return c
          }
          const end = play()
          if (s.goal === 'mate') expect(end.isCheckmate(), `${where} ends in mate`).toBe(true)
          for (const [ply, alts] of Object.entries(s.alt ?? {})) {
            expect(Number(ply) % 2, `${where} alt must be a user ply`).toBe(0)
            for (const a of alts) play({ ply: Number(ply), san: a })
          }
          const legal = new Chess(s.fen).moves()
          for (const w of Object.keys(s.wrong ?? {})) expect(legal, `${where} wrong move ${w} must be legal`).toContain(w)
        }
      })
    })
  }
})

describe('lesson progression rules', () => {
  it('unlocks levels after enough lessons, or by override', () => {
    const none = new Set<string>()
    expect(isLevelUnlocked('beginner', none, { intermediate: false, advanced: false })).toBe(true)
    expect(isLevelUnlocked('intermediate', none, { intermediate: false, advanced: false })).toBe(false)
    const five = new Set(lessonsByLevel('beginner').slice(0, 5).map((l) => l.id))
    expect(isLevelUnlocked('intermediate', five, { intermediate: false, advanced: false })).toBe(true)
    expect(isLevelUnlocked('advanced', five, { intermediate: false, advanced: true })).toBe(true)
  })
})

// --- Engine verification of every graded move ----------------------------------------------

const enginePath = engineCandidates({ settingsPath: null, bundledDir: join(__dirname, '..', 'resources', 'engine') })[0]?.path
describe.skipIf(!enginePath)('lesson solutions verified by Stockfish', () => {
  let eng: UciEngine
  beforeAll(async () => {
    eng = await UciEngine.start(enginePath!)
    eng.setOption('Threads', '2')
    eng.setOption('Hash', '64')
    eng.setOption('MultiPV', '1')
  })
  afterAll(() => eng?.quit())

  /** Score (side-to-move POV) of the best move, and of a given move. */
  const bestScore = async (fen: string) => lineCp((await eng.search(fen, 'movetime 350', 10_000)).lines[0] ?? { cp: 0 })
  const moveScore = async (fen: string, san: string) => {
    const c = new Chess(fen)
    c.move(san)
    if (c.isCheckmate()) return 100_000
    if (c.isDraw() || c.isStalemate()) return 0
    return -(await bestScore(c.fen()))
  }

  const exercises: [string, MoveExercise][] = []
  for (const l of LESSONS) l.steps.forEach((s, i) => { if (s.kind === 'exercise' && s.verify !== 'legal') exercises.push([`${l.id}#${i}`, s]) })

  it.each(exercises)('%s', async (_name, s) => {
    const c = new Chess(s.fen)
    for (let ply = 0; ply < s.solution.length; ply += 2) {
      const fen = c.fen()
      const best = await bestScore(fen)
      const candidates = [s.solution[ply], ...(s.alt?.[ply] ?? [])]
      for (const san of candidates) {
        const got = await moveScore(fen, san)
        // Compare in expected-score terms so +70.4 vs +71.2 isn't treated as a difference.
        const ep = (cp: number) => winProbability(cp)
        const ok =
          s.verify === 'best' ? ep(got) >= ep(best) - 0.03
            : s.verify === 'sound' ? ep(got) >= ep(best) - 0.08
              : got >= 250
        expect(ok, `${san} at ply ${ply}: ${got} vs best ${best} (${s.verify})`).toBe(true)
      }
      if (ply === 0) {
        const sol = await moveScore(fen, s.solution[0])
        for (const w of Object.keys(s.wrong ?? {})) {
          const wr = await moveScore(fen, w)
          // "Wrong" explanations must describe genuinely worse moves (clearly worse for tactics).
          const margin = s.verify === 'best' ? 30 : 1
          expect(wr, `wrong move ${w} should be worse than ${s.solution[0]} (${wr} vs ${sol})`).toBeLessThan(sol - margin)
        }
      }
      c.move(s.solution[ply])
      if (ply + 1 < s.solution.length) c.move(s.solution[ply + 1])
    }
  }, 60_000)
})
