import type { Color } from '../types'

export type LessonLevel = 'beginner' | 'intermediate' | 'advanced'

/** Arrow/highlight annotations: "e2e4" arrows, "d4" squares. */
export interface BoardMarks {
  arrows?: string[]
  squares?: string[]
  orientation?: Color
}

export interface ConceptStep extends BoardMarks {
  kind: 'concept'
  title: string
  body: string[]
  fen: string
}

export interface DemoStep extends BoardMarks {
  kind: 'demo'
  title: string
  intro: string
  fen: string
  /** SAN moves played one by one, each with a note. */
  moves: { san: string; note: string }[]
}

/**
 * How an exercise solution was verified (tests/lessons.test.ts):
 *  best    - every user move is Stockfish's choice (or within 0.5 pawns / same forced mate)
 *  sound   - within 0.8 pawns of the best move (used for gambits and positional moves)
 *  winning - the move keeps a winning evaluation (endgame technique where several moves win)
 *  legal   - a rules exercise (castling, en passant...) - only legality is claimed
 */
export type Verify = 'best' | 'sound' | 'winning' | 'legal'

export interface MoveExercise extends BoardMarks {
  kind: 'exercise'
  title: string
  prompt: string
  fen: string
  /** SAN line: user move, opponent reply, user move... (opponent replies are auto-played). */
  solution: string[]
  /** Other user moves accepted at a given ply index (only for the final user move). */
  alt?: Record<number, string[]>
  /** Any checkmating move is accepted at the final ply. */
  goal?: 'mate'
  verify: Verify
  /** Explanations for specific wrong moves (SAN). */
  wrong?: Record<string, string>
  hint: string
  success: string
}

export type SquareCheck = 'outposts' | 'weak' | 'isolated' | 'passed' | 'backward' | 'hanging' | 'pinned' | 'doubled'

export interface SquareExercise extends BoardMarks {
  kind: 'squares'
  title: string
  prompt: string
  fen: string
  /** All squares that count as correct. Verified against the analyser in tests. */
  answer: string[]
  /** Which analyser function proves the answer, and for which side. */
  check: { kind: SquareCheck; color: Color }
  hint: string
  success: string
}

export interface QuizStep {
  kind: 'quiz'
  question: string
  options: string[]
  answer: number
  explanation: string
  fen?: string
  orientation?: Color
}

export type LessonStep = ConceptStep | DemoStep | MoveExercise | SquareExercise | QuizStep

export interface Lesson {
  id: string
  level: LessonLevel
  title: string
  summary: string
  /** Lesson ids recommended before this one (display only). */
  icon: string
  steps: LessonStep[]
}

export const isGraded = (s: LessonStep) => s.kind === 'exercise' || s.kind === 'squares' || s.kind === 'quiz'
