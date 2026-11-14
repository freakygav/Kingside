import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EngineManager } from '../src/main/engine/manager'
import { engineCandidates } from '../src/main/engine/locate'
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/types'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const bundled = join(__dirname, '..', 'resources', 'engine')
const realEngine = engineCandidates({ settingsPath: null, bundledDir: bundled })[0]?.path

const saved = { PATH: process.env.PATH, LOCALAPPDATA: process.env.LOCALAPPDATA, KS: process.env.KINGSIDE_STOCKFISH }
afterEach(() => {
  process.env.PATH = saved.PATH
  process.env.LOCALAPPDATA = saved.LOCALAPPDATA
  if (saved.KS === undefined) delete process.env.KINGSIDE_STOCKFISH
  else process.env.KINGSIDE_STOCKFISH = saved.KS
})

function isolate() {
  const empty = mkdtempSync(join(tmpdir(), 'ks-empty-'))
  process.env.PATH = empty
  process.env.LOCALAPPDATA = empty
  delete process.env.KINGSIDE_STOCKFISH
  return empty
}

describe('EngineManager error handling', () => {
  it('reports a clear error when no engine exists anywhere', async () => {
    const empty = isolate()
    const m = new EngineManager(() => DEFAULT_SETTINGS, empty)
    const st = await m.detect()
    expect(st.ok).toBe(false)
    expect(st.error).toMatch(/Stockfish was not found/)
    await expect(m.play({ levelId: 'e1500', fen: START, movetimeMs: 100 })).rejects.toThrow(/not found/)
  })

  it('reports (and does not silently replace) a broken user-selected engine', async () => {
    const empty = isolate()
    const bogus = join(empty, 'stockfish-fake.exe')
    writeFileSync(bogus, 'not a program')
    const s: Settings = { ...DEFAULT_SETTINGS, enginePath: bogus }
    const m = new EngineManager(() => s, bundled)
    const st = await m.detect()
    expect(st.ok).toBe(false)
    expect(st.error).toMatch(/engine you selected/)
  })
})

describe.skipIf(!realEngine)('EngineManager with real Stockfish', () => {
  it('validates requests and recovers from an engine crash', async () => {
    const m = new EngineManager(() => DEFAULT_SETTINGS, bundled)
    const st = await m.detect()
    expect(st.ok).toBe(true)
    expect(st.eloMin).toBe(1320)
    try {
      await expect(m.play({ levelId: 'nope', fen: START, movetimeMs: 100 })).rejects.toThrow(/Unknown difficulty/)
      await expect(m.play({ levelId: 'e1500', fen: 'garbage', movetimeMs: 100 })).rejects.toThrow(/Invalid position/)
      await expect(m.analyze({ fen: START, multipv: 2, movetimeMs: Number.NaN })).rejects.toThrow(/Invalid search time/)

      const r1 = await m.play({ levelId: 'e1500', fen: START, movetimeMs: 100 })
      expect(r1.bestmove).toMatch(/^[a-h][1-8][a-h][1-8]/)

      // Kill the play engine behind the manager's back; the next request must restart it.
      ;(m as any).engines.play.proc.kill()
      await new Promise((r) => setTimeout(r, 300))
      const r2 = await m.play({ levelId: 'e400', fen: START, movetimeMs: 100 })
      expect(r2.bestmove).toBeTruthy()
      expect(r2.lines.length).toBeGreaterThan(1)

      const a = await m.analyze({ fen: START, multipv: 2, movetimeMs: 200 })
      expect(a.lines).toHaveLength(2)
    } finally {
      m.shutdown()
    }
  })
})
