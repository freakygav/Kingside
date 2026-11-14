import type { Color } from './types'

export interface ClockSnapshot {
  remaining: Record<Color, number>
  running: Color | null
  incrementMs: number
}

/**
 * Two-sided chess clock driven by explicit timestamps (ms), so it is deterministic and testable.
 * Only one side runs at a time. Remaining time never goes below zero.
 */
export class ChessClock {
  private remaining: Record<Color, number>
  private running: Color | null = null
  private since = 0
  readonly incrementMs: number

  constructor(initialMs: number, incrementMs = 0) {
    if (!(initialMs > 0)) throw new Error('Clock needs a positive starting time')
    this.remaining = { w: initialMs, b: initialMs }
    this.incrementMs = Math.max(0, incrementMs)
  }

  get runningColor(): Color | null {
    return this.running
  }

  /** Start (or resume) the given side's clock. */
  start(color: Color, now: number): void {
    this.settle(now)
    this.running = color
    this.since = now
  }

  /** Stop whichever side is running, keeping the elapsed time charged. */
  stop(now: number): void {
    this.settle(now)
    this.running = null
  }

  /** Time left for a side at `now`. */
  timeLeft(color: Color, now: number): number {
    const base = this.remaining[color]
    if (this.running !== color) return base
    return Math.max(0, base - Math.max(0, now - this.since))
  }

  /** The side whose flag has fallen, if any. */
  flagged(now: number): Color | null {
    if (this.running && this.timeLeft(this.running, now) <= 0) return this.running
    return null
  }

  /**
   * Called after `mover` completes a move: charges their elapsed time, adds increment and starts the
   * opponent. Throws if the mover's flag had already fallen - the caller must check first, a move
   * made after flag fall does not count.
   */
  press(mover: Color, now: number): void {
    if (this.running !== null && this.running !== mover) throw new Error(`Clock: ${mover} pressed while ${this.running}'s clock runs`)
    if (this.timeLeft(mover, now) <= 0) throw new Error('Clock: move after flag fall')
    this.settle(now)
    this.remaining[mover] += this.incrementMs
    this.running = mover === 'w' ? 'b' : 'w'
    this.since = now
  }

  snapshot(now: number): ClockSnapshot {
    return {
      remaining: { w: this.timeLeft('w', now), b: this.timeLeft('b', now) },
      running: this.running,
      incrementMs: this.incrementMs
    }
  }

  static restore(s: ClockSnapshot, now: number, resume: boolean): ChessClock {
    const c = new ChessClock(Math.max(1, s.remaining.w), s.incrementMs)
    c.remaining = { w: Math.max(0, s.remaining.w), b: Math.max(0, s.remaining.b) }
    if (resume && s.running) c.start(s.running, now)
    return c
  }

  private settle(now: number): void {
    if (this.running) {
      this.remaining[this.running] = this.timeLeft(this.running, now)
      this.since = now
    }
  }
}

/** mm:ss, with tenths under 20 seconds (like most online clocks). */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms)
  if (clamped < 20_000) {
    const tenths = Math.floor(clamped / 100)
    const s = Math.floor(tenths / 10)
    return `0:${String(s).padStart(2, '0')}.${tenths % 10}`
  }
  const total = Math.ceil(clamped / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
