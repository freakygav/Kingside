import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChesscomGame, LichessGame } from '@shared/library'

/**
 * Clients for the public Chess.com and Lichess APIs. Only public data is requested — never
 * passwords or private information. Requests to each site are serialised (one at a time), and the
 * User-Agent identifies the app without any personal details.
 */
const UA = 'Kingside/1.0 (desktop chess trainer)'
const USERNAME_RE = /^[A-Za-z0-9_-]{2,30}$/

export class ApiError extends Error {
  constructor(message: string, readonly kind: 'not-found' | 'rate-limit' | 'network' | 'invalid' | 'server') {
    super(message)
  }
}

function checkName(u: string): string {
  const name = (u ?? '').trim()
  if (!USERNAME_RE.test(name)) throw new ApiError('Usernames are 2–30 characters: letters, digits, "_" or "-".', 'invalid')
  return name
}

/** One-at-a-time queue per host (Chess.com asks for serial access; Lichess requires it). */
class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.tail.then(fn, fn)
    this.tail = r.catch(() => undefined)
    return r
  }
}

async function request(url: string, opts: { accept?: string; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: opts.accept ?? 'application/json', ...(opts.headers ?? {}) }, signal: ctrl.signal })
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 60
      throw new ApiError(`The server is rate-limiting requests. Please wait about ${wait} seconds and try again.`, 'rate-limit')
    }
    return res
  } catch (e) {
    if (e instanceof ApiError) throw e
    const msg = (e as Error).name === 'AbortError' ? 'The request timed out.' : 'Could not reach the server — check your internet connection.'
    throw new ApiError(msg, 'network')
  } finally {
    clearTimeout(t)
  }
}

// ---------------------------------------------------------------------------------------------
// Chess.com — https://www.chess.com/news/view/published-data-api

export class ChesscomClient {
  private q = new SerialQueue()
  private cacheDir: string
  constructor(userData: string) {
    this.cacheDir = join(userData, 'import-cache')
    mkdirSync(this.cacheDir, { recursive: true })
  }

  /** GET with ETag/Last-Modified revalidation, as the API documentation recommends. */
  private cachedJson<T>(url: string): Promise<T> {
    return this.q.run(async () => {
      const file = join(this.cacheDir, `cc-${createHash('sha1').update(url).digest('hex')}.json`)
      let cached: { etag?: string; lastModified?: string; body: T } | null = null
      if (existsSync(file)) {
        try {
          cached = JSON.parse(readFileSync(file, 'utf8'))
        } catch {
          cached = null
        }
      }
      const headers: Record<string, string> = {}
      if (cached?.etag) headers['If-None-Match'] = cached.etag
      if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified
      let res: Response
      try {
        res = await request(url, { headers })
      } catch (e) {
        // Offline but cached: serve the cached copy.
        if (cached && e instanceof ApiError && e.kind === 'network') return cached.body
        throw e
      }
      if (res.status === 304 && cached) return cached.body
      if (res.status === 404) throw new ApiError('not found', 'not-found')
      if (res.status === 410) throw new ApiError('This data is no longer available on Chess.com.', 'not-found')
      if (!res.ok) throw new ApiError(`Chess.com returned an error (HTTP ${res.status}).`, 'server')
      const body = (await res.json()) as T
      writeFileSync(file, JSON.stringify({ etag: res.headers.get('etag') ?? undefined, lastModified: res.headers.get('last-modified') ?? undefined, body }))
      return body
    })
  }

  async profile(username: string): Promise<{ username: string; name: string | null; url: string | null; joined: number | null; status: string | null }> {
    const name = checkName(username)
    try {
      const p = await this.cachedJson<{ username: string; name?: string; url?: string; joined?: number; status?: string }>(`https://api.chess.com/pub/player/${name.toLowerCase()}`)
      return { username: p.username ?? name, name: p.name ?? null, url: p.url ?? null, joined: p.joined ?? null, status: p.status ?? null }
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'not-found') throw new ApiError(`No Chess.com account named "${name}" was found.`, 'not-found')
      throw e
    }
  }

  async archives(username: string): Promise<{ year: number; month: number }[]> {
    const name = checkName(username)
    const r = await this.cachedJson<{ archives: string[] }>(`https://api.chess.com/pub/player/${name.toLowerCase()}/games/archives`)
    return (r.archives ?? [])
      .map((u) => /\/(\d{4})\/(\d{2})$/.exec(u))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ year: Number(m[1]), month: Number(m[2]) }))
      .reverse()
  }

  async month(username: string, year: number, month: number): Promise<ChesscomGame[]> {
    const name = checkName(username)
    if (!Number.isInteger(year) || year < 2000 || year > 3000 || !Number.isInteger(month) || month < 1 || month > 12) throw new ApiError('Invalid archive month.', 'invalid')
    const r = await this.cachedJson<{ games: ChesscomGame[] }>(`https://api.chess.com/pub/player/${name.toLowerCase()}/games/${year}/${String(month).padStart(2, '0')}`)
    return r.games ?? []
  }
}

// ---------------------------------------------------------------------------------------------
// Lichess — https://lichess.org/api

export interface LichessQuery {
  since?: number
  until?: number
  perfType?: string[]
  max?: number
}

export class LichessClient {
  private q = new SerialQueue()

  async user(username: string): Promise<{ username: string; disabled: boolean; games: number | null; url: string }> {
    const name = checkName(username)
    return this.q.run(async () => {
      const res = await request(`https://lichess.org/api/user/${encodeURIComponent(name)}`)
      if (res.status === 404) throw new ApiError(`No Lichess account named "${name}" was found.`, 'not-found')
      if (!res.ok) throw new ApiError(`Lichess returned an error (HTTP ${res.status}).`, 'server')
      const u = (await res.json()) as { username: string; disabled?: boolean; closed?: boolean; count?: { all?: number }; url?: string }
      return { username: u.username, disabled: !!(u.disabled || u.closed), games: u.count?.all ?? null, url: u.url ?? `https://lichess.org/@/${name}` }
    })
  }

  async games(username: string, query: LichessQuery): Promise<LichessGame[]> {
    const name = checkName(username)
    const params = new URLSearchParams({ pgnInJson: 'true', opening: 'true', clocks: 'false', evals: 'false', moves: 'true', tags: 'true' })
    params.set('max', String(Math.min(300, Math.max(1, Math.round(query.max ?? 50)))))
    if (query.since) params.set('since', String(Math.round(query.since)))
    if (query.until) params.set('until', String(Math.round(query.until)))
    const perfs = (query.perfType ?? []).filter((p) => ['bullet', 'blitz', 'rapid', 'classical', 'correspondence', 'ultraBullet'].includes(p))
    if (perfs.length) params.set('perfType', perfs.join(','))
    return this.q.run(async () => {
      const res = await request(`https://lichess.org/api/games/user/${encodeURIComponent(name)}?${params}`, { accept: 'application/x-ndjson', timeoutMs: 90_000 })
      if (res.status === 404) throw new ApiError(`No Lichess account named "${name}" was found.`, 'not-found')
      if (!res.ok) throw new ApiError(`Lichess returned an error (HTTP ${res.status}).`, 'server')
      const text = await res.text()
      return text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as LichessGame)
    })
  }
}
