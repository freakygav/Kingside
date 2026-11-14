import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { uciLineToSan } from '@shared/chessUtil'
import type { GameMeta, StoredGame } from '@shared/library'
import { writePgn, type ExportAnnotation } from '@shared/pgn'
import { buildReview, whiteCpOf, type PositionAnalysis } from '@shared/review'

const SCHEMA = 1
const ID_RE = /^(cc|li|pgn)-[A-Za-z0-9-]{1,64}$/

interface Index {
  schemaVersion: number
  games: GameMeta[]
  /** Your usernames on other sites, used to know which side you played. */
  myNames: string[]
}

/**
 * Imported-game library: `library/index.json` (metadata for the table and statistics) plus
 * `library/games/<id>.json` (PGN, moves and cached engine analysis). Same atomic-JSON persistence
 * as settings.json and profile.json.
 */
export class LibraryStore {
  private dir: string
  private gamesDir: string
  private indexFile: string
  private index: Index

  constructor(userData: string) {
    this.dir = join(userData, 'library')
    this.gamesDir = join(this.dir, 'games')
    mkdirSync(this.gamesDir, { recursive: true })
    this.indexFile = join(this.dir, 'index.json')
    this.index = this.load()
  }

  private load(): Index {
    if (!existsSync(this.indexFile)) return { schemaVersion: SCHEMA, games: [], myNames: [] }
    try {
      const raw = JSON.parse(readFileSync(this.indexFile, 'utf8')) as Partial<Index>
      return { schemaVersion: SCHEMA, games: Array.isArray(raw.games) ? raw.games.filter((g) => g && ID_RE.test(g.id)) : [], myNames: Array.isArray(raw.myNames) ? raw.myNames.filter((n) => typeof n === 'string') : [] }
    } catch {
      writeFileSync(this.indexFile.replace(/\.json$/, `.corrupt-${Date.now()}.json`), readFileSync(this.indexFile))
      return { schemaVersion: SCHEMA, games: [], myNames: [] }
    }
  }

  private write(file: string, data: unknown): void {
    const tmp = file + '.tmp'
    writeFileSync(tmp, JSON.stringify(data))
    renameSync(tmp, file)
  }
  private saveIndex(): void {
    this.write(this.indexFile, this.index)
  }
  private gameFile(id: string): string {
    if (!ID_RE.test(id)) throw new Error('Invalid game id')
    return join(this.gamesDir, `${id}.json`)
  }

  list(): Index {
    return this.index
  }

  get(id: string): StoredGame | null {
    const f = this.gameFile(id)
    if (!existsSync(f)) return null
    return JSON.parse(readFileSync(f, 'utf8')) as StoredGame
  }

  /** Add games; ones already in the library (same id) are reported as duplicates, not re-added. */
  add(games: StoredGame[]): { added: string[]; duplicates: string[] } {
    const have = new Set(this.index.games.map((g) => g.id))
    const added: string[] = []
    const duplicates: string[] = []
    for (const g of games) {
      if (!g?.meta?.id || !ID_RE.test(g.meta.id) || !Array.isArray(g.ucis)) continue
      if (have.has(g.meta.id)) {
        duplicates.push(g.meta.id)
        continue
      }
      const meta: GameMeta = { ...g.meta, analysis: null, importedAt: Date.now() }
      this.write(this.gameFile(meta.id), { ...g, meta, positions: undefined })
      this.index.games.push(meta)
      have.add(meta.id)
      added.push(meta.id)
      if (meta.owner && !this.index.myNames.includes(meta.owner)) this.index.myNames.push(meta.owner)
    }
    if (added.length) this.saveIndex()
    return { added, duplicates }
  }

  delete(ids: string[]): number {
    const set = new Set(ids)
    for (const id of set) {
      const f = this.gameFile(id)
      if (existsSync(f)) unlinkSync(f)
    }
    const before = this.index.games.length
    this.index.games = this.index.games.filter((g) => !set.has(g.id))
    this.saveIndex()
    return before - this.index.games.length
  }

  saveAnalysis(id: string, positions: PositionAnalysis[], bookPlies: number, summary: NonNullable<GameMeta['analysis']>): GameMeta {
    const g = this.get(id)
    if (!g) throw new Error('Game not found in the library')
    if (positions.length !== g.ucis.length + 1) throw new Error('Analysis does not match the game')
    const meta = { ...g.meta, analysis: summary }
    this.write(this.gameFile(id), { ...g, meta, positions, bookPlies })
    this.index.games = this.index.games.map((m) => (m.id === id ? meta : m))
    this.saveIndex()
    return meta
  }

  setMyNames(names: string[]): string[] {
    this.index.myNames = [...new Set(names.map((n) => n.trim().toLowerCase()).filter((n) => /^[\w-]{2,40}$/.test(n)))]
    this.saveIndex()
    return this.index.myNames
  }

  /** PGN text for the given games. Analysed games get [%eval] comments and classification NAGs. */
  exportPgn(ids: string[]): string {
    const out: string[] = []
    for (const id of ids) {
      const g = this.get(id)
      if (!g) continue
      let notes: (ExportAnnotation | null)[] | undefined
      if (g.positions && g.positions.length === g.ucis.length + 1) {
        const review = buildReview(g.sans.map((san, i) => ({ san, uci: g.ucis[i], color: i % 2 === (g.startFen.split(' ')[1] === 'w' ? 0 : 1) ? 'w' as const : 'b' as const })), g.positions, g.bookPlies ?? 0)
        notes = review.moves.map((m, i) => ({
          evalAfter: g.positions![i + 1].failed ? undefined : whiteCpOf(g.positions![i + 1]),
          cls: m.cls,
          bestSan: m.bestUci && m.bestUci !== m.uci ? uciLineToSan(m.fenBefore, [m.bestUci], 1)[0] ?? null : null
        }))
      }
      const headers = { ...g.headers }
      if (g.meta.url && !headers.Link) headers.Link = g.meta.url
      if (notes) headers.Annotator = 'Kingside (Stockfish)'
      out.push(writePgn(headers, g.startFen, g.sans, g.meta.result, notes))
    }
    return out.join('\n')
  }
}
