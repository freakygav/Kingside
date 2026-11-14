/** Elo helpers shared by the puzzle rating and the playing-strength estimate. */

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - rating) / 400))
}

/** Bigger steps while the rating is still provisional. */
export function kFactor(gamesPlayed: number): number {
  if (gamesPlayed < 10) return 40
  if (gamesPlayed < 30) return 28
  return 18
}

export function updateRating(rating: number, opponent: number, score: number, gamesPlayed: number): number {
  const s = Math.min(1, Math.max(0, score))
  const next = rating + kFactor(gamesPlayed) * (s - expectedScore(rating, opponent))
  return Math.max(100, Math.round(next))
}

export const DEFAULT_PUZZLE_RATING = 1000
export const DEFAULT_PLAYING_ELO = 800
/** Rating assigned to the unrestricted bot when estimating playing strength. */
export const FULL_STRENGTH_ELO = 3200
