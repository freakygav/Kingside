import { Chess } from 'chess.js'
import type { AnalysisLine } from '@shared/types'

/**
 * Renderer-side cache of engine analysis keyed by FEN, shared by coaches, puzzles and the
 * training mode. Requests are queued in the main process, so callers simply await.
 */
const cache = new Map<string, { lines: AnalysisLine[]; multipv: number; ms: number }>()

export async function analyzeFen(fen: string, multipv = 3, ms = 700): Promise<AnalysisLine[]> {
  const hit = cache.get(fen)
  if (hit && hit.multipv >= multipv && hit.ms >= ms) return hit.lines
  const c = new Chess(fen)
  if (c.isGameOver()) return []
  const res = await window.kingside.analyze({ fen, multipv, movetimeMs: ms })
  if (!res.ok) throw new Error(res.error)
  cache.set(fen, { lines: res.value.lines, multipv, ms })
  if (cache.size > 400) cache.delete(cache.keys().next().value!)
  return res.value.lines
}

export function cachedLines(fen: string): AnalysisLine[] | null {
  return cache.get(fen)?.lines ?? null
}
