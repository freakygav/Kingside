import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ACHIEVEMENTS,
  applyEvent,
  emptyProfile,
  learningStreak,
  levelFromXp,
  localDay,
  migrateProfile,
  strengthsAndWeaknesses,
  type ProfileData
} from '../src/shared/progress'
import { expectedScore, updateRating } from '../src/shared/rating'
import { ProfileStore } from '../src/main/profileStore'

const DAY = 86_400_000
const T0 = new Date(2026, 10, 13, 12).getTime()

describe('puzzle / playing rating', () => {
  it('moves toward the result, more for upsets', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5)
    const upWin = updateRating(1000, 1400, 1, 0) - 1000
    const easyWin = updateRating(1000, 600, 1, 0) - 1000
    expect(upWin).toBeGreaterThan(easyWin)
    expect(easyWin).toBeGreaterThan(0)
    expect(updateRating(1000, 1000, 0, 0)).toBeLessThan(1000)
    expect(updateRating(1000, 1000, 0.5, 0)).toBe(1000)
    // Steps shrink once established.
    expect(Math.abs(updateRating(1000, 1000, 1, 100) - 1000)).toBeLessThan(upWin)
  })
})

describe('applyEvent', () => {
  it('puzzle win raises rating, awards XP, streak and first-puzzle achievement', () => {
    const r = applyEvent(emptyProfile(T0), { type: 'puzzleResult', id: 'a', puzzleRating: 1200, result: 'win', ms: 20_000, hints: 0, themes: ['fork', 'short'] }, T0)
    expect(r.profile.puzzles.rating).toBeGreaterThan(1000)
    expect(r.ratingDelta).toBe(r.profile.puzzles.rating - 1000)
    expect(r.profile.puzzles.solved).toBe(1)
    expect(r.profile.puzzles.streak).toBe(1)
    expect(r.unlocked).toContain('first-puzzle')
    expect(r.xpGained).toBe(18 + 25) // 10 + (1200-400)/100, plus the achievement bonus
    expect(r.profile.counters.tacticalPuzzles).toBe(1)
    expect(r.profile.puzzles.themeStats.fork).toEqual({ attempts: 1, solved: 1 })
  })

  it('a loss lowers rating, resets streak, gives no XP; half credit is in between', () => {
    let p = emptyProfile(T0)
    p = applyEvent(p, { type: 'puzzleResult', id: 'a', puzzleRating: 1000, result: 'win', ms: 1, hints: 0, themes: [] }, T0).profile
    const loss = applyEvent(p, { type: 'puzzleResult', id: 'b', puzzleRating: 1000, result: 'loss', ms: 1, hints: 0, themes: [] }, T0)
    expect(loss.ratingDelta).toBeLessThan(0)
    expect(loss.profile.puzzles.streak).toBe(0)
    expect(loss.xpGained).toBe(0)
    const half = applyEvent(p, { type: 'puzzleResult', id: 'b', puzzleRating: 1000, result: 'half', ms: 1, hints: 2, themes: [] }, T0)
    expect(half.ratingDelta!).toBeGreaterThan(loss.ratingDelta!)
    expect(half.profile.puzzles.cleanSolved).toBe(1)
  })

  it('awards streak bonus every 5 solves and 10-puzzle achievement', () => {
    let p = emptyProfile(T0)
    let bonusSeen = false
    for (let i = 0; i < 10; i++) {
      const r = applyEvent(p, { type: 'puzzleResult', id: String(i), puzzleRating: 400, result: 'win', ms: 1, hints: 0, themes: [] }, T0)
      if (i === 4) bonusSeen = r.xpGained >= 30
      p = r.profile
    }
    expect(bonusSeen).toBe(true)
    expect(p.achievements['puzzles-10']).toBeDefined()
    expect(p.achievements['puzzle-streak-10']).toBeDefined()
  })

  it('lesson completion: full XP once, small XP on revisits, accuracy kept', () => {
    let p = emptyProfile(T0)
    p = applyEvent(p, { type: 'lessonStep', lessonId: 'forks', step: 3, result: { key: '2', correct: true, attempts: 1 } }, T0).profile
    expect(p.lessons.forks.step).toBe(3)
    const first = applyEvent(p, { type: 'lessonComplete', lessonId: 'forks', level: 'intermediate', accuracy: 100 }, T0)
    expect(first.xpGained).toBe(75 + 25 + 25 + 50) // lesson + accuracy bonus + First Lesson + Flawless
    const again = applyEvent(first.profile, { type: 'lessonComplete', lessonId: 'forks', level: 'intermediate', accuracy: 60 }, T0)
    expect(again.xpGained).toBe(10)
    expect(again.profile.lessons.forks.bestAccuracy).toBe(100)
    expect(again.profile.lessons.forks.lastAccuracy).toBe(60)
    expect(again.profile.counters.lessonCompletions).toBe(2)
  })

  it('games update W/L/D, playing Elo estimate and training counters', () => {
    const game = (id: string, result: 'win' | 'loss' | 'draw', botElo: number | null, training = false) => ({
      id, date: '2026-11-13', levelId: 'e1500', botElo, playerColor: 'w' as const, result, reason: 'checkmate', startFen: '', moves: [], opening: null, training
    })
    let p = emptyProfile(T0)
    const w = applyEvent(p, { type: 'gameFinished', game: game('g1', 'win', 1800, true) }, T0)
    expect(w.profile.playing.elo).toBeGreaterThan(800)
    expect(w.unlocked).toEqual(expect.arrayContaining(['first-win', 'giant-slayer', 'coached']))
    p = w.profile
    p = applyEvent(p, { type: 'gameFinished', game: game('g2', 'loss', null) }, T0).profile
    p = applyEvent(p, { type: 'gameFinished', game: game('g3', 'draw', 1000) }, T0).profile
    expect(p.games.map((g) => g.result)).toEqual(['draw', 'loss', 'win'])
    const rev = applyEvent(p, { type: 'gameReviewed', gameId: 'g1', accuracy: 81.5, mistakeTags: { hanging: 2 } }, T0)
    expect(rev.xpGained).toBe(25)
    expect(rev.profile.games.find((g) => g.id === 'g1')!.reviewed).toBe(true)
    // Reviewing again gives no extra XP.
    expect(applyEvent(rev.profile, { type: 'gameReviewed', gameId: 'g1', accuracy: 81.5, mistakeTags: {} }, T0).xpGained).toBe(0)
  })

  it('every achievement can be earned (no dead definitions)', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id))
    expect(ids.size).toBe(ACHIEVEMENTS.length)
    for (const id of ['first-lesson', 'first-puzzle', 'puzzles-10', 'puzzles-100', 'tactical-thinker', 'endgame-student', 'streak-7', 'lessons-100']) {
      expect(ids.has(id)).toBe(true)
    }
  })
})

describe('streaks, levels, migration, strengths', () => {
  it('learning streak counts consecutive days, tolerating not-yet-today', () => {
    const days = [0, 1, 2, 3].map((i) => localDay(T0 - i * DAY))
    expect(learningStreak(days, T0)).toBe(4)
    expect(learningStreak(days.slice(1), T0)).toBe(3) // nothing today yet
    expect(learningStreak([localDay(T0 - 3 * DAY)], T0)).toBe(0)
  })

  it('7-day streak unlocks the achievement', () => {
    let p = emptyProfile(T0)
    for (let i = 6; i >= 0; i--) p = applyEvent(p, { type: 'coachQuestion' }, T0 - i * DAY).profile
    expect(p.achievements['streak-7']).toBeDefined()
  })

  it('levels from XP', () => {
    expect(levelFromXp(0).level).toBe(1)
    expect(levelFromXp(99).level).toBe(1)
    expect(levelFromXp(100).level).toBe(2)
    expect(levelFromXp(300)).toEqual({ level: 3, into: 0, span: 300 })
  })

  it('migrates old / malformed documents', () => {
    const m = migrateProfile({ xp: 50, puzzles: { rating: 1234 }, coach: { feedback: 'bogus' }, lessons: 'x' }, T0)
    expect(m.schemaVersion).toBe(1)
    expect(m.xp).toBe(50)
    expect(m.puzzles.rating).toBe(1234)
    expect(m.puzzles.history).toEqual([])
    expect(m.coach.feedback).toBe('mistakes')
    expect(m.lessons).toEqual({})
    expect(migrateProfile(null, T0).xp).toBe(0)
  })

  it('reports strong and weak themes from real attempts only', () => {
    const p: ProfileData = emptyProfile(T0)
    p.puzzles.themeStats = { fork: { attempts: 6, solved: 6 }, pin: { attempts: 5, solved: 1 }, skewer: { attempts: 2, solved: 0 } }
    const s = strengthsAndWeaknesses(p)
    expect(s.strong).toEqual(['fork'])
    expect(s.weak).toEqual(['pin'])
  })
})

describe('ProfileStore persistence', () => {
  it('saves, reloads, migrates and keeps a backup of a corrupt file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ks-profile-'))
    const a = new ProfileStore(dir, () => T0)
    a.apply({ type: 'puzzleResult', id: 'x', puzzleRating: 900, result: 'win', ms: 5, hints: 0, themes: [] })
    const b = new ProfileStore(dir, () => T0)
    expect(b.get().puzzles.solved).toBe(1)
    // Old schema without version gets migrated and written back.
    writeFileSync(join(dir, 'profile.json'), JSON.stringify({ xp: 7 }))
    const c = new ProfileStore(dir, () => T0)
    expect(c.get().xp).toBe(7)
    expect(JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8')).schemaVersion).toBe(1)
    writeFileSync(join(dir, 'profile.json'), '{nope')
    const d = new ProfileStore(dir, () => T0)
    expect(d.get().xp).toBe(0)
    expect(readdirSync(dir).some((f) => f.startsWith('profile.corrupt-'))).toBe(true)
  })
})
