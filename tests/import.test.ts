import { describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { parseGame, parsePgn, splitGames, writePgn } from '../src/shared/pgn'
import {
  acplFrom, candidateFromChesscom, candidateFromLichess, candidateFromParsed, gameIdFor, inPeriod, libraryStats, normalizeDate, outcomeFor,
  timeClassOf, truncateToValid, userColorOf, type GameMeta
} from '../src/shared/library'
import { LibraryStore } from '../src/main/library'
import type { PositionAnalysis } from '../src/shared/review'

const MULTI = `[Event "Club Ch."]
[Site "Somewhere"]
[Date "2024.03.09"]
[Round "3"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[WhiteElo "1850"]
[BlackElo "1790"]
[TimeControl "600+5"]
[ECO "C65"]
[Opening "Ruy Lopez"]
[Variation "Berlin Defense"]

1. e4 {The best move?} e5 2. Nf3 Nc6 (2... d6 3. d4 (3. Bc4) exd4) 3. Bb5 Nf6 $1 4. 0-0 Nxe4
5. d4 Nd6 6. Bxc6 dxc6 7. dxe5 Nf5 8. Qxd8+ Kxd8 9. h3 Ke8 10. Nc3 h5 11. Bf4 Be7 12. Rad1 Be6 13. Ng5 Rh6 14. g3 Bxg5 15. Bxg5 Rg6 16. h4 f6 17. exf6 gxf6 18. Bf4 Nxh4 19. f3 Rd8 20. Kf2 Rxd1 21. Rxd1 Nf5 22. Rh1 Bxa2 23. Rxh5 Be6 24. g4 Nd6 25. Rh7 Nf7 26. Ne4 Kf8 27. Nc5 Bc8 28. Rh8+ Kg7 29. Rxc8 1-0

[Event "Casual"]
[White "Carol"]
[Black "Dave"]
[Result "0-1"]
[SetUp "1"]
[FEN "4k3/8/8/8/8/8/3p4/R3K3 b Q - 0 40"]

40... d1=Q+?? ; a line comment
41. Kxd1 0-1

[White "Eve"]
[Black "Mallory"]
[Result "*"]

1. e4 e5 2. Nf9 Nc6 *
`

describe('PGN parsing', () => {
  it('splits multiple games and keeps headers', () => {
    const chunks = splitGames(MULTI)
    expect(chunks).toHaveLength(3)
    const games = parsePgn(MULTI)
    expect(games[0].headers.White).toBe('Alice')
    expect(games[0].headers.Variation).toBe('Berlin Defense')
  })

  it('handles comments, nested variations, NAGs, 0-0 castling, check and mate marks', () => {
    const g = parsePgn(MULTI)[0]
    expect(g.error).toBeUndefined()
    expect(g.sans[6]).toBe('O-O')
    expect(g.sans).toHaveLength(57)
    expect(g.comments).toBe(1)
    expect(g.variations).toBe(1)
    expect(g.result).toBe('1-0')
    expect(g.sans[14]).toBe('Qxd8+')
  })

  it('supports FEN start positions, promotions and line comments', () => {
    const g = parsePgn(MULTI)[1]
    expect(g.startFen).toBe('4k3/8/8/8/8/8/3p4/R3K3 b Q - 0 40')
    expect(g.sans).toEqual(['d1=Q+', 'Kxd1'])
    expect(g.result).toBe('0-1')
  })

  it('reports invalid notation with the move number and keeps the valid prefix', () => {
    const g = parsePgn(MULTI)[2]
    expect(g.error?.message).toMatch(/"Nf9" at 2\./)
    expect(g.sans).toEqual(['e4', 'e5'])
  })

  it('accepts en passant, "e.p." suffix and promotion without "="', () => {
    const g = parseGame('1. e4 a6 2. e5 d5 3. exd6 e.p. Kd7 4. dxc7 Ke6 5. cxb8Q *')
    expect(g.error).toBeUndefined()
    expect(g.sans).toEqual(['e4', 'a6', 'e5', 'd5', 'exd6', 'Kd7', 'dxc7', 'Ke6', 'cxb8=Q'])
  })

  it('moves without headers (pasted notation) are one game', () => {
    const games = parsePgn('1.d4 d5 2.c4 e6 3.Nc3 Nf6')
    expect(games).toHaveLength(1)
    expect(games[0].sans).toHaveLength(6)
  })

  it('writes PGN that parses back to the same game, with eval annotations', () => {
    const g = parsePgn(MULTI)[0]
    const text = writePgn(g.headers, g.startFen, g.sans, g.result, g.sans.map((_, i) => (i === 3 ? { evalAfter: -150, cls: 'mistake', bestSan: 'Nf6' } : { evalAfter: 20 })))
    expect(text).toMatch(/\[%eval -1.50\]/)
    expect(text).toMatch(/\$2/)
    const back = parseGame(text)
    expect(back.sans).toEqual(g.sans)
    expect(back.headers.White).toBe('Alice')
    const fen = writePgn({ White: 'C' }, '4k3/8/8/8/8/8/3p4/R3K3 b Q - 0 40', ['d1=Q+', 'Kxd1'], '0-1')
    expect(fen).toMatch(/\[SetUp "1"\]/)
    expect(fen).toMatch(/40\.\.\. d1=Q\+/)
  })
})

describe('library model', () => {
  it('maps PGN metadata, normalises dates and time classes', () => {
    const c = candidateFromParsed(parsePgn(MULTI)[0], 'pgn')
    expect(c.error).toBeNull()
    expect(c.game.meta).toMatchObject({ white: 'Alice', whiteElo: 1850, blackElo: 1790, result: '1-0', date: '2024-03-09', timeControl: '600+5', timeClass: 'rapid', eco: 'C65', opening: 'Ruy Lopez: Berlin Defense' })
    expect(c.warnings.join(' ')).toMatch(/variation/)
    expect(normalizeDate('2024.??.??')).toBeNull()
    expect(timeClassOf('60+0')).toBe('bullet')
    expect(timeClassOf('180+2')).toBe('blitz')
    expect(timeClassOf('1/86400')).toBe('daily')
    expect(timeClassOf('5400+30')).toBe('classical')
  })

  it('stable ids: same game from API and from a PGN export dedupe to one id', () => {
    const pgn = `[Site "Chess.com"]\n[Link "https://www.chess.com/game/live/123456789"]\n[White "a"]\n[Black "b"]\n\n1. e4 *`
    const fromPgn = candidateFromParsed(parseGame(pgn), 'pgn').game.meta.id
    const fromApi = candidateFromChesscom({ url: 'https://www.chess.com/game/live/123456789', pgn, rules: 'chess', white: { username: 'a', rating: 1500 }, black: { username: 'b', rating: 1400 }, time_class: 'blitz', time_control: '180' }, 'a').game.meta.id
    expect(fromPgn).toBe('cc-123456789')
    expect(fromApi).toBe(fromPgn)
    expect(gameIdFor('pgn', null, { Site: 'https://lichess.org/AbCdEfGh' }, [])).toBe('li-AbCdEfGh')
    const plain = gameIdFor('pgn', null, { White: 'x', Black: 'y' }, ['e2e4'])
    expect(plain).toBe(gameIdFor('pgn', null, { White: 'x', Black: 'y' }, ['e2e4']))
    expect(plain).not.toBe(gameIdFor('pgn', null, { White: 'x', Black: 'y' }, ['d2d4']))
  })

  it('Chess.com and Lichess variants and missing PGNs are explained, not imported', () => {
    expect(candidateFromChesscom({ url: 'https://www.chess.com/game/live/1', rules: 'chess960', white: { username: 'a' }, black: { username: 'b' } }, 'a').error).toMatch(/chess960/)
    expect(candidateFromChesscom({ url: 'https://www.chess.com/game/daily/2', rules: 'chess', white: { username: 'a' }, black: { username: 'b' } }, 'a').error).toMatch(/PGN/)
    const li = candidateFromLichess({ id: 'abcdefgh', variant: 'atomic', players: { white: { user: { name: 'x' } }, black: { user: { name: 'y' } } } }, 'x')
    expect(li.error).toMatch(/atomic/)
    const ok = candidateFromLichess({
      id: 'zyxwvuts', variant: 'standard', speed: 'blitz', createdAt: Date.UTC(2025, 0, 5), winner: 'black',
      players: { white: { user: { name: 'Me' }, rating: 1500 }, black: { user: { name: 'You' }, rating: 1600 } },
      opening: { eco: 'B01', name: 'Scandinavian Defense' }, clock: { initial: 180, increment: 2 },
      pgn: '[White "Me"]\n[Black "You"]\n[Result "0-1"]\n\n1. e4 d5 0-1'
    }, 'me')
    expect(ok.error).toBeNull()
    expect(ok.game.meta).toMatchObject({ id: 'li-zyxwvuts', timeClass: 'blitz', timeControl: '180+2', eco: 'B01', date: '2025-01-05', owner: 'me', result: '0-1' })
  })

  it('truncating an invalid PGN keeps the valid moves and marks it unfinished', () => {
    const c = candidateFromParsed(parsePgn(MULTI)[2], 'pgn')
    expect(c.error).toMatch(/Nf9/)
    const t = truncateToValid(c)
    expect(t.error).toBeNull()
    expect(t.game.sans).toEqual(['e4', 'e5'])
    expect(t.game.meta.result).toBe('*')
  })

  it('perspective, outcome, statistics and periods use real data only', () => {
    const meta = (o: Partial<GameMeta>): GameMeta => ({
      id: 'pgn-' + Math.random().toString(36).slice(2), source: 'pgn', externalId: null, url: null, white: 'me', black: 'opp', whiteElo: null, blackElo: 1500, result: '1-0',
      date: '2026-11-01', timeControl: null, timeClass: 'blitz', eco: 'C50', opening: 'Italian Game', event: null, plies: 40, owner: null, importedAt: 0, analysis: null, ...o
    })
    const games = [meta({}), meta({ result: '0-1' }), meta({ white: 'opp', black: 'me', result: '1/2-1/2', opening: 'Sicilian', whiteElo: 1700 }), meta({ white: 'x', black: 'y' })]
    expect(userColorOf(games[2], ['ME'])).toBe('b')
    expect(outcomeFor(games[1], 'w')).toBe('loss')
    const s = libraryStats(games, ['me'])
    expect(s).toMatchObject({ games: 4, withYou: 3, wins: 1, losses: 1, draws: 1, winRate: 50, avgOpponent: 1567, avgLength: 20, analysed: 0, avgAccuracy: null })
    expect(s.asWhite).toEqual({ games: 2, wins: 1, draws: 0, losses: 1 })
    expect(s.openings[0]).toEqual({ name: 'Italian Game', games: 2, score: 50 })
    const now = Date.UTC(2026, 10, 13)
    expect(inPeriod(meta({ date: '2026-11-10' }), '7', now)).toBe(true)
    expect(inPeriod(meta({ date: '2026-10-01' }), '30', now)).toBe(false)
    expect(inPeriod(meta({ date: null }), '90', now)).toBe(false)
    expect(inPeriod(meta({ date: '2026-05-05' }), 'custom', now, '2026-05-01', '2026-05-31')).toBe(true)
  })

  it('average centipawn loss from engine analysis', () => {
    const pos = (fen: string, cp: number): PositionAnalysis => ({ fen, lines: [{ multipv: 1, depth: 10, cp, pv: ['a2a3'] }] })
    const c = new Chess()
    const f0 = c.fen()
    c.move('e4')
    const f1 = c.fen()
    c.move('e5')
    const f2 = c.fen()
    // White best +30, after e4 Black-to-move eval -20 (White +20) => loss 10. Black best -20, after e5 White +100 (Black -100) => loss 80.
    const a = acplFrom([pos(f0, 30), pos(f1, -20), pos(f2, 100)])
    expect(a).toEqual({ w: 10, b: 80 })
  })
})

describe('library store', () => {
  it('adds, dedupes, saves analysis, exports annotated PGN, deletes, persists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ks-lib-'))
    const store = new LibraryStore(dir)
    const cands = parsePgn(MULTI).slice(0, 2).map((p) => candidateFromParsed(p, 'pgn').game)
    const r1 = store.add(cands)
    expect(r1.added).toHaveLength(2)
    const r2 = store.add(cands)
    expect(r2).toEqual({ added: [], duplicates: r1.added })
    const id = r1.added[1]
    const g = store.get(id)!
    const c = new Chess(g.startFen)
    const fens = [c.fen()]
    for (const u of g.ucis) {
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
      fens.push(c.fen())
    }
    const positions: PositionAnalysis[] = fens.map((fen, i) => (i === fens.length - 1 ? { fen, lines: [], terminal: 'draw' as const } : { fen, lines: [{ multipv: 1, depth: 12, cp: i === 0 ? 900 : -900, pv: [g.ucis[i]] }] }))
    expect(() => store.saveAnalysis(id, positions.slice(1), 0, { accuracyW: 1, accuracyB: 1, acplW: 0, acplB: 0, movetimeMs: 100, completedAt: 1, tags: {} })).toThrow(/match/)
    const meta = store.saveAnalysis(id, positions, 0, { accuracyW: 90, accuracyB: 80, acplW: 5, acplB: 20, movetimeMs: 100, completedAt: 1, tags: { w: {}, b: { hanging: 1 } } })
    expect(meta.analysis?.accuracyW).toBe(90)
    const pgn = store.exportPgn([id])
    expect(pgn).toMatch(/Annotator "Kingside \(Stockfish\)"/)
    expect(pgn).toMatch(/%eval/)
    // Re-open from disk.
    const again = new LibraryStore(dir)
    expect(again.list().games).toHaveLength(2)
    expect(again.get(id)?.positions).toHaveLength(fens.length)
    expect(again.delete([id])).toBe(1)
    expect(readdirSync(join(dir, 'library', 'games'))).toHaveLength(1)
    expect(again.setMyNames([' Me ', 'bad name!', 'other_1'])).toEqual(['me', 'other_1'])
  })
})
