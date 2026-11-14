import { positionProblem } from '@shared/position'
import { engineConfigFor, getLevel } from '@shared/strength'
import type { AnalyzeRequest, EngineRole, EngineStatus, PlayRequest, SearchResult, Settings } from '@shared/types'
import { engineCandidates } from './locate'
import { UciEngine } from './uci'

const FEN_RE = /^([pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d+ \d+$/

function validateFen(fen: string): void {
  if (typeof fen !== 'string' || !FEN_RE.test(fen.trim())) throw new Error('Invalid position sent to engine')
  // Stockfish exits on impossible positions (e.g. side not to move in check), so reject them here.
  const problem = positionProblem(fen)
  if (problem) throw new Error(problem)
}

function clampMs(ms: number, min: number, max: number): number {
  if (!Number.isFinite(ms)) throw new Error('Invalid search time')
  return Math.round(Math.min(max, Math.max(min, ms)))
}

/**
 * Owns the engine processes. "play" runs the bot (1 thread, small hash, strength-limited);
 * "analysis" runs game review at full strength with the user's thread/hash settings.
 * A crashed engine is restarted transparently on the next request.
 */
export class EngineManager {
  private engines: Partial<Record<EngineRole, UciEngine>> = {}
  private starting: Partial<Record<EngineRole, Promise<UciEngine>>> = {}
  private resolvedPath: string | null = null
  private status: EngineStatus = { ok: false, error: 'Engine not checked yet' }
  private configuredLevel: string | null = null

  constructor(private getSettings: () => Settings, private bundledDir: string) {}

  getStatus(): EngineStatus {
    return this.status
  }

  /** Find a working engine. Tries each candidate with a real UCI handshake. */
  async detect(): Promise<EngineStatus> {
    this.shutdown()
    const candidates = engineCandidates({ settingsPath: this.getSettings().enginePath, bundledDir: this.bundledDir })
    const searched = candidates.map((c) => `${c.path} (${c.source})`)
    const errors: string[] = []
    for (const c of candidates) {
      try {
        const eng = await UciEngine.start(c.path)
        const elo = eng.options.get('UCI_Elo')
        const hasLimit = eng.hasOption('UCI_LimitStrength') && elo?.min !== undefined && elo?.max !== undefined
        this.resolvedPath = c.path
        this.status = {
          ok: true,
          path: c.path,
          name: eng.name,
          source: c.source,
          eloMin: hasLimit ? elo!.min : undefined,
          eloMax: hasLimit ? elo!.max : undefined,
          searched,
          notStockfish: !/stockfish/i.test(eng.name)
        }
        this.adopt('play', eng)
        return this.status
      } catch (e) {
        errors.push(`${c.path}: ${(e as Error).message}`)
        if (c.source === 'settings') {
          // A bad user-chosen path should be reported, not silently replaced by another engine.
          this.status = { ok: false, error: `The engine you selected could not be started. ${(e as Error).message}`, searched }
          return this.status
        }
      }
    }
    this.resolvedPath = null
    this.status = {
      ok: false,
      error: candidates.length
        ? `No working engine found. ${errors.join(' | ')}`
        : 'Stockfish was not found. Choose a Stockfish executable, or install it (see the instructions below).',
      searched
    }
    return this.status
  }

  /** Validate an arbitrary path without changing the active engine. */
  async probe(path: string): Promise<{ name: string }> {
    const eng = await UciEngine.start(path)
    const name = eng.name
    eng.quit()
    return { name }
  }

  private adopt(role: EngineRole, eng: UciEngine): void {
    this.engines[role] = eng
    if (role === 'play') this.configuredLevel = null
    eng.on('exit', () => {
      if (this.engines[role] === eng) {
        delete this.engines[role]
        if (role === 'play') this.configuredLevel = null
      }
    })
  }

  private async get(role: EngineRole): Promise<UciEngine> {
    const existing = this.engines[role]
    if (existing?.isAlive) return existing
    if (!this.resolvedPath) {
      const st = await this.detect()
      if (!st.ok) throw new Error(st.error ?? 'Engine unavailable')
      if (role === 'play' && this.engines.play) return this.engines.play
    }
    if (!this.starting[role]) {
      this.starting[role] = (async () => {
        const eng = await UciEngine.start(this.resolvedPath!)
        if (role === 'analysis') {
          const s = this.getSettings()
          if (eng.hasOption('Threads')) eng.setOption('Threads', String(s.threads))
          if (eng.hasOption('Hash')) eng.setOption('Hash', String(s.hashMb))
          await eng.isReady(30_000)
        }
        this.adopt(role, eng)
        return eng
      })().finally(() => {
        delete this.starting[role]
      })
    }
    return this.starting[role]!
  }

  async newGame(): Promise<void> {
    const eng = await this.get('play')
    eng.newGame()
    await eng.isReady()
  }

  async play(req: PlayRequest): Promise<SearchResult & { warnings: string[] }> {
    validateFen(req.fen)
    const level = getLevel(req.levelId)
    const movetime = clampMs(req.movetimeMs, 20, 15_000)
    const eng = await this.get('play')
    const range = this.status.eloMin !== undefined && this.status.eloMax !== undefined
      ? { min: this.status.eloMin, max: this.status.eloMax }
      : undefined
    const cfg = engineConfigFor(level, range)
    if (this.configuredLevel !== level.id) {
      if (eng.hasOption('Threads')) eng.setOption('Threads', '1')
      if (eng.hasOption('Hash')) eng.setOption('Hash', '16')
      for (const [name, value] of cfg.options) {
        if (name === 'Skill Level' && !eng.hasOption(name)) continue
        eng.setOption(name, value)
      }
      await eng.isReady()
      this.configuredLevel = level.id
    }
    const go = cfg.depth ? `depth ${cfg.depth} movetime ${movetime}` : `movetime ${movetime}`
    const res = await eng.search(req.fen, go, movetime + 10_000)
    return { ...res, warnings: cfg.warnings }
  }

  /**
   * Analysis requests (review, coach, puzzle feedback, training mode) share one engine. They are
   * queued rather than allowed to pre-empt each other, so every caller gets a complete result.
   */
  analyze(req: AnalyzeRequest): Promise<SearchResult> {
    let movetime: number
    try {
      validateFen(req.fen)
      movetime = clampMs(req.movetimeMs, 50, 30_000)
    } catch (e) {
      return Promise.reject(e)
    }
    const multipv = Math.round(Math.min(5, Math.max(1, req.multipv)))
    const run = async () => {
      const eng = await this.get('analysis')
      eng.setOption('MultiPV', String(multipv))
      return eng.search(req.fen, `movetime ${movetime}`, movetime + 15_000)
    }
    const result = this.analysisQueue.then(run, run)
    this.analysisQueue = result.catch(() => undefined)
    return result
  }
  private analysisQueue: Promise<unknown> = Promise.resolve()

  stop(role: EngineRole): void {
    const eng = this.engines[role]
    if (eng?.isAlive) eng.stop()
  }

  /** Apply new analysis settings by restarting the analysis engine lazily. */
  resetAnalysis(): void {
    this.engines.analysis?.quit()
    delete this.engines.analysis
  }

  shutdown(): void {
    for (const role of ['play', 'analysis'] as EngineRole[]) {
      this.engines[role]?.quit()
      delete this.engines[role]
    }
    this.configuredLevel = null
  }
}
