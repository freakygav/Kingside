/**
 * Piece sets bundled with the app (see shared/appearance.ts PIECE_SETS for names and licenses).
 * Every set has all 12 pieces; tests/appearance.test.ts checks that.
 */
const files = import.meta.glob('./assets/pieces/*/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const SETS: Record<string, Record<string, string>> = {}
for (const [path, url] of Object.entries(files)) {
  const m = /pieces\/([^/]+)\/([wb][KQRBNP])\.svg$/.exec(path)
  if (!m) continue
  ;(SETS[m[1]] ??= {})[m[2]] = url
}

let active = 'cburnett'

/** Switch the piece set used by every board (and captured-piece icons) app-wide. */
export function setActivePieceSet(id: string): void {
  if (SETS[id]) active = id
}

export function activePieceSet(): string {
  return active
}

export function pieceUrl(code: string, set?: string): string {
  return SETS[set ?? active]?.[code] ?? SETS.cburnett[code]
}

export function availablePieceSets(): string[] {
  return Object.keys(SETS)
}

/** Legacy map-style access (always the active set). */
export const PIECE_URL: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, code) => pieceUrl(String(code))
})

export type PieceCode = string
