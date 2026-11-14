import { DEFAULT_PLAYING_ELO, DEFAULT_PUZZLE_RATING, FULL_STRENGTH_ELO, updateRating } from './rating'

/**
 * The training profile: lessons, puzzles, games, XP and achievements. One JSON document persisted
 * by the main process (userData/profile.json). All changes go through applyEvent() so the rules
 * (XP, ratings, streaks, achievements) live in one pure, tested place.
 */
export const SCHEMA_VERSION = 1

export type LessonLevel = 'beginner' | 'intermediate' | 'advanced'
export type CoachFeedback = 'every' | 'mistakes' | 'blunders' | 'end'

export interface StepResult {
  correct: boolean
  attempts: number
}

export interface LessonProgress {
  status: 'in-progress' | 'completed'
  /** Step to resume from. */
  step: number
  /** Results of graded steps (exercises, quiz questions) keyed by step index. */
  results: Record<string, StepResult>
  completions: number
  bestAccuracy: number | null
  lastAccuracy: number | null
  updatedAt: number
}

export interface PuzzleAttempt {
  id: string
  rating: number
  result: 'win' | 'half' | 'loss'
  ms: number
  hints: number
  t: number
  themes: string[]
  delta: number
  ratingAfter: number
}

export interface GameSummary {
  id: string
  date: string
  levelId: string
  /** Approximate bot strength used for the playing-Elo estimate (null = unknown). */
  botElo: number | null
  playerColor: 'w' | 'b'
  result: 'win' | 'loss' | 'draw'
  reason: string
  startFen: string
  moves: string[]
  reviewed: boolean
  accuracy: number | null
  /** Counts of mistake motifs found by the coach review, e.g. { hanging: 2, missedFork: 1 }. */
  mistakeTags: Record<string, number>
  opening: string | null
  training: boolean
}

export interface ActivityItem {
  t: number
  kind: 'lesson' | 'puzzle' | 'game' | 'review' | 'achievement' | 'coach'
  text: string
}

export interface ProfileData {
  schemaVersion: number
  createdAt: number
  xp: number
  xpLog: { t: number; amount: number; reason: string }[]
  /** Local dates (YYYY-MM-DD) with any training activity. */
  activityDays: string[]
  activity: ActivityItem[]
  lessons: Record<string, LessonProgress>
  lessonUnlocks: { intermediate: boolean; advanced: boolean }
  puzzles: {
    rating: number
    attempted: number
    solved: number
    cleanSolved: number
    streak: number
    bestStreak: number
    totalSolveMs: number
    ratingHistory: { t: number; r: number }[]
    history: PuzzleAttempt[]
    themeStats: Record<string, { attempts: number; solved: number }>
  }
  coach: { selectedId: string; feedback: CoachFeedback; training: boolean }
  games: GameSummary[]
  playing: { elo: number; games: number; history: { t: number; elo: number }[] }
  achievements: Record<string, number>
  counters: {
    lessonCompletions: number
    gamesReviewed: number
    trainingGames: number
    coachQuestions: number
    tacticalPuzzles: number
    endgamePuzzles: number
  }
}

export function emptyProfile(now: number): ProfileData {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    xp: 0,
    xpLog: [],
    activityDays: [],
    activity: [],
    lessons: {},
    lessonUnlocks: { intermediate: false, advanced: false },
    puzzles: {
      rating: DEFAULT_PUZZLE_RATING,
      attempted: 0,
      solved: 0,
      cleanSolved: 0,
      streak: 0,
      bestStreak: 0,
      totalSolveMs: 0,
      ratingHistory: [],
      history: [],
      themeStats: {}
    },
    coach: { selectedId: 'beginner', feedback: 'mistakes', training: false },
    games: [],
    playing: { elo: DEFAULT_PLAYING_ELO, games: 0, history: [] },
    achievements: {},
    counters: { lessonCompletions: 0, gamesReviewed: 0, trainingGames: 0, coachQuestions: 0, tacticalPuzzles: 0, endgamePuzzles: 0 }
  }
}

/**
 * Bring any stored document up to the current schema. Unknown/missing fields get defaults, so an
 * older file (or a hand-edited one) never crashes the app. v0 = no schemaVersion field.
 */
export function migrateProfile(raw: unknown, now: number): ProfileData {
  const base = emptyProfile(now)
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<ProfileData>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  const obj = <T>(v: unknown, d: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : d)
  const p = obj(r.puzzles, base.puzzles)
  const fb: CoachFeedback[] = ['every', 'mistakes', 'blunders', 'end']
  const coach = obj(r.coach, base.coach)
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: num(r.createdAt, now),
    xp: Math.max(0, num(r.xp, 0)),
    xpLog: arr(r.xpLog),
    activityDays: arr<string>(r.activityDays).filter((d) => typeof d === 'string'),
    activity: arr(r.activity),
    lessons: obj(r.lessons, {}),
    lessonUnlocks: { ...base.lessonUnlocks, ...obj(r.lessonUnlocks, {}) },
    puzzles: {
      rating: num(p.rating, DEFAULT_PUZZLE_RATING),
      attempted: num(p.attempted, 0),
      solved: num(p.solved, 0),
      cleanSolved: num(p.cleanSolved, 0),
      streak: num(p.streak, 0),
      bestStreak: num(p.bestStreak, 0),
      totalSolveMs: num(p.totalSolveMs, 0),
      ratingHistory: arr(p.ratingHistory),
      history: arr(p.history),
      themeStats: obj(p.themeStats, {})
    },
    coach: {
      selectedId: typeof coach.selectedId === 'string' ? coach.selectedId : 'beginner',
      feedback: fb.includes(coach.feedback) ? coach.feedback : 'mistakes',
      training: typeof coach.training === 'boolean' ? coach.training : false
    },
    games: arr(r.games),
    playing: { ...base.playing, ...obj(r.playing, {}) },
    achievements: obj(r.achievements, {}),
    counters: { ...base.counters, ...obj(r.counters, {}) }
  }
}

// ---------------------------------------------------------------------------------------------
// Derived values

export function localDay(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Consecutive days with activity, ending today (or yesterday, so the streak isn't lost before you train today). */
export function learningStreak(days: string[], now: number): number {
  const set = new Set(days)
  const dayMs = 86_400_000
  let t = now
  if (!set.has(localDay(t))) t -= dayMs
  let n = 0
  while (set.has(localDay(t))) {
    n++
    t -= dayMs
  }
  return n
}

/** XP needed to reach a level: 0, 100, 300, 600, 1000, ... */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1)
}

export function levelFromXp(xp: number): { level: number; into: number; span: number } {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  const into = xp - xpForLevel(level)
  return { level, into, span: xpForLevel(level + 1) - xpForLevel(level) }
}

export function lessonsCompleted(p: ProfileData): number {
  return Object.values(p.lessons).filter((l) => l.status === 'completed').length
}

export function gameRecord(p: ProfileData): { played: number; won: number; lost: number; drawn: number } {
  const won = p.games.filter((g) => g.result === 'win').length
  const lost = p.games.filter((g) => g.result === 'loss').length
  const drawn = p.games.filter((g) => g.result === 'draw').length
  return { played: p.games.length, won, lost, drawn }
}

// ---------------------------------------------------------------------------------------------
// Achievements

export interface Achievement {
  id: string
  name: string
  description: string
  xp: number
  earned: (p: ProfileData, now: number) => boolean
}

const TACTIC_THEMES = ['fork', 'pin', 'skewer', 'discoveredAttack', 'deflection', 'attraction', 'doubleCheck', 'capturingDefender']
export const ENDGAME_LESSONS = ['basic-endgames', 'rook-endgames', 'king-pawn-endgames']

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-lesson', name: 'First Lesson', description: 'Complete your first lesson.', xp: 25, earned: (p) => lessonsCompleted(p) >= 1 },
  { id: 'first-puzzle', name: 'First Puzzle', description: 'Solve your first puzzle.', xp: 25, earned: (p) => p.puzzles.solved >= 1 },
  { id: 'puzzles-10', name: '10 Puzzles Solved', description: 'Solve 10 puzzles.', xp: 50, earned: (p) => p.puzzles.solved >= 10 },
  { id: 'puzzles-100', name: '100 Puzzles Solved', description: 'Solve 100 puzzles.', xp: 200, earned: (p) => p.puzzles.solved >= 100 },
  { id: 'tactical-thinker', name: 'Tactical Thinker', description: 'Solve 25 fork, pin, skewer, discovery, deflection or attraction puzzles.', xp: 100, earned: (p) => p.counters.tacticalPuzzles >= 25 },
  { id: 'endgame-student', name: 'Endgame Student', description: 'Complete all three endgame lessons.', xp: 100, earned: (p) => ENDGAME_LESSONS.every((id) => p.lessons[id]?.status === 'completed') },
  { id: 'streak-7', name: '7-Day Learning Streak', description: 'Train on 7 days in a row.', xp: 150, earned: (p, now) => learningStreak(p.activityDays, now) >= 7 },
  { id: 'lessons-100', name: '100 Lessons Completed', description: 'Finish 100 lessons (revisits count).', xp: 300, earned: (p) => p.counters.lessonCompletions >= 100 },
  { id: 'perfect-lesson', name: 'Flawless', description: 'Finish a lesson with 100% accuracy.', xp: 50, earned: (p) => Object.values(p.lessons).some((l) => l.bestAccuracy === 100) },
  { id: 'puzzle-streak-10', name: 'On Fire', description: 'Solve 10 puzzles in a row.', xp: 75, earned: (p) => p.puzzles.bestStreak >= 10 },
  { id: 'puzzle-1500', name: 'Sharp Eye', description: 'Reach a puzzle rating of 1500.', xp: 100, earned: (p) => p.puzzles.rating >= 1500 },
  { id: 'first-win', name: 'First Victory', description: 'Beat the bot.', xp: 50, earned: (p) => p.games.some((g) => g.result === 'win') },
  { id: 'giant-slayer', name: 'Giant Slayer', description: 'Beat a bot rated ~1800 or stronger.', xp: 150, earned: (p) => p.games.some((g) => g.result === 'win' && (g.botElo ?? 0) >= 1800) },
  { id: 'reviewer-5', name: 'Student of the Game', description: 'Review 5 of your games.', xp: 75, earned: (p) => p.counters.gamesReviewed >= 5 },
  { id: 'coached', name: 'Coached', description: 'Finish a game with a coach watching.', xp: 50, earned: (p) => p.counters.trainingGames >= 1 }
]

// ---------------------------------------------------------------------------------------------
// Events

export type ProfileEvent =
  | { type: 'lessonStep'; lessonId: string; step: number; result?: { key: string; correct: boolean; attempts: number } }
  | { type: 'lessonComplete'; lessonId: string; level: LessonLevel; accuracy: number }
  | { type: 'unlockLevel'; level: 'intermediate' | 'advanced' }
  | { type: 'puzzleResult'; id: string; puzzleRating: number; result: 'win' | 'half' | 'loss'; ms: number; hints: number; themes: string[] }
  | { type: 'gameFinished'; game: Omit<GameSummary, 'reviewed' | 'accuracy' | 'mistakeTags'> }
  | { type: 'gameReviewed'; gameId: string; accuracy: number | null; mistakeTags: Record<string, number> }
  | { type: 'coachPrefs'; prefs: Partial<ProfileData['coach']> }
  | { type: 'coachQuestion' }

export interface EventOutcome {
  profile: ProfileData
  xpGained: number
  /** Ids of achievements unlocked by this event. */
  unlocked: string[]
  levelUp: number | null
  /** Puzzle rating change, for puzzleResult events. */
  ratingDelta?: number
}

const LESSON_XP: Record<LessonLevel, number> = { beginner: 50, intermediate: 75, advanced: 100 }
const MAX_LOG = 500

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

export function applyEvent(input: ProfileData, e: ProfileEvent, now: number): EventOutcome {
  const p = clone(input)
  let xp = 0
  const reasons: string[] = []
  const award = (n: number, why: string) => {
    if (n <= 0) return
    xp += n
    reasons.push(why)
  }
  const log = (kind: ActivityItem['kind'], text: string) => {
    p.activity.unshift({ t: now, kind, text })
    p.activity = p.activity.slice(0, 100)
  }
  const touchDay = () => {
    const d = localDay(now)
    if (!p.activityDays.includes(d)) p.activityDays.push(d)
    p.activityDays = p.activityDays.slice(-400)
  }
  let ratingDelta: number | undefined

  switch (e.type) {
    case 'lessonStep': {
      const lp: LessonProgress = p.lessons[e.lessonId] ?? {
        status: 'in-progress', step: 0, results: {}, completions: 0, bestAccuracy: null, lastAccuracy: null, updatedAt: now
      }
      if (lp.status === 'completed' && e.step === 0) lp.results = {}
      lp.step = Math.max(0, Math.floor(e.step))
      if (e.result) lp.results[e.result.key] = { correct: e.result.correct, attempts: e.result.attempts }
      lp.updatedAt = now
      p.lessons[e.lessonId] = lp
      touchDay()
      break
    }
    case 'lessonComplete': {
      const lp: LessonProgress = p.lessons[e.lessonId] ?? {
        status: 'in-progress', step: 0, results: {}, completions: 0, bestAccuracy: null, lastAccuracy: null, updatedAt: now
      }
      const first = lp.completions === 0
      const acc = Math.round(Math.min(100, Math.max(0, e.accuracy)))
      lp.status = 'completed'
      lp.step = 0
      lp.completions++
      lp.lastAccuracy = acc
      lp.bestAccuracy = Math.max(lp.bestAccuracy ?? 0, acc)
      lp.updatedAt = now
      p.lessons[e.lessonId] = lp
      p.counters.lessonCompletions++
      if (first) {
        award(LESSON_XP[e.level], 'Lesson completed')
        if (acc >= 90) award(25, 'High lesson accuracy')
      } else award(10, 'Lesson revisited')
      log('lesson', `Completed a lesson with ${acc}% accuracy`)
      touchDay()
      break
    }
    case 'unlockLevel':
      p.lessonUnlocks[e.level] = true
      break
    case 'puzzleResult': {
      const pz = p.puzzles
      const score = e.result === 'win' ? 1 : e.result === 'half' ? 0.5 : 0
      const before = pz.rating
      pz.rating = updateRating(pz.rating, e.puzzleRating, score, pz.attempted)
      ratingDelta = pz.rating - before
      pz.attempted++
      if (e.result !== 'loss') {
        pz.solved++
        pz.totalSolveMs += Math.max(0, e.ms)
        if (e.result === 'win') pz.cleanSolved++
        pz.streak++
        pz.bestStreak = Math.max(pz.bestStreak, pz.streak)
        award(e.result === 'win' ? 10 + Math.max(0, Math.round((e.puzzleRating - 400) / 100)) : 5, 'Puzzle solved')
        if (pz.streak % 5 === 0) award(20, `${pz.streak}-puzzle streak`)
        if (e.themes.some((t) => TACTIC_THEMES.includes(t))) p.counters.tacticalPuzzles++
        if (e.themes.includes('endgame')) p.counters.endgamePuzzles++
      } else pz.streak = 0
      for (const t of e.themes) {
        const s = pz.themeStats[t] ?? { attempts: 0, solved: 0 }
        s.attempts++
        if (e.result !== 'loss') s.solved++
        pz.themeStats[t] = s
      }
      pz.ratingHistory.push({ t: now, r: pz.rating })
      pz.ratingHistory = pz.ratingHistory.slice(-1000)
      pz.history.unshift({
        id: e.id, rating: e.puzzleRating, result: e.result, ms: e.ms, hints: e.hints, t: now, themes: e.themes, delta: ratingDelta, ratingAfter: pz.rating
      })
      pz.history = pz.history.slice(0, 1000)
      log('puzzle', `${e.result === 'loss' ? 'Missed' : 'Solved'} a ${e.puzzleRating} puzzle (${ratingDelta >= 0 ? '+' : ''}${ratingDelta})`)
      touchDay()
      break
    }
    case 'gameFinished': {
      const g: GameSummary = { ...e.game, reviewed: false, accuracy: null, mistakeTags: {} }
      p.games = [g, ...p.games.filter((x) => x.id !== g.id)].slice(0, 200)
      const opp = g.botElo ?? FULL_STRENGTH_ELO
      const score = g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0
      p.playing.elo = updateRating(p.playing.elo, opp, score, p.playing.games)
      p.playing.games++
      p.playing.history.push({ t: now, elo: p.playing.elo })
      p.playing.history = p.playing.history.slice(-500)
      award(15, 'Game played')
      if (g.training) {
        p.counters.trainingGames++
        award(25, 'Training session completed')
      }
      log('game', `${g.result === 'win' ? 'Won' : g.result === 'loss' ? 'Lost' : 'Drew'} vs bot (${g.botElo ? '~' + g.botElo : 'full strength'})`)
      touchDay()
      break
    }
    case 'gameReviewed': {
      const g = p.games.find((x) => x.id === e.gameId)
      if (g) {
        g.accuracy = e.accuracy
        g.mistakeTags = e.mistakeTags
        if (!g.reviewed) {
          g.reviewed = true
          p.counters.gamesReviewed++
          award(25, 'Game reviewed')
          log('review', 'Reviewed a game with a coach')
          touchDay()
        }
      }
      break
    }
    case 'coachPrefs':
      p.coach = { ...p.coach, ...e.prefs }
      break
    case 'coachQuestion':
      p.counters.coachQuestions++
      touchDay()
      break
  }

  const levelBefore = levelFromXp(p.xp).level
  // Achievements (may cascade XP but never re-trigger).
  const unlocked: string[] = []
  for (const a of ACHIEVEMENTS) {
    if (!p.achievements[a.id] && a.earned(p, now)) {
      p.achievements[a.id] = now
      unlocked.push(a.id)
      award(a.xp, `Achievement: ${a.name}`)
      log('achievement', `Unlocked "${a.name}"`)
    }
  }
  if (xp > 0) {
    p.xp += xp
    p.xpLog.push({ t: now, amount: xp, reason: reasons.join(', ') })
    p.xpLog = p.xpLog.slice(-MAX_LOG)
  }
  const levelAfter = levelFromXp(p.xp).level
  return { profile: p, xpGained: xp, unlocked, levelUp: levelAfter > levelBefore ? levelAfter : null, ratingDelta }
}

/** Strongest/weakest areas from puzzle themes (≥3 attempts) and recent game mistakes. */
export function strengthsAndWeaknesses(p: ProfileData): { strong: string[]; weak: string[] } {
  const themes = Object.entries(p.puzzles.themeStats)
    .filter(([t, s]) => s.attempts >= 3 && !['short', 'long', 'veryLong', 'oneMove', 'middlegame', 'opening', 'master', 'masterVsMaster', 'superGM', 'mate', 'crushing', 'advantage'].includes(t))
    .map(([t, s]) => ({ t, rate: s.solved / s.attempts }))
    .sort((a, b) => b.rate - a.rate)
  const strong = themes.filter((x) => x.rate >= 0.7).slice(0, 4).map((x) => x.t)
  const weakThemes = themes.filter((x) => x.rate < 0.55).reverse().slice(0, 3).map((x) => x.t)
  const tagTotals: Record<string, number> = {}
  for (const g of p.games.slice(0, 20)) for (const [k, n] of Object.entries(g.mistakeTags)) tagTotals[k] = (tagTotals[k] ?? 0) + n
  const weakTags = Object.entries(tagTotals).sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 2).slice(0, 3).map(([k]) => `game:${k}`)
  return { strong, weak: [...weakTags, ...weakThemes].slice(0, 5) }
}
