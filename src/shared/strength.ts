import type { AnalysisLine } from './types'

/**
 * Bot strength levels.
 *
 * - "limit" levels use Stockfish's own UCI_LimitStrength + UCI_Elo. Stockfish calibrates UCI_Elo
 *   against engine rating lists (CCRL-style anchors) at a fixed time control, so the number is an
 *   engine-pool estimate, not a FIDE / online-site human rating.
 * - "custom" levels sit below Stockfish's minimum UCI_Elo (1320 in Stockfish 16-19). Kingside
 *   weakens the engine itself: a shallow search, several candidate lines, and a weighted random
 *   pick that favours better moves. Their Elo labels are rough guesses, not measurements.
 * - "full" is unrestricted Stockfish.
 */
export type LevelMode = 'custom' | 'limit' | 'full'

export interface Level {
  id: string
  /** Approximate strength shown to the player. null for full strength. */
  elo: number | null
  name: string
  blurb: string
  mode: LevelMode
  /** custom only: depth limit, candidate count and softmax temperature (centipawns). */
  depth?: number
  multipv?: number
  temperatureCp?: number
  /** custom only: chance to pick uniformly among candidates (simulates oversights). */
  wildChance?: number
}

export const LEVELS: Level[] = [
  { id: 'e400', elo: 400, name: 'Pebble', blurb: 'Just learning how the pieces move.', mode: 'custom', depth: 1, multipv: 10, temperatureCp: 260, wildChance: 0.25 },
  { id: 'e700', elo: 700, name: 'Sprout', blurb: 'Knows the basics, hangs pieces often.', mode: 'custom', depth: 2, multipv: 7, temperatureCp: 170, wildChance: 0.12 },
  { id: 'e1000', elo: 1000, name: 'Rook-ie', blurb: 'Sees simple tactics, misses deeper ones.', mode: 'custom', depth: 4, multipv: 5, temperatureCp: 90, wildChance: 0.05 },
  { id: 'e1320', elo: 1320, name: 'Club', blurb: "Stockfish's lowest built-in limit.", mode: 'limit' },
  { id: 'e1500', elo: 1500, name: 'Contender', blurb: 'Solid fundamentals.', mode: 'limit' },
  { id: 'e1800', elo: 1800, name: 'Tactician', blurb: 'Punishes loose pieces.', mode: 'limit' },
  { id: 'e2000', elo: 2000, name: 'Expert', blurb: 'Strong club player.', mode: 'limit' },
  { id: 'e2200', elo: 2200, name: 'Candidate', blurb: 'Master-level estimate.', mode: 'limit' },
  { id: 'e2500', elo: 2500, name: 'Grandmaster', blurb: 'Very few mistakes.', mode: 'limit' },
  { id: 'e2800', elo: 2800, name: 'Elite', blurb: 'Near the top of the limited range.', mode: 'limit' },
  { id: 'full', elo: null, name: 'Unleashed', blurb: 'Stockfish at full strength. Good luck.', mode: 'full' }
]

export const DEFAULT_LEVEL_ID = 'e1000'

export function getLevel(id: string): Level {
  const level = LEVELS.find((l) => l.id === id)
  if (!level) throw new Error(`Unknown difficulty level "${id}"`)
  return level
}

export function levelLabel(level: Level): string {
  return level.elo === null ? 'Full strength' : `~${level.elo}`
}

export interface EngineConfig {
  /** UCI setoption name/value pairs, applied in order. */
  options: [string, string][]
  /** Extra `go` limits beyond movetime. */
  depth?: number
  multipv: number
  /** Non-fatal notes (e.g. the Elo was clamped to the engine's range). */
  warnings: string[]
}

/**
 * Translate a level into UCI options. Throws for impossible configurations (e.g. an Elo level on
 * an engine without UCI_LimitStrength) so the caller can show a clear error instead of silently
 * playing at full strength.
 */
export function engineConfigFor(level: Level, eloRange?: { min: number; max: number }): EngineConfig {
  const warnings: string[] = []
  switch (level.mode) {
    case 'full':
      return {
        options: [['UCI_LimitStrength', 'false'], ['Skill Level', '20'], ['MultiPV', '1']],
        multipv: 1,
        warnings
      }
    case 'limit': {
      if (!eloRange) throw new Error('This engine does not support UCI_LimitStrength/UCI_Elo, so Elo-limited levels are unavailable.')
      if (level.elo === null) throw new Error(`Level ${level.id} has no Elo`)
      if (eloRange.min > eloRange.max) throw new Error('Engine reported an invalid UCI_Elo range')
      let elo = level.elo
      if (elo < eloRange.min || elo > eloRange.max) {
        const clamped = Math.min(eloRange.max, Math.max(eloRange.min, elo))
        warnings.push(`Engine supports UCI_Elo ${eloRange.min}-${eloRange.max}; using ${clamped} instead of ${elo}.`)
        elo = clamped
      }
      return {
        options: [['MultiPV', '1'], ['Skill Level', '20'], ['UCI_LimitStrength', 'true'], ['UCI_Elo', String(elo)]],
        multipv: 1,
        warnings
      }
    }
    case 'custom': {
      const depth = level.depth ?? 1
      const multipv = level.multipv ?? 4
      if (depth < 1 || multipv < 1) throw new Error(`Level ${level.id} has invalid depth/multipv`)
      return {
        options: [['UCI_LimitStrength', 'false'], ['Skill Level', '20'], ['MultiPV', String(multipv)]],
        depth,
        multipv,
        warnings
      }
    }
  }
}

/** Convert a line's score to centipawns (side to move POV), mapping mates to large values. */
export function lineCp(line: Pick<AnalysisLine, 'cp' | 'mate'>): number {
  if (line.mate !== undefined) {
    if (line.mate === 0) return -100_000
    return line.mate > 0 ? 100_000 - line.mate * 100 : -100_000 - line.mate * 100
  }
  return line.cp ?? 0
}

/**
 * Pick a move for a "custom" level from MultiPV candidates: softmax over centipawn loss, plus an
 * occasional uniform "oversight" among the candidates (which is how low levels hang pieces).
 */
export function pickWeakMove(lines: AnalysisLine[], level: Level, rand: () => number = Math.random): string | null {
  const candidates = lines.filter((l) => l.pv.length > 0).sort((a, b) => a.multipv - b.multipv)
  if (candidates.length === 0) return null
  if (level.mode !== 'custom' || candidates.length === 1) return candidates[0].pv[0]
  if (rand() < (level.wildChance ?? 0)) {
    return candidates[Math.floor(rand() * candidates.length) % candidates.length].pv[0]
  }
  const t = Math.max(1, level.temperatureCp ?? 100)
  const best = lineCp(candidates[0])
  // Clamp losses so mate scores don't underflow every weight to zero.
  const weights = candidates.map((c) => Math.exp(-Math.min(2000, Math.max(0, best - lineCp(c))) / t))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rand() * total
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]
    if (r <= 0) return candidates[i].pv[0]
  }
  return candidates[0].pv[0]
}
