/** Upper bound on the bot's total "thinking" time for any single move. */
export const MAX_BOT_DELAY_MS = 8000
/** The bot always keeps at least this much on its clock after moving. */
export const BOT_SAFETY_MARGIN_MS = 750

export interface BotTimingInput {
  /** Bot's remaining clock time when its turn starts. */
  remainingMs: number
  /** Half-moves played so far. */
  ply: number
  /** Legal moves available to the bot. */
  legalMoves: number
  /** The previous move was a capture that the bot can take back on the same square. */
  recapture: boolean
  /** The bot is in check. */
  inCheck: boolean
  rand?: () => number
}

export interface BotTimingPlan {
  /** Engine search budget (wall clock). */
  searchMs: number
  /** Total time from turn start until the move is shown, including the search. */
  totalMs: number
}

/** Roughly normal sample via Box-Muller, deterministic under an injected rand. */
function gaussian(rand: () => number): number {
  const u = Math.max(1e-9, rand())
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Decide how long the bot should appear to think. The plan is purely cosmetic pacing, bounded so
 * that it can never cost the bot the game on time:
 *   totalMs <= min(MAX_BOT_DELAY_MS, remaining / 25, remaining - safety margin)
 * The engine's own search budget is a fraction of the total; the rest is a wait after the engine
 * answers. The bot's clock runs during both, exactly like a human's.
 */
export function planBotTime(input: BotTimingInput): BotTimingPlan {
  const rand = input.rand ?? Math.random
  const remaining = Math.max(0, input.remainingMs)

  let typical: number
  if (input.legalMoves <= 1) typical = 450
  else if (input.recapture) typical = 900
  else if (input.ply < 8) typical = 1100
  else if (input.ply < 20) typical = 2600
  else if (input.ply < 60) typical = 3400
  else typical = 2400
  if (input.inCheck && input.legalMoves <= 3) typical *= 0.7

  // Log-normal spread: most moves near the typical time, occasional longer thinks.
  let total = typical * Math.exp(0.45 * gaussian(rand))

  // Clock-aware caps. Spend about 1/25 of what's left; speed up a lot in time trouble.
  const budget = remaining / 25
  const hardCap = Math.max(0, remaining - BOT_SAFETY_MARGIN_MS)
  total = Math.min(total, MAX_BOT_DELAY_MS, budget, hardCap)
  total = Math.max(total, Math.min(150, hardCap))

  // Engine search: most of the budget, but at least a sliver so it can find a move at all.
  const searchMs = Math.max(30, Math.min(total * 0.75, 5000))
  return { searchMs: Math.round(Math.min(searchMs, Math.max(30, hardCap))), totalMs: Math.round(total) }
}

/**
 * Remaining cosmetic wait once the engine has answered. Never pushes the bot past its safety margin.
 */
export function remainingDelay(plan: BotTimingPlan, elapsedMs: number, clockLeftMs: number): number {
  const wanted = plan.totalMs - elapsedMs
  const allowed = clockLeftMs - BOT_SAFETY_MARGIN_MS
  return Math.max(0, Math.min(wanted, allowed, MAX_BOT_DELAY_MS))
}
