/**
 * Coaches are teaching profiles, not separate engines. All of them read the same full-strength
 * Stockfish analysis; the tier only controls vocabulary, depth of explanation, how many candidate
 * moves and how long a variation is shown, and whether raw numbers are used.
 */
export interface Coach {
  id: string
  name: string
  title: string
  elo: string
  tier: 1 | 2 | 3 | 4 | 5 | 6
  difficulty: string
  style: string
  description: string
  focus: string[]
  /** Candidate moves listed when asked. */
  candidates: number
  /** Plies of engine continuation shown. */
  pvPlies: number
  accent: string
  initials: string
}

export const COACHES: Coach[] = [
  {
    id: 'beginner', name: 'Pip', title: 'Beginner Coach', elo: '400–800', tier: 1, difficulty: 'Beginner',
    style: 'Patient and plain-spoken', description: 'Explains what every piece is doing in simple words and helps you stop leaving pieces unprotected.',
    focus: ['Safe and unsafe pieces', 'Checks and captures', 'Basic rules'], candidates: 1, pvPlies: 0, accent: '#6fbf73', initials: 'Pi'
  },
  {
    id: 'developing', name: 'Rowan', title: 'Developing Coach', elo: '800–1200', tier: 2, difficulty: 'Novice',
    style: 'Encouraging, pattern-focused', description: 'Teaches common tactics and opening principles, and spots hanging pieces before they cost you.',
    focus: ['Hanging pieces', 'Opening principles', 'Simple tactics'], candidates: 2, pvPlies: 2, accent: '#5fa8d3', initials: 'Ro'
  },
  {
    id: 'intermediate', name: 'Ines', title: 'Intermediate Coach', elo: '1200–1600', tier: 3, difficulty: 'Intermediate',
    style: 'Structured and practical', description: 'Works through candidate moves, weak squares and pawn weaknesses, and how to make a plan.',
    focus: ['Candidate moves', 'Weak squares & pawns', 'Planning'], candidates: 3, pvPlies: 4, accent: '#e3b341', initials: 'In'
  },
  {
    id: 'advanced', name: 'Theo', title: 'Advanced Coach', elo: '1600–2000', tier: 4, difficulty: 'Advanced',
    style: 'Strategic and direct', description: 'Looks at long-term weaknesses, exchanges, sacrifices and multi-move tactical sequences.',
    focus: ['Strategic plans', 'Exchanges & sacrifices', 'Long-term weaknesses'], candidates: 3, pvPlies: 6, accent: '#e07b53', initials: 'Th'
  },
  {
    id: 'expert', name: 'Saskia', title: 'Expert Coach', elo: '2000–2400', tier: 5, difficulty: 'Expert',
    style: 'Concrete and engine-literate', description: 'Compares variations precisely, discusses evaluations and imbalances, and why the best move is objectively best.',
    focus: ['Engine evaluations', 'Imbalances', 'Concrete variations'], candidates: 4, pvPlies: 8, accent: '#b07cd8', initials: 'Sa'
  },
  {
    id: 'master', name: 'Aurelio', title: 'Master Coach', elo: '2400+', tier: 6, difficulty: 'Master',
    style: 'Exhaustive and nuanced', description: 'Deep variations, subtle positional factors, overloaded pieces and precise endgame decisions.',
    focus: ['Deep variations', 'Subtle positional factors', 'Endgame precision'], candidates: 5, pvPlies: 12, accent: '#d65c7a', initials: 'Au'
  }
]

export function getCoach(id: string): Coach {
  return COACHES.find((c) => c.id === id) ?? COACHES[0]
}
