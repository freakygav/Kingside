import { Chess, type Square } from 'chess.js'
import { planBotTime, remainingDelay } from '@shared/botTiming'
import { canCheckmate, parseUci, uciOf } from '@shared/chessUtil'
import { ChessClock, type ClockSnapshot } from '@shared/clock'
import { tryPremove, type Premove } from '@shared/premove'
import { getLevel, lineCp, pickWeakMove, type Level } from '@shared/strength'
import type { Color } from '@shared/types'
import { sounds } from './sound'

export const INITIAL_MS = 10 * 60 * 1000
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const SAVE_KEY = 'kingside.activeGame.v1'

export type GameStatus = 'idle' | 'playing' | 'over'
export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient'
  | 'threefold'
  | 'fifty'
  | 'timeout'
  | 'timeout-draw'
  | 'resign'
  | 'agreement'
  | 'abort'
  /** A result taken from an imported game record. */
  | 'imported'

export interface GameResult {
  winner: Color | null
  reason: EndReason
}

export interface MoveRecord {
  san: string
  uci: string
  from: Square
  to: Square
  color: Color
  captured: boolean
  castle: boolean
  check: boolean
  /** Mover's remaining time right after the move. */
  clockAfter: number
}

export interface GameRecord {
  id: string
  levelId: string
  playerColor: Color
  startFen: string
  moves: MoveRecord[]
  fens: string[]
  result: GameResult | null
  date: string
}

interface SavedGame {
  id?: string
  levelId: string
  playerColor: Color
  startFen: string
  uci: string[]
  clock: ClockSnapshot
  clocksAfter: number[]
  savedAt: number
}

const now = () => performance.now()
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `g-${Date.now()}-${Math.random().toString(36).slice(2)}`)
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * What the board allows right now. History browsing is always read-only: moves and premoves are
 * only possible while the live position is shown.
 */
export function interactionMode(s: {
  status: GameStatus
  viewingLive: boolean
  engineError: boolean
  playersTurn: boolean
  premovesEnabled: boolean
}): 'move' | 'premove' | null {
  if (s.status !== 'playing' || !s.viewingLive || s.engineError) return null
  if (s.playersTurn) return 'move'
  return s.premovesEnabled ? 'premove' : null
}

export function resultText(r: GameResult, playerColor: Color): { title: string; detail: string } {
  const reasonText: Record<EndReason, string> = {
    checkmate: 'by checkmate',
    stalemate: 'by stalemate',
    insufficient: 'by insufficient material',
    threefold: 'by threefold repetition',
    fifty: 'by the 50-move rule',
    timeout: 'on time',
    'timeout-draw': 'timeout vs insufficient material',
    resign: 'by resignation',
    agreement: 'by agreement',
    abort: 'Game aborted',
    imported: 'as recorded'
  }
  if (r.reason === 'abort') return { title: 'Game aborted', detail: 'No result recorded' }
  if (r.winner === null) return { title: 'Draw', detail: reasonText[r.reason] }
  return { title: r.winner === playerColor ? 'You won!' : 'You lost', detail: `${r.winner === 'w' ? 'White' : 'Black'} won ${reasonText[r.reason]}` }
}

/**
 * Live game against the bot. Framework-free; React subscribes via subscribe()/getVersion().
 * Invariants:
 *  - Moves are only ever applied to `chess` (the live position). History browsing lives in the UI.
 *  - A move is rejected if the mover's flag has already fallen.
 *  - Every async bot step re-checks `token` so a finished/restarted game ignores stale engine replies.
 */
export class GameSession {
  chess = new Chess()
  startFen = START_FEN
  moves: MoveRecord[] = []
  fens: string[] = [START_FEN]
  clock = new ChessClock(INITIAL_MS)
  status: GameStatus = 'idle'
  result: GameResult | null = null
  playerColor: Color = 'w'
  level: Level = getLevel('e1000')
  premove: Premove | null = null
  botThinking = false
  /** Set when the engine failed repeatedly; clocks are paused until retry/abort. */
  engineError: string | null = null
  notice: string | null = null
  lastBotScoreCp: number | null = null
  /** Stable id used for game history and reviews. */
  gameId = newId()
  private token = 0
  private version = 0
  private listeners = new Set<() => void>()
  private lowTimeWarned = false
  private noticeTimer: ReturnType<typeof setTimeout> | null = null

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getVersion = (): number => this.version

  private emit(): void {
    this.version++
    for (const l of [...this.listeners]) l()
  }

  get botColor(): Color {
    return this.playerColor === 'w' ? 'b' : 'w'
  }

  get isPlayersTurn(): boolean {
    return this.status === 'playing' && this.chess.turn() === this.playerColor
  }

  flash(msg: string, ms = 3500): void {
    this.notice = msg
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    this.noticeTimer = setTimeout(() => {
      this.notice = null
      this.emit()
    }, ms)
    this.emit()
  }

  start(levelId: string, color: Color | 'random'): void {
    this.token++
    this.level = getLevel(levelId)
    this.gameId = newId()
    this.playerColor = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color
    this.chess = new Chess()
    this.startFen = this.chess.fen()
    this.moves = []
    this.fens = [this.startFen]
    this.clock = new ChessClock(INITIAL_MS)
    this.result = null
    this.premove = null
    this.engineError = null
    this.lastBotScoreCp = null
    this.lowTimeWarned = false
    this.status = 'playing'
    this.clock.start('w', now())
    void window.kingside.newGame()
    sounds.start()
    this.save()
    this.emit()
    if (this.chess.turn() === this.botColor) void this.botTurn()
  }

  /** Leave the finished-game state and show the new-game panel (the last position stays visible). */
  toIdle(): void {
    if (this.status === 'playing') return
    this.status = 'idle'
    this.emit()
  }

  /** Called ~10x/second by the UI while a game is running. Detects flag fall. */
  tick(): void {
    if (this.status !== 'playing') return
    const t = now()
    const flagged = this.clock.flagged(t)
    if (flagged) {
      this.handleFlag(flagged)
      return
    }
    const mine = this.clock.timeLeft(this.playerColor, t)
    if (!this.lowTimeWarned && mine < 30_000 && this.clock.runningColor === this.playerColor) {
      this.lowTimeWarned = true
      sounds.lowTime()
    }
  }

  private handleFlag(color: Color): void {
    const opponent: Color = color === 'w' ? 'b' : 'w'
    if (!canCheckmate(this.chess, opponent)) this.end({ winner: null, reason: 'timeout-draw' })
    else this.end({ winner: opponent, reason: 'timeout' })
  }

  /** Player move from the live position. Returns false if rejected. */
  playerMove(from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n'): boolean {
    if (!this.isPlayersTurn || this.engineError) return false
    const ok = this.applyMove({ from, to, promotion }, this.playerColor)
    if (ok && this.status === 'playing') void this.botTurn()
    return ok
  }

  setPremove(pm: Premove): void {
    if (this.status !== 'playing' || this.isPlayersTurn) return
    this.premove = pm
    sounds.premove()
    this.emit()
  }

  cancelPremove(): void {
    if (!this.premove) return
    this.premove = null
    this.emit()
  }

  resign(): void {
    if (this.status !== 'playing') return
    this.end({ winner: this.botColor, reason: 'resign' })
  }

  /** Abort is only allowed before each side has moved, like most online servers. */
  get canAbort(): boolean {
    return this.status === 'playing' && this.moves.filter((m) => m.color === this.playerColor).length === 0
  }

  abort(): void {
    if (!this.canAbort && !this.engineError) return
    this.end({ winner: null, reason: 'abort' })
  }

  /**
   * The bot accepts a draw when its last evaluation is not better for it than +0.25 and at least 20
   * moves have been played. Otherwise it declines.
   */
  offerDraw(): void {
    if (this.status !== 'playing') return
    const enough = this.moves.length >= 40
    const notBetter = this.lastBotScoreCp !== null && this.lastBotScoreCp <= 25
    if (enough && notBetter) this.end({ winner: null, reason: 'agreement' })
    else this.flash(enough ? 'The bot declined your draw offer.' : 'The bot declines draws before move 20.')
  }

  /** Retry after an engine failure: resumes the paused clocks. */
  retryEngine(): void {
    if (this.status !== 'playing' || !this.engineError) return
    this.engineError = null
    this.clock.start(this.chess.turn(), now())
    this.emit()
    if (this.chess.turn() === this.botColor) void this.botTurn()
  }

  private applyMove(mv: { from: Square; to: Square; promotion?: string }, by: Color): boolean {
    if (this.status !== 'playing' || this.chess.turn() !== by) return false
    const t = now()
    const flagged = this.clock.flagged(t)
    if (flagged) {
      this.handleFlag(flagged)
      return false
    }
    let m
    try {
      m = this.chess.move(mv)
    } catch {
      sounds.illegal()
      return false
    }
    this.clock.press(by, t)
    this.moves.push({
      san: m.san,
      uci: uciOf(m),
      from: m.from,
      to: m.to,
      color: by,
      captured: !!m.captured,
      castle: m.isKingsideCastle() || m.isQueensideCastle(),
      check: this.chess.inCheck(),
      clockAfter: this.clock.timeLeft(by, t)
    })
    this.fens.push(this.chess.fen())

    const over = this.detectGameOver()
    if (over) {
      this.save()
      this.end(over)
      return true
    }
    if (this.chess.inCheck()) sounds.check()
    else if (m.captured) sounds.capture()
    else if (m.isKingsideCastle() || m.isQueensideCastle()) sounds.castle()
    else sounds.move()
    this.save()
    this.emit()
    return true
  }

  private detectGameOver(): GameResult | null {
    const c = this.chess
    if (c.isCheckmate()) return { winner: c.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' }
    if (c.isStalemate()) return { winner: null, reason: 'stalemate' }
    if (c.isInsufficientMaterial()) return { winner: null, reason: 'insufficient' }
    if (c.isThreefoldRepetition()) return { winner: null, reason: 'threefold' }
    if (c.isDrawByFiftyMoves()) return { winner: null, reason: 'fifty' }
    return null
  }

  private end(result: GameResult): void {
    if (this.status !== 'playing') return
    this.token++
    this.clock.stop(now())
    this.status = 'over'
    this.result = result
    this.premove = null
    this.botThinking = false
    void window.kingside.stop('play')
    clearSaved()
    sounds.end()
    this.emit()
  }

  private async botTurn(): Promise<void> {
    if (this.status !== 'playing' || this.chess.turn() !== this.botColor) return
    const token = ++this.token
    this.botThinking = true
    this.emit()

    const started = now()
    const last = this.moves[this.moves.length - 1]
    const legal = this.chess.moves({ verbose: true })
    const plan = planBotTime({
      remainingMs: this.clock.timeLeft(this.botColor, started),
      ply: this.moves.length,
      legalMoves: legal.length,
      recapture: !!last?.captured && legal.some((m) => m.to === last.to && m.captured),
      inCheck: this.chess.inCheck()
    })
    const fen = this.chess.fen()

    let uci: string | null = null
    let lastError = ''
    for (let attempt = 0; attempt < 2 && !uci; attempt++) {
      const res = await window.kingside.play({ levelId: this.level.id, fen, movetimeMs: plan.searchMs })
      if (token !== this.token || this.status !== 'playing') return
      if (!res.ok) {
        lastError = res.error
        continue
      }
      for (const w of res.value.warnings) this.flash(w, 6000)
      const lines = res.value.lines
      const pick = this.level.mode === 'custom' ? pickWeakMove(lines, this.level) : null
      const candidate = pick ?? res.value.bestmove ?? lines[0]?.pv[0] ?? null
      const parsed = candidate ? parseUci(candidate) : null
      if (parsed && legal.some((m) => m.from === parsed.from && m.to === parsed.to)) {
        uci = candidate
        const line = lines.find((l) => l.pv[0] === candidate) ?? lines[0]
        if (line) this.lastBotScoreCp = lineCp(line)
      } else {
        lastError = `Engine returned an unusable move (${candidate ?? 'none'})`
      }
    }

    if (!uci) {
      // Pause both clocks: a broken engine must not lose (or win) the game on time.
      this.clock.stop(now())
      this.botThinking = false
      this.engineError = lastError || 'The engine did not return a move.'
      this.emit()
      return
    }

    const wait = remainingDelay(plan, now() - started, this.clock.timeLeft(this.botColor, now()))
    if (wait > 0) await sleep(wait)
    if (token !== this.token || this.status !== 'playing') return

    this.botThinking = false
    const parsed = parseUci(uci)!
    if (!this.applyMove(parsed, this.botColor)) {
      this.emit()
      return
    }
    if (this.status === 'playing' && this.premove) {
      const pm = this.premove
      this.premove = null
      const t = now()
      if (this.clock.flagged(t)) {
        this.tick()
        return
      }
      const probe = new Chess(this.chess.fen())
      if (tryPremove(probe, pm, this.playerColor)) {
        this.playerMove(pm.from, pm.to, pm.promotion)
      } else {
        this.emit()
      }
    }
  }

  // ---- persistence (interrupted games) ----

  private save(): void {
    if (this.status !== 'playing') return
    const data: SavedGame = {
      id: this.gameId,
      levelId: this.level.id,
      playerColor: this.playerColor,
      startFen: this.startFen,
      uci: this.moves.map((m) => m.uci),
      clock: this.clock.snapshot(now()),
      clocksAfter: this.moves.map((m) => m.clockAfter),
      savedAt: Date.now()
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    } catch {
      /* storage unavailable: resume just won't be offered */
    }
  }

  /** Save the current clock state (called on window unload). */
  checkpoint(): void {
    this.save()
  }

  static loadSaved(): SavedGame | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return null
      const s = JSON.parse(raw) as SavedGame
      if (!s || !Array.isArray(s.uci) || !s.clock?.remaining) return null
      return s
    } catch {
      return null
    }
  }

  /** Resume a saved game. Clocks were frozen while the app was closed. Returns false if invalid. */
  resume(saved: SavedGame): boolean {
    try {
      const level = getLevel(saved.levelId)
      const chess = new Chess(saved.startFen)
      const moves: MoveRecord[] = []
      const fens = [chess.fen()]
      saved.uci.forEach((u, i) => {
        const p = parseUci(u)
        if (!p) throw new Error('bad move')
        const color = chess.turn()
        const m = chess.move(p)
        moves.push({
          san: m.san,
          uci: u,
          from: m.from,
          to: m.to,
          color,
          captured: !!m.captured,
          castle: m.isKingsideCastle() || m.isQueensideCastle(),
          check: chess.inCheck(),
          clockAfter: saved.clocksAfter?.[i] ?? 0
        })
        fens.push(chess.fen())
      })
      this.token++
      this.level = level
      this.gameId = saved.id ?? newId()
      this.playerColor = saved.playerColor === 'b' ? 'b' : 'w'
      this.chess = chess
      this.startFen = saved.startFen
      this.moves = moves
      this.fens = fens
      this.clock = ChessClock.restore({ ...saved.clock, running: chess.turn() }, now(), true)
      this.result = null
      this.premove = null
      this.engineError = null
      this.status = 'playing'
      void window.kingside.newGame()
      const over = this.detectGameOver()
      if (over) {
        this.end(over)
        return true
      }
      this.emit()
      if (this.clock.flagged(now())) this.tick()
      else if (chess.turn() === this.botColor) void this.botTurn()
      return true
    } catch {
      clearSaved()
      return false
    }
  }

  /** Snapshot for review (also works for an unfinished saved game). */
  toRecord(): GameRecord {
    return {
      id: this.gameId,
      levelId: this.level.id,
      playerColor: this.playerColor,
      startFen: this.startFen,
      moves: [...this.moves],
      fens: [...this.fens],
      result: this.result,
      date: new Date().toISOString()
    }
  }

  static recordFromSaved(saved: SavedGame): GameRecord | null {
    try {
      const chess = new Chess(saved.startFen)
      const fens = [chess.fen()]
      const moves: MoveRecord[] = saved.uci.map((u, i) => {
        const color = chess.turn()
        const m = chess.move(parseUci(u)!)
        fens.push(chess.fen())
        return {
          san: m.san, uci: u, from: m.from, to: m.to, color, captured: !!m.captured,
          castle: m.isKingsideCastle() || m.isQueensideCastle(), check: chess.inCheck(), clockAfter: saved.clocksAfter?.[i] ?? 0
        }
      })
      return { id: saved.id ?? newId(), levelId: saved.levelId, playerColor: saved.playerColor, startFen: saved.startFen, moves, fens, result: null, date: new Date(saved.savedAt).toISOString() }
    } catch {
      return null
    }
  }
}

export function clearSaved(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    /* ignore */
  }
}
