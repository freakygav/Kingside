import { sanitizeAppearance, sanitizePresets } from './appearance'
import { DEFAULT_SETTINGS, type BoardTheme, type Settings } from './types'

const THEMES: BoardTheme[] = ['sage', 'walnut', 'harbor', 'plum']

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * Coerce untrusted (on-disk or IPC) settings into a valid Settings object.
 * Out-of-range values are clamped rather than rejected so a hand-edited file never bricks the app.
 */
export function sanitizeSettings(raw: unknown, cpuCount = 64): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS
  return {
    enginePath: typeof r.enginePath === 'string' && r.enginePath.trim() ? r.enginePath.trim() : null,
    threads: clampInt(r.threads, 1, Math.max(1, cpuCount), d.threads),
    hashMb: clampInt(r.hashMb, 16, 2048, d.hashMb),
    analysisMs: clampInt(r.analysisMs, 100, 5000, d.analysisMs),
    sound: typeof r.sound === 'boolean' ? r.sound : d.sound,
    showLegalMoves: typeof r.showLegalMoves === 'boolean' ? r.showLegalMoves : d.showLegalMoves,
    premoves: typeof r.premoves === 'boolean' ? r.premoves : d.premoves,
    theme: THEMES.includes(r.theme as BoardTheme) ? (r.theme as BoardTheme) : d.theme,
    showCoordinates: typeof r.showCoordinates === 'boolean' ? r.showCoordinates : d.showCoordinates,
    // Older settings files only had `theme`; its colours seed the new appearance.
    appearance: sanitizeAppearance(r.appearance, r.appearance ? undefined : r.theme),
    appearancePresets: sanitizePresets(r.appearancePresets)
  }
}
