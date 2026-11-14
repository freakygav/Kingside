import { Chess } from 'chess.js'
import type { PositionAnalysis } from './review'
import { lineCp } from './strength'
import { parseGame, type ParsedGame } from './pgn'
import type { Color } from './types'

/**
 * Imported game library (Chess.com, Lichess, PGN). Metadata lives in a small index; each game's
 * full PGN, moves and cached analysis live in their own file (see main/library.ts).
 */
export type ImportSource = 'chesscom' | 'lichess' | 'pgn'
export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily' | 'unknown'

export interface GameMeta {
  id: string
  source: ImportSource
  /** Chess.com game id / lichess game id when known. */
  externalId: string | null
  url: string | null
  white: string
  black: string
  whiteElo: number | null
  blackElo: number | null
  result: '1-0' | '0-1' | '1/2-1/2' | '*'
  /** ISO date (YYYY-MM-DD) or null if unknown. */
  date: string | null
  timeControl: string | null
  timeClass: TimeClass
  eco: string | null
  opening: string | null
  event: string | null
  plies: number
  /** Account the game was imported for (lowercase), used as "you". */
  owner: string | null
  importedAt: number
  /** Summary of cached analysis, if any. */
  analysis: { accuracyW: number | null; accuracyB: number | null; acplW: number | null; acplB: number | null; movetimeMs: number; completedAt: number; tags: Record<string, Record<string, number>> } | null
}

export interface StoredGame {
  meta: GameMeta
  pgn: string
  headers: Record<string, string>
  startFen: string
  ucis: string[]
  sans: string[]
  /** Engine analysis per position (index 0 = start). */
  positions?: PositionAnalysis[]
  bookPlies?: number
}

export interface ImportCandidate {
  game: StoredGame
  /** Problems found while reading (kept visible, never silently dropped). */
  warnings: string[]
  error: string | null
}

const djb2 = (s: string) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

/** Stable ids: the same game imported twice (even via different routes) maps to the same id. */
export function gameIdFor(source: ImportSource, url: string | null, headers: Record<string, string>, ucis: string[]): string {
  const site = `${url ?? ''} ${headers.Site ?? ''} ${headers.Link ?? ''}`
  const cc = /chess\.com\/(?:game\/)?(?:live|daily)\/(?:game\/)?(\d+)/i.exec(site) ?? /chess\.com\/game\/(?:live|daily)\/(\d+)/i.exec(site)
  if (cc) return `cc-${cc[1]}`
  const li = /lichess\.org\/([a-zA-Z0-9]{8})/.exec(site)
  if (li) return `li-${li[1]}`
  void source
  return `pgn-${djb2([headers.White, headers.Black, headers.Date, headers.Round, ucis.join(' ')].join('|'))}`
}

export function normalizeDate(d: string | undefined | null): string | null {
  if (!d) return null
  const m = /^(\d{4})[.\-/](\d{2}|\?\?)[.\-/](\d{2}|\?\?)/.exec(d)
  if (!m || m[2] === '??') return null
  return `${m[1]}-${m[2]}-${m[3] === '??' ? '01' : m[3]}`
}

/** Classify a PGN TimeControl ("600+5", "180", "1/259200") into a time class. */
export function timeClassOf(tc: string | null | undefined): TimeClass {
  if (!tc || tc === '-' || tc === '?') return 'unknown'
  if (tc.includes('/')) return 'daily'
  const [base, inc] = tc.split('+').map(Number)
  if (!Number.isFinite(base)) return 'unknown'
  const est = base + 40 * (inc || 0)
  if (est < 180) return 'bullet'
  if (est < 480) return 'blitz'
  if (est < 1500) return 'rapid'
  return 'classical'
}

const toInt = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

/** Turn a parsed PGN game into a library entry. */
export function candidateFromParsed(p: ParsedGame, source: ImportSource, extra: Partial<GameMeta> = {}): ImportCandidate {
  const h = p.headers
  const warnings: string[] = []
  if (p.comments) warnings.push(`${p.comments} comment${p.comments > 1 ? 's' : ''} kept in the stored PGN`)
  if (p.variations) warnings.push(`${p.variations} side variation${p.variations > 1 ? 's' : ''} kept in the stored PGN (the main line is analysed)`)
  if (h.Variant && !/^standard$/i.test(h.Variant) && !/from position/i.test(h.Variant)) {
    return { game: bareGame(p, source, extra), warnings, error: `Variant "${h.Variant}" is not supported (standard chess only).` }
  }
  if (p.sans.length === 0 && !p.error) warnings.push('The game has no moves')
  const url = extra.url ?? (/^https?:\/\//.test(h.Link ?? '') ? h.Link : /^https?:\/\//.test(h.Site ?? '') ? h.Site : null) ?? null
  const ecoUrl = h.ECOUrl ?? ''
  const openingFromUrl = ecoUrl ? decodeURIComponent(ecoUrl.split('/').pop() ?? '').replace(/-/g, ' ').replace(/\.\.\./g, '…') : null
  const meta: GameMeta = {
    id: gameIdFor(source, url, h, p.ucis),
    source,
    externalId: null,
    url,
    white: h.White ?? '?',
    black: h.Black ?? '?',
    whiteElo: toInt(h.WhiteElo),
    blackElo: toInt(h.BlackElo),
    result: p.result,
    date: normalizeDate(h.UTCDate ?? h.Date),
    timeControl: h.TimeControl && h.TimeControl !== '-' ? h.TimeControl : null,
    timeClass: timeClassOf(h.TimeControl),
    eco: h.ECO && h.ECO !== '?' ? h.ECO : null,
    opening: h.Opening ? `${h.Opening}${h.Variation ? `: ${h.Variation}` : ''}` : openingFromUrl,
    event: h.Event && h.Event !== '?' ? h.Event : null,
    plies: p.sans.length,
    owner: null,
    importedAt: Date.now(),
    analysis: null,
    ...extra
  }
  const game: StoredGame = { meta, pgn: p.raw, headers: h, startFen: p.startFen, ucis: p.ucis, sans: p.sans }
  return { game, warnings, error: p.error ? `${p.error.message} — ${p.sans.length} valid move${p.sans.length === 1 ? '' : 's'} before it` : null }
}

/** Minimal entry for a game that cannot be imported (shown with its error). */
function bareGame(p: ParsedGame, source: ImportSource, extra: Partial<GameMeta>): StoredGame {
  const h = p.headers
  return {
    meta: {
      id: gameIdFor(source, null, h, p.ucis), source, externalId: null, url: null, white: h.White ?? '?', black: h.Black ?? '?', whiteElo: null, blackElo: null,
      result: p.result, date: normalizeDate(h.Date), timeControl: null, timeClass: 'unknown', eco: null, opening: null, event: null, plies: p.sans.length,
      owner: null, importedAt: Date.now(), analysis: null, ...extra
    },
    pgn: p.raw, headers: h, startFen: p.startFen, ucis: p.ucis, sans: p.sans
  }
}

/** Keep only the valid prefix of a game that had an error (user opted in). */
export function truncateToValid(c: ImportCandidate): ImportCandidate {
  return { ...c, error: null, warnings: [...c.warnings, `Imported only the first ${c.game.sans.length} valid moves`], game: { ...c.game, meta: { ...c.game.meta, result: '*' } } }
}

// ---------------------------------------------------------------------------------------------
// Chess.com public API  (https://www.chess.com/news/view/published-data-api)

export interface ChesscomGame {
  url: string
  pgn?: string
  time_control?: string
  time_class?: string
  end_time?: number
  rated?: boolean
  rules?: string
  uuid?: string
  eco?: string
  white: { username: string; rating?: number; result?: string }
  black: { username: string; rating?: number; result?: string }
}

export function candidateFromChesscom(g: ChesscomGame, owner: string): ImportCandidate {
  const id = /\/(\d+)$/.exec(g.url)?.[1] ?? g.uuid ?? null
  if (g.rules && g.rules !== 'chess') {
    const p = parseGame(`[White "${g.white.username}"]\n[Black "${g.black.username}"]\n\n*`)
    const c = candidateFromParsed(p, 'chesscom', { url: g.url, externalId: id })
    return { ...c, error: `Variant "${g.rules}" is not supported (standard chess only).` }
  }
  if (!g.pgn) {
    const p = parseGame(`[White "${g.white.username}"]\n[Black "${g.black.username}"]\n\n*`)
    return { ...candidateFromParsed(p, 'chesscom', { url: g.url, externalId: id }), error: 'Chess.com did not include a PGN for this game (it may still be in progress).' }
  }
  const p = parseGame(g.pgn)
  const tcClass = (g.time_class ?? '') as TimeClass
  const c = candidateFromParsed(p, 'chesscom', {
    url: g.url,
    externalId: id,
    owner: owner.toLowerCase(),
    whiteElo: g.white.rating ?? toInt(p.headers.WhiteElo),
    blackElo: g.black.rating ?? toInt(p.headers.BlackElo),
    timeClass: ['bullet', 'blitz', 'rapid', 'daily'].includes(tcClass) ? tcClass : timeClassOf(g.time_control),
    timeControl: g.time_control ?? p.headers.TimeControl ?? null
  })
  if (id) c.game.meta.id = `cc-${id}`
  return c
}

// ---------------------------------------------------------------------------------------------
// Lichess API (https://lichess.org/api#tag/Games/operation/apiGamesUser), NDJSON with pgnInJson

export interface LichessGame {
  id: string
  rated?: boolean
  variant?: string
  speed?: string
  createdAt?: number
  status?: string
  winner?: 'white' | 'black'
  players: { white: { user?: { name: string }; rating?: number; aiLevel?: number }; black: { user?: { name: string }; rating?: number; aiLevel?: number } }
  opening?: { eco: string; name: string }
  clock?: { initial: number; increment: number }
  pgn?: string
}

export function candidateFromLichess(g: LichessGame, owner: string): ImportCandidate {
  const name = (side: 'white' | 'black') => g.players[side].user?.name ?? (g.players[side].aiLevel ? `Stockfish level ${g.players[side].aiLevel}` : 'Anonymous')
  if (g.variant && g.variant !== 'standard' && g.variant !== 'fromPosition') {
    const p = parseGame(`[White "${name('white')}"]\n[Black "${name('black')}"]\n\n*`)
    return { ...candidateFromParsed(p, 'lichess', { url: `https://lichess.org/${g.id}`, externalId: g.id }), error: `Variant "${g.variant}" is not supported (standard chess only).` }
  }
  const p = parseGame(g.pgn ?? `[White "${name('white')}"]\n[Black "${name('black')}"]\n\n*`)
  const tc = g.clock ? `${g.clock.initial}+${g.clock.increment}` : null
  const speed = (g.speed === 'correspondence' ? 'daily' : g.speed ?? '') as TimeClass
  const c = candidateFromParsed(p, 'lichess', {
    url: `https://lichess.org/${g.id}`,
    externalId: g.id,
    owner: owner.toLowerCase(),
    white: name('white'),
    black: name('black'),
    whiteElo: g.players.white.rating ?? null,
    blackElo: g.players.black.rating ?? null,
    timeControl: tc ?? p.headers.TimeControl ?? null,
    timeClass: ['bullet', 'blitz', 'rapid', 'classical', 'daily'].includes(speed) ? speed : timeClassOf(tc),
    eco: g.opening?.eco ?? p.headers.ECO ?? null,
    opening: g.opening?.name ?? p.headers.Opening ?? null,
    date: g.createdAt ? new Date(g.createdAt).toISOString().slice(0, 10) : normalizeDate(p.headers.UTCDate ?? p.headers.Date)
  })
  c.game.meta.id = `li-${g.id}`
  if (!g.pgn) c.error = 'Lichess did not return a PGN for this game.'
  return c
}

// ---------------------------------------------------------------------------------------------
// Perspective, metrics and statistics (computed only from real data)

/** Which colour "you" played, from the import owner or your known usernames. */
export function userColorOf(meta: GameMeta, myNames: string[]): Color | null {
  const names = new Set(myNames.map((n) => n.toLowerCase()))
  if (meta.owner) names.add(meta.owner)
  if (names.has(meta.white.toLowerCase())) return 'w'
  if (names.has(meta.black.toLowerCase())) return 'b'
  return null
}

export function outcomeFor(meta: GameMeta, color: Color): 'win' | 'loss' | 'draw' | null {
  if (meta.result === '1/2-1/2') return 'draw'
  if (meta.result === '1-0') return color === 'w' ? 'win' : 'loss'
  if (meta.result === '0-1') return color === 'b' ? 'win' : 'loss'
  return null
}

/** Average centipawn loss per side from engine analysis (losses capped at 1000cp per move). */
export function acplFrom(positions: PositionAnalysis[]): { w: number | null; b: number | null } {
  const sums = { w: 0, b: 0 }
  const counts = { w: 0, b: 0 }
  for (let i = 0; i + 1 < positions.length; i++) {
    const before = positions[i]
    const after = positions[i + 1]
    if (before.failed || after.failed || before.terminal || before.lines.length === 0) continue
    const mover: Color = before.fen.split(' ')[1] === 'w' ? 'w' : 'b'
    const best = clamp(lineCp(before.lines[0]))
    const played = after.terminal === 'checkmate' ? 1000 : after.terminal === 'draw' ? 0 : after.lines.length ? -clamp(lineCp(after.lines[0])) : null
    if (played === null) continue
    sums[mover] += Math.min(1000, Math.max(0, best - played))
    counts[mover]++
  }
  return { w: counts.w ? Math.round(sums.w / counts.w) : null, b: counts.b ? Math.round(sums.b / counts.b) : null }
}
const clamp = (cp: number) => Math.max(-1000, Math.min(1000, cp))

export type Period = '7' | '30' | '90' | 'all' | 'custom'

export function inPeriod(meta: GameMeta, period: Period, now: number, from?: string, to?: string): boolean {
  if (period === 'all') return true
  if (!meta.date) return false
  if (period === 'custom') return (!from || meta.date >= from) && (!to || meta.date <= to)
  const cutoff = new Date(now - Number(period) * 86_400_000).toISOString().slice(0, 10)
  return meta.date >= cutoff
}

export interface LibraryStats {
  games: number
  withYou: number
  wins: number
  losses: number
  draws: number
  winRate: number | null
  asWhite: { games: number; wins: number; draws: number; losses: number }
  asBlack: { games: number; wins: number; draws: number; losses: number }
  openings: { name: string; games: number; score: number }[]
  avgOpponent: number | null
  avgLength: number | null
  analysed: number
  avgAccuracy: number | null
  avgAcpl: number | null
  mistakes: { tag: string; count: number }[]
}

export function libraryStats(metas: GameMeta[], myNames: string[]): LibraryStats {
  const mine = metas.map((m) => ({ m, c: userColorOf(m, myNames) })).filter((x): x is { m: GameMeta; c: Color } => x.c !== null)
  const side = (c: Color) => {
    const g = mine.filter((x) => x.c === c)
    const o = g.map((x) => outcomeFor(x.m, c))
    return { games: g.length, wins: o.filter((r) => r === 'win').length, draws: o.filter((r) => r === 'draw').length, losses: o.filter((r) => r === 'loss').length }
  }
  const w = side('w')
  const b = side('b')
  const decided = mine.filter((x) => outcomeFor(x.m, x.c) !== null)
  const wins = w.wins + b.wins
  const draws = w.draws + b.draws
  const byOpening = new Map<string, { games: number; points: number }>()
  for (const x of decided) {
    const name = x.m.opening ?? x.m.eco
    if (!name) continue
    const e = byOpening.get(name) ?? { games: 0, points: 0 }
    const o = outcomeFor(x.m, x.c)
    e.games++
    e.points += o === 'win' ? 1 : o === 'draw' ? 0.5 : 0
    byOpening.set(name, e)
  }
  const opp = mine.map((x) => (x.c === 'w' ? x.m.blackElo : x.m.whiteElo)).filter((r): r is number => r !== null)
  const analysed = mine.filter((x) => x.m.analysis)
  const accs = analysed.map((x) => (x.c === 'w' ? x.m.analysis!.accuracyW : x.m.analysis!.accuracyB)).filter((a): a is number => a !== null)
  const acpls = analysed.map((x) => (x.c === 'w' ? x.m.analysis!.acplW : x.m.analysis!.acplB)).filter((a): a is number => a !== null)
  const tags = new Map<string, number>()
  for (const x of analysed) for (const [k, n] of Object.entries(x.m.analysis!.tags?.[x.c] ?? {})) tags.set(k, (tags.get(k) ?? 0) + n)
  const avg = (a: number[]) => (a.length ? Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10 : null)
  return {
    games: metas.length,
    withYou: mine.length,
    wins,
    losses: w.losses + b.losses,
    draws,
    winRate: decided.length ? Math.round(((wins + draws * 0.5) / decided.length) * 1000) / 10 : null,
    asWhite: w,
    asBlack: b,
    openings: [...byOpening.entries()].map(([name, e]) => ({ name, games: e.games, score: Math.round((e.points / e.games) * 1000) / 10 })).sort((a, z) => z.games - a.games),
    avgOpponent: opp.length ? Math.round(opp.reduce((s, v) => s + v, 0) / opp.length) : null,
    avgLength: mine.length ? Math.round(mine.reduce((s, x) => s + Math.ceil(x.m.plies / 2), 0) / mine.length) : null,
    analysed: analysed.length,
    avgAccuracy: avg(accs),
    avgAcpl: avg(acpls),
    mistakes: [...tags.entries()].map(([tag, count]) => ({ tag, count })).sort((a, z) => z.count - a.count)
  }
}

/** Positions (FENs) of a stored game: index 0 = start. */
export function fensOf(g: Pick<StoredGame, 'startFen' | 'ucis'>): string[] {
  const c = new Chess(g.startFen)
  const out = [c.fen()]
  for (const u of g.ucis) {
    c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    out.push(c.fen())
  }
  return out
}
