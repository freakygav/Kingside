import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChesscomClient, LichessClient } from '../src/main/importers'
import { candidateFromChesscom, candidateFromLichess } from '../src/shared/library'

/**
 * Live checks against the real public APIs, using the sites' founders' public accounts.
 * Opt-in (network): KINGSIDE_LIVE=1 npx vitest run tests/importers.live.test.ts
 */
describe.skipIf(process.env.KINGSIDE_LIVE !== '1')('live public APIs', () => {
  it('Chess.com: profile, archives, a month of games -> valid candidates', async () => {
    const cc = new ChesscomClient(mkdtempSync(join(tmpdir(), 'ks-cc-')))
    const p = await cc.profile('erik')
    expect(p.username.toLowerCase()).toBe('erik')
    await expect(cc.profile('this-user-should-not-exist-xq9')).rejects.toThrow(/No Chess.com account/)
    const months = await cc.archives('erik')
    expect(months.length).toBeGreaterThan(0)
    const games = await cc.month('erik', months[months.length - 1].year, months[months.length - 1].month)
    expect(games.length).toBeGreaterThan(0)
    const cands = games.map((g) => candidateFromChesscom(g, 'erik'))
    const ok = cands.filter((c) => !c.error)
    expect(ok.length).toBeGreaterThan(0)
    for (const c of ok) {
      expect(c.game.meta.id).toMatch(/^cc-\d+$/)
      expect(c.game.meta.url).toMatch(/chess\.com/)
      expect(c.game.ucis.length).toBe(c.game.meta.plies)
    }
    console.log(`chess.com: ${months.length} archives, ${games.length} games in oldest month, ${ok.length} importable`)
  }, 60_000)

  it('Lichess: user + recent games -> valid candidates', async () => {
    const li = new LichessClient()
    const u = await li.user('thibault')
    expect(u.username.toLowerCase()).toBe('thibault')
    await expect(li.user('this-user-should-not-exist-xq9')).rejects.toThrow(/No Lichess account/)
    const games = await li.games('thibault', { max: 5 })
    expect(games.length).toBeGreaterThan(0)
    const cands = games.map((g) => candidateFromLichess(g, 'thibault'))
    for (const c of cands.filter((x) => !x.error)) {
      expect(c.game.meta.id).toMatch(/^li-[A-Za-z0-9]{8}$/)
      expect(c.game.ucis.length).toBeGreaterThan(0)
    }
    console.log(`lichess: ${games.length} games, ${cands.filter((c) => !c.error).length} importable, variants skipped: ${cands.filter((c) => c.error).length}`)
  }, 60_000)
})
