import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { MAX_BOT_DELAY_MS } from '../src/shared/botTiming'
import type { PlayRequest } from '../src/shared/types'

/**
 * Simulates whole games against a fake engine with fake timers: clock switching, bot pacing,
 * premoves, flag fall, engine failure and view-only history rules.
 */
type Responder = (req: PlayRequest) => string | null
let responder: Responder
let playCalls: PlayRequest[] = []
let failNext = 0

function firstLegal(fen: string): string {
  const m = new Chess(fen).moves({ verbose: true })[0]
  return m.from + m.to + (m.promotion ?? '')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] })
  playCalls = []
  failNext = 0
  responder = (req) => firstLegal(req.fen)
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  }
  ;(globalThis as any).window = {
    kingside: {
      newGame: async () => ({ ok: true, value: undefined }),
      stop: async () => {},
      play: async (req: PlayRequest) => {
        playCalls.push(req)
        if (failNext > 0) {
          failNext--
          return { ok: false, error: 'engine crashed' }
        }
        const mv = responder(req)
        return { ok: true, value: { bestmove: mv, lines: mv ? [{ multipv: 1, depth: 10, cp: 0, pv: [mv] }] : [], warnings: [] } }
      }
    }
  }
})

afterEach(() => {
  vi.useRealTimers()
})

async function newSession() {
  const { GameSession } = await import('../src/renderer/src/game/session')
  return new GameSession()
}

/** Let the bot think and move. */
async function botMoves() {
  await vi.advanceTimersByTimeAsync(MAX_BOT_DELAY_MS + 50)
}

describe('GameSession', () => {
  it('player moves, clock switches, bot replies within its delay cap', async () => {
    const s = await newSession()
    s.start('e1500', 'w')
    expect(s.clock.runningColor).toBe('w')
    await vi.advanceTimersByTimeAsync(3000)
    expect(s.playerMove('e2', 'e4')).toBe(true)
    expect(s.clock.runningColor).toBe('b')
    expect(s.clock.timeLeft('w', performance.now())).toBeCloseTo(597_000, -2)
    expect(s.botThinking).toBe(true)
    await botMoves()
    expect(s.moves).toHaveLength(2)
    expect(s.clock.runningColor).toBe('w')
    const botUsed = 600_000 - s.clock.timeLeft('b', performance.now())
    expect(botUsed).toBeLessThanOrEqual(MAX_BOT_DELAY_MS)
    expect(botUsed).toBeGreaterThan(0)
    expect(playCalls[0].levelId).toBe('e1500')
  })

  it('rejects illegal moves and moves out of turn', async () => {
    const s = await newSession()
    s.start('e1000', 'w')
    expect(s.playerMove('e2', 'e5')).toBe(false)
    expect(s.playerMove('e2', 'e4')).toBe(true)
    expect(s.playerMove('d2', 'd4')).toBe(false) // bot's turn
  })

  it('bot moves first when the player is Black', async () => {
    const s = await newSession()
    s.start('e1000', 'b')
    await botMoves()
    expect(s.moves).toHaveLength(1)
    expect(s.moves[0].color).toBe('w')
    expect(s.isPlayersTurn).toBe(true)
  })

  it('executes a legal premove immediately when the turn arrives', async () => {
    const s = await newSession()
    const script = ['e7e5']
    responder = (req) => script.shift() ?? firstLegal(req.fen)
    s.start('e1000', 'w')
    s.playerMove('e2', 'e4')
    s.setPremove({ from: 'g1', to: 'f3' })
    expect(s.premove).not.toBeNull()
    await botMoves()
    // The premove went in the instant the bot moved (zero time used), then the bot replied again.
    expect(s.moves.slice(0, 3).map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3'])
    expect(s.moves[2].clockAfter).toBe(s.moves[0].clockAfter)
    expect(s.premove).toBeNull()
  })

  it('drops a premove that became illegal', async () => {
    const s = await newSession()
    responder = () => 'e7e5'
    s.start('e1000', 'w')
    s.playerMove('e2', 'e4')
    s.setPremove({ from: 'e4', to: 'e5' }) // blocked once black plays e5
    await botMoves()
    expect(s.moves).toHaveLength(2)
    expect(s.premove).toBeNull()
    expect(s.isPlayersTurn).toBe(true)
  })

  it('premoves can be cancelled and are refused on your own turn', async () => {
    const s = await newSession()
    s.start('e1000', 'w')
    s.setPremove({ from: 'e2', to: 'e4' })
    expect(s.premove).toBeNull() // it's our turn: no premove
    s.playerMove('e2', 'e4')
    s.setPremove({ from: 'd2', to: 'd4' })
    s.cancelPremove()
    await botMoves()
    expect(s.moves).toHaveLength(2)
  })

  it('flag fall: the player loses on time', async () => {
    const s = await newSession()
    s.start('e1000', 'w')
    await vi.advanceTimersByTimeAsync(600_000)
    s.tick()
    expect(s.status).toBe('over')
    expect(s.result).toEqual({ winner: 'b', reason: 'timeout' })
    expect(s.playerMove('e2', 'e4')).toBe(false)
  })

  it('flag fall vs insufficient material is a draw', async () => {
    const s = await newSession()
    s.start('e1000', 'w')
    // Strip black to a bare king (direct position load for the test).
    s.chess.load('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')
    await vi.advanceTimersByTimeAsync(600_000)
    s.tick()
    expect(s.result).toEqual({ winner: null, reason: 'timeout-draw' })
  })

  it('a stale engine reply after resignation is ignored', async () => {
    const s = await newSession()
    s.start('e1000', 'w')
    s.playerMove('e2', 'e4')
    s.resign()
    await botMoves()
    expect(s.moves).toHaveLength(1)
    expect(s.result?.reason).toBe('resign')
  })

  it('engine failure retries once, then pauses clocks until Retry', async () => {
    const s = await newSession()
    s.start('e1000', 'w')
    failNext = 2
    s.playerMove('e2', 'e4')
    await botMoves()
    expect(s.engineError).toMatch(/crashed/)
    const before = s.clock.timeLeft('b', performance.now())
    await vi.advanceTimersByTimeAsync(60_000)
    expect(s.clock.timeLeft('b', performance.now())).toBe(before) // paused
    s.retryEngine()
    await botMoves()
    expect(s.engineError).toBeNull()
    expect(s.moves).toHaveLength(2)
  })

  it('detects checkmate and ends the game', async () => {
    const s = await newSession()
    const script = ['e7e5', 'd8h4']
    responder = () => script.shift() ?? null
    s.start('e1000', 'w')
    s.playerMove('f2', 'f3')
    await botMoves()
    s.playerMove('g2', 'g4')
    await botMoves()
    expect(s.status).toBe('over')
    expect(s.result).toEqual({ winner: 'b', reason: 'checkmate' })
  })

  it('saves and resumes an interrupted game with frozen clocks', async () => {
    const s = await newSession()
    s.start('e1320', 'w')
    s.playerMove('e2', 'e4')
    await botMoves()
    s.checkpoint()
    const { GameSession } = await import('../src/renderer/src/game/session')
    const saved = GameSession.loadSaved()!
    expect(saved.uci).toHaveLength(2)
    const t = new GameSession()
    expect(t.resume(saved)).toBe(true)
    expect(t.moves.map((m) => m.uci)).toEqual(saved.uci)
    expect(t.isPlayersTurn).toBe(true)
    expect(t.clock.timeLeft('w', performance.now())).toBeCloseTo(saved.clock.remaining.w, -1)
    // A corrupted save is rejected cleanly.
    expect(new GameSession().resume({ ...saved, uci: ['zz'] })).toBe(false)
  })
})

describe('history navigation is view-only', () => {
  it('only the live position allows moves or premoves', async () => {
    const { interactionMode } = await import('../src/renderer/src/game/session')
    const base = { status: 'playing' as const, engineError: false, premovesEnabled: true }
    expect(interactionMode({ ...base, viewingLive: true, playersTurn: true })).toBe('move')
    expect(interactionMode({ ...base, viewingLive: true, playersTurn: false })).toBe('premove')
    expect(interactionMode({ ...base, viewingLive: false, playersTurn: true })).toBeNull()
    expect(interactionMode({ ...base, viewingLive: false, playersTurn: false })).toBeNull()
    expect(interactionMode({ ...base, viewingLive: true, playersTurn: false, premovesEnabled: false })).toBeNull()
    expect(interactionMode({ ...base, status: 'over', viewingLive: true, playersTurn: true })).toBeNull()
    expect(interactionMode({ ...base, engineError: true, viewingLive: true, playersTurn: true })).toBeNull()
  })
})
