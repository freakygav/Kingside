import { Chess } from 'chess.js'
import { hangingPieces, outposts, pawnStructure, pieces, pinsAgainst, weakSquares } from '../coach/features'
import { ADVANCED } from './advanced'
import { BEGINNER } from './beginner'
import { INTERMEDIATE } from './intermediate'
import type { Lesson, LessonLevel, LessonStep, SquareCheck } from './types'
import type { Color } from '../types'

export * from './types'

export const LESSONS: Lesson[] = [...BEGINNER, ...INTERMEDIATE, ...ADVANCED]

export const LEVEL_LABEL: Record<LessonLevel, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }

export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id)
}

export function lessonsByLevel(level: LessonLevel): Lesson[] {
  return LESSONS.filter((l) => l.level === level)
}

/** Lessons needed in the previous level before the next one unlocks (or the user skips ahead). */
export const UNLOCK_REQUIREMENT: Record<Exclude<LessonLevel, 'beginner'>, number> = { intermediate: 5, advanced: 6 }

export function isLevelUnlocked(level: LessonLevel, completedIds: Set<string>, overrides: { intermediate: boolean; advanced: boolean }): boolean {
  if (level === 'beginner') return true
  if (overrides[level]) return true
  const prev: LessonLevel = level === 'intermediate' ? 'beginner' : 'intermediate'
  const done = lessonsByLevel(prev).filter((l) => completedIds.has(l.id)).length
  return done >= UNLOCK_REQUIREMENT[level]
}

/** The squares that answer a "click the square" exercise, computed by the position analyser. */
export function squareAnswer(fen: string, check: { kind: SquareCheck; color: Color }): string[] {
  const c = new Chess(fen)
  const ps = pawnStructure(c, check.color)
  switch (check.kind) {
    case 'outposts': return outposts(c, check.color)
    case 'weak': return weakSquares(c, check.color)
    case 'isolated': return ps.isolated
    case 'passed': return ps.passed
    case 'backward': return ps.backward
    case 'doubled': return pieces(c, check.color).filter((p) => p.type === 'p' && ps.doubledFiles.includes(p.square[0])).map((p) => p.square)
    case 'hanging': return hangingPieces(c, check.color).map((h) => h.square)
    case 'pinned': return pinsAgainst(c, check.color).map((p) => p.pinned.square)
  }
}

export function gradedSteps(l: Lesson): number[] {
  return l.steps.map((s, i) => (s.kind === 'exercise' || s.kind === 'squares' || s.kind === 'quiz' ? i : -1)).filter((i) => i >= 0)
}

export type { LessonStep }
