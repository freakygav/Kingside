import type {
  AnalyzeRequest,
  AppInfo,
  EngineRole,
  EngineStatus,
  IpcResult,
  PlayRequest,
  SearchResult,
  Settings
} from '../shared/types'
import type { EventOutcome, ProfileData, ProfileEvent } from '../shared/progress'
import type { ChesscomGame, GameMeta, LichessGame, StoredGame } from '../shared/library'
import type { PositionAnalysis } from '../shared/review'

export interface KingsideApi {
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<IpcResult<Settings>>
  engineStatus(): Promise<EngineStatus>
  detectEngine(): Promise<EngineStatus>
  /** Opens a file picker; resolves to null if cancelled. */
  chooseEngine(): Promise<IpcResult<EngineStatus | null>>
  clearEnginePath(): Promise<IpcResult<EngineStatus>>
  newGame(): Promise<IpcResult<void>>
  play(req: PlayRequest): Promise<IpcResult<SearchResult & { warnings: string[] }>>
  analyze(req: AnalyzeRequest): Promise<IpcResult<SearchResult>>
  stop(role: EngineRole): Promise<void>
  appInfo(): Promise<AppInfo>
  openExternal(url: string): Promise<void>
  getProfile(): Promise<ProfileData>
  profileEvent(e: ProfileEvent): Promise<IpcResult<EventOutcome>>
  resetProfile(): Promise<IpcResult<ProfileData>>
  /** Opens a file picker; validated bytes of the chosen image, or null if cancelled. */
  pickBackgroundImage(): Promise<IpcResult<{ name: string; bytes: Uint8Array; type: 'png' | 'jpg' | 'webp' } | null>>
  saveBackgroundImage(bytes: Uint8Array): Promise<IpcResult<string>>
  listBackgroundImages(): Promise<IpcResult<{ file: string; bytes: number; added: number }[]>>
  deleteBackgroundImage(file: string): Promise<IpcResult<void>>
  chesscomProfile(username: string): Promise<IpcResult<{ username: string; name: string | null; url: string | null; joined: number | null; status: string | null }>>
  chesscomArchives(username: string): Promise<IpcResult<{ year: number; month: number }[]>>
  chesscomMonth(username: string, year: number, month: number): Promise<IpcResult<ChesscomGame[]>>
  lichessUser(username: string): Promise<IpcResult<{ username: string; disabled: boolean; games: number | null; url: string }>>
  lichessGames(username: string, q: { since?: number; until?: number; perfType?: string[]; max?: number }): Promise<IpcResult<LichessGame[]>>
  libraryList(): Promise<{ games: GameMeta[]; myNames: string[] }>
  libraryGet(id: string): Promise<IpcResult<StoredGame | null>>
  libraryAdd(games: StoredGame[]): Promise<IpcResult<{ added: string[]; duplicates: string[] }>>
  libraryDelete(ids: string[]): Promise<IpcResult<number>>
  librarySaveAnalysis(id: string, positions: PositionAnalysis[], bookPlies: number, summary: NonNullable<GameMeta['analysis']>): Promise<IpcResult<GameMeta>>
  librarySetNames(names: string[]): Promise<IpcResult<string[]>>
  libraryOpenPgn(): Promise<IpcResult<{ name: string; text: string } | null>>
  libraryExport(ids: string[]): Promise<IpcResult<string | null>>
}
