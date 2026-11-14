import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { engineCandidates } from '../src/main/engine/locate'
import { parseInfo, parseOption, UciEngine } from '../src/main/engine/uci'
import { engineConfigFor, getLevel, LEVELS } from '../src/shared/strength'
import { join } from 'node:path'

describe('UCI parsing', () => {
  it('parses info lines with cp, mate, multipv and pv', () => {
    expect(parseInfo('info depth 12 seldepth 18 multipv 2 score cp -34 nodes 1000 nps 1 pv e7e5 g1f3')).toEqual({
      depth: 12, multipv: 2, cp: -34, mate: undefined, pv: ['e7e5', 'g1f3']
    })
    expect(parseInfo('info depth 5 score mate -3 pv a1a2')?.mate).toBe(-3)
    expect(parseInfo('info depth 5 score cp 10 lowerbound pv a1a2')).toBeNull()
    expect(parseInfo('info currmove e2e4 currmovenumber 1')).toBeNull()
    expect(parseInfo('bestmove e2e4')).toBeNull()
  })

  it('parses option lines', () => {
    expect(parseOption('option name UCI_Elo type spin default 1320 min 1320 max 3190')).toEqual({
      name: 'UCI_Elo', type: 'spin', default: '1320', min: 1320, max: 3190
    })
    expect(parseOption('option name Skill Level type spin default 20 min 0 max 20')?.name).toBe('Skill Level')
    expect(parseOption('option name Clear Hash type button')?.type).toBe('button')
  })
})

// Integration with the real engine: uses the bundled copy (npm run engine) or any detected install.
const candidates = engineCandidates({ settingsPath: null, bundledDir: join(__dirname, '..', 'resources', 'engine') })
const enginePath = candidates[0]?.path
describe.skipIf(!enginePath)(`Stockfish integration (${enginePath ?? 'not found'})`, () => {
  it('handshakes, applies every difficulty level, and returns legal moves', async () => {
    const eng = await UciEngine.start(enginePath!)
    try {
      expect(eng.name).toMatch(/Stockfish/)
      const elo = eng.options.get('UCI_Elo')!
      const fen = new Chess().fen()
      for (const level of LEVELS) {
        const cfg = engineConfigFor(level, { min: elo.min!, max: elo.max! })
        for (const [n, v] of cfg.options) eng.setOption(n, v)
        await eng.isReady()
        const go = cfg.depth ? `depth ${cfg.depth} movetime 200` : 'movetime 150'
        const res = await eng.search(fen, go, 10_000)
        expect(res.bestmove, level.id).toMatch(/^[a-h][1-8][a-h][1-8]/)
        expect(new Chess(fen).moves({ verbose: true }).some((m) => m.from + m.to === res.bestmove!.slice(0, 4))).toBe(true)
        if (level.mode === 'custom') expect(res.lines.length).toBeGreaterThan(1)
      }
    } finally {
      eng.quit()
    }
  })

  it('analyses with MultiPV 2 and finds mate in one', async () => {
    const eng = await UciEngine.start(enginePath!)
    try {
      eng.setOption('MultiPV', '2')
      const res = await eng.search('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'movetime 300', 10_000)
      expect(res.bestmove).toBe('a1a8')
      expect(res.lines[0].mate).toBe(1)
      expect(res.lines).toHaveLength(2)
    } finally {
      eng.quit()
    }
  })

  it('rejects unknown options and non-engines with readable errors', async () => {
    const eng = await UciEngine.start(enginePath!)
    try {
      expect(() => eng.setOption('Definitely Not An Option', '1')).toThrow(/no option/)
    } finally {
      eng.quit()
    }
    await expect(UciEngine.start(join(__dirname, 'does-not-exist.exe'))).rejects.toThrow()
    await expect(UciEngine.start(process.execPath.replace(/node(\.exe)?$/i, 'node$1'), 1500)).rejects.toThrow()
  })

  it('getLevel rejects unknown ids', () => {
    expect(() => getLevel('nope')).toThrow()
  })
})
