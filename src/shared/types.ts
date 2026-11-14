import { DEFAULT_APPEARANCE, type Appearance, type AppearancePreset } from './appearance'

export type Color = 'w' | 'b'

/** Which engine process a request targets. Play and analysis never share settings. */
export type EngineRole = 'play' | 'analysis'

export interface EngineStatus {
  ok: boolean
  /** Absolute path of the engine executable in use, when one was found. */
  path?: string
  /** `id name` reported by the engine, e.g. "Stockfish 19". */
  name?: string
  /** Where the binary came from: settings, env, bundled, PATH or winget. */
  source?: EngineSource
  /** UCI_Elo range the engine advertises, if it supports UCI_LimitStrength. */
  eloMin?: number
  eloMax?: number
  /** Human-readable reason the engine is unavailable. */
  error?: string
  /** Every location that was tried, for the "engine missing" screen. */
  searched?: string[]
  /** True if the engine does not identify as Stockfish (still usable, with a warning). */
  notStockfish?: boolean
}

export type EngineSource = 'settings' | 'env' | 'bundled' | 'path' | 'winget'

export interface AnalysisLine {
  multipv: number
  depth: number
  /** Centipawns from the side to move's point of view. */
  cp?: number
  /** Moves to mate from the side to move's point of view (negative = getting mated). */
  mate?: number
  /** Principal variation in UCI notation. */
  pv: string[]
}

export interface SearchResult {
  bestmove: string | null
  lines: AnalysisLine[]
}

export interface PlayRequest {
  levelId: string
  fen: string
  /** Wall-clock search budget. The renderer derives this from the bot's clock. */
  movetimeMs: number
}

export interface AnalyzeRequest {
  fen: string
  multipv: number
  movetimeMs: number
}

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string }

export type BoardTheme = 'sage' | 'walnut' | 'harbor' | 'plum'

export interface Settings {
  /** User-selected engine executable; null means auto-detect. */
  enginePath: string | null
  /** Threads used by the analysis engine (the play engine always uses 1). */
  threads: number
  /** Hash (MB) for the analysis engine. */
  hashMb: number
  /** Search time per position during game review. */
  analysisMs: number
  sound: boolean
  showLegalMoves: boolean
  premoves: boolean
  theme: BoardTheme
  showCoordinates: boolean
  /** Board appearance: background, square colours, pieces (see shared/appearance.ts). */
  appearance: Appearance
  /** User-created appearance presets (built-in presets are not stored). */
  appearancePresets: AppearancePreset[]
}

export const DEFAULT_SETTINGS: Settings = {
  enginePath: null,
  threads: 2,
  hashMb: 128,
  analysisMs: 500,
  sound: true,
  showLegalMoves: true,
  premoves: true,
  theme: 'sage',
  showCoordinates: true,
  appearance: DEFAULT_APPEARANCE,
  appearancePresets: []
}

export interface AppInfo {
  version: string
  electron: string
  licenses: { title: string; text: string }[]
}
