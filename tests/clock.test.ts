import { describe, expect, it } from 'vitest'
import { ChessClock, formatClock } from '../src/shared/clock'
import { BOT_SAFETY_MARGIN_MS, MAX_BOT_DELAY_MS, planBotTime, remainingDelay } from '../src/shared/botTiming'

describe('ChessClock', () => {
  it('only the side to move loses time and pressing switches sides', () => {
    const c = new ChessClock(600_000)
    c.start('w', 0)
    expect(c.timeLeft('w', 5_000)).toBe(595_000)
    expect(c.timeLeft('b', 5_000)).toBe(600_000)
    c.press('w', 5_000)
    expect(c.runningColor).toBe('b')
    expect(c.timeLeft('w', 20_000)).toBe(595_000)
    expect(c.timeLeft('b', 20_000)).toBe(585_000)
    c.press('b', 20_000)
    expect(c.runningColor).toBe('w')
  })

  it('flags at zero, never goes negative, and refuses a move after flag fall', () => {
    const c = new ChessClock(1_000)
    c.start('w', 0)
    expect(c.flagged(999)).toBeNull()
    expect(c.flagged(1_000)).toBe('w')
    expect(c.timeLeft('w', 5_000)).toBe(0)
    expect(() => c.press('w', 1_200)).toThrow(/flag/)
  })

  it('rejects the wrong side pressing', () => {
    const c = new ChessClock(10_000)
    c.start('w', 0)
    expect(() => c.press('b', 10)).toThrow()
  })

  it('applies increment and stops cleanly', () => {
    const c = new ChessClock(10_000, 2_000)
    c.start('w', 0)
    c.press('w', 1_000)
    expect(c.timeLeft('w', 1_000)).toBe(11_000)
    c.stop(3_000)
    expect(c.runningColor).toBeNull()
    expect(c.timeLeft('b', 99_000)).toBe(8_000)
  })

  it('snapshot/restore keeps remaining time (clock frozen while app closed)', () => {
    const c = new ChessClock(600_000)
    c.start('w', 0)
    c.press('w', 30_000)
    const snap = c.snapshot(50_000)
    const r = ChessClock.restore(snap, 9_999_999, true)
    expect(r.timeLeft('w', 9_999_999)).toBe(570_000)
    expect(r.timeLeft('b', 9_999_999)).toBe(580_000)
    expect(r.runningColor).toBe('b')
  })

  it('formats like an online clock', () => {
    expect(formatClock(600_000)).toBe('10:00')
    expect(formatClock(61_000)).toBe('1:01')
    expect(formatClock(19_950)).toBe('0:19.9')
    expect(formatClock(-5)).toBe('0:00.0')
  })
})

describe('bot timing', () => {
  const seeded = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31
    return seed / 2 ** 31
  }

  it('never exceeds the max delay, a 1/25 budget, or the safety margin', () => {
    const rand = seeded(42)
    for (const remaining of [600_000, 120_000, 30_000, 5_000, 1_200, 500, 0]) {
      for (let i = 0; i < 400; i++) {
        const plan = planBotTime({ remainingMs: remaining, ply: i % 80, legalMoves: 1 + (i % 30), recapture: i % 7 === 0, inCheck: i % 11 === 0, rand })
        expect(plan.totalMs).toBeLessThanOrEqual(MAX_BOT_DELAY_MS)
        // 1/25 of the clock, except a tiny 150 ms floor that the hard cap below still bounds.
        expect(plan.totalMs).toBeLessThanOrEqual(Math.max(remaining / 25, Math.min(150, remaining)) + 1)
        expect(plan.totalMs).toBeLessThanOrEqual(Math.max(0, remaining - BOT_SAFETY_MARGIN_MS))
        expect(plan.searchMs).toBeGreaterThan(0)
      }
    }
  })

  it('varies its timing (not constant) and plays forced moves quickly', () => {
    const rand = seeded(7)
    const times = Array.from({ length: 50 }, () => planBotTime({ remainingMs: 600_000, ply: 30, legalMoves: 30, recapture: false, inCheck: false, rand }).totalMs)
    expect(new Set(times).size).toBeGreaterThan(20)
    const forced = Array.from({ length: 50 }, () => planBotTime({ remainingMs: 600_000, ply: 30, legalMoves: 1, recapture: false, inCheck: true, rand }).totalMs)
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    expect(avg(forced)).toBeLessThan(avg(times))
  })

  it('remaining cosmetic delay respects the clock', () => {
    const plan = { searchMs: 1000, totalMs: 4000 }
    expect(remainingDelay(plan, 1000, 600_000)).toBe(3000)
    expect(remainingDelay(plan, 5000, 600_000)).toBe(0)
    expect(remainingDelay(plan, 1000, 2000)).toBe(2000 - BOT_SAFETY_MARGIN_MS)
    expect(remainingDelay(plan, 1000, 100)).toBe(0)
  })
})
