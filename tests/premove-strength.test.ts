import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { premoveDests, tryPremove } from '../src/shared/premove'
import { engineConfigFor, getLevel, LEVELS, lineCp, pickWeakMove } from '../src/shared/strength'
import { sanitizeSettings } from '../src/shared/settings'

describe('premoves', () => {
  it('offers geometric destinations ignoring blockers and turn', () => {
    const c = new Chess() // white to move; compute black premoves
    const knight = premoveDests(c, 'g8', 'b').sort()
    expect(knight).toEqual(['e7', 'f6', 'h6'])
    const pawn = premoveDests(c, 'e7', 'b').sort()
    expect(pawn).toEqual(['d6', 'e5', 'e6', 'f6'])
    // Bishop ray goes through its own pawns (they might move).
    expect(premoveDests(c, 'f8', 'b')).toContain('a3')
    // Not for opponent pieces.
    expect(premoveDests(c, 'e2', 'b')).toEqual([])
  })

  it('allows castling premoves only with rights and rook in place', () => {
    const c = new Chess('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1')
    expect(premoveDests(c, 'e1', 'w')).toEqual(expect.arrayContaining(['g1', 'c1']))
    const noRights = new Chess('r3k2r/8/8/8/8/8/8/R3K2R b kq - 0 1')
    expect(premoveDests(noRights, 'e1', 'w')).not.toContain('g1')
  })

  it('executes a premove only if legal when the turn arrives', () => {
    const c = new Chess()
    c.move('e4') // black to move now
    // White queued d2-d4 during black's turn.
    c.move('e5')
    expect(tryPremove(c, { from: 'd2', to: 'd4' }, 'w')).toBe('d4')
    // A premove that became illegal (destination blocked) is rejected.
    const d = new Chess()
    d.move('e4')
    d.move('e5')
    expect(tryPremove(d, { from: 'e4', to: 'e5' }, 'w')).toBeNull()
    // Wrong side to move.
    expect(tryPremove(new Chess(), { from: 'e7', to: 'e5' }, 'b')).toBeNull()
  })

  it('premove promotion uses the chosen piece', () => {
    const c = new Chess('8/4P3/8/8/8/8/k7/4K3 w - - 0 1')
    expect(tryPremove(c, { from: 'e7', to: 'e8', promotion: 'r' }, 'w')).toBe('e8=R')
  })
})

describe('difficulty configuration', () => {
  const range = { min: 1320, max: 3190 }

  it('every level produces a valid configuration', () => {
    for (const l of LEVELS) {
      const cfg = engineConfigFor(l, range)
      expect(cfg.multipv).toBeGreaterThanOrEqual(1)
      if (l.mode === 'limit') {
        expect(cfg.options).toContainEqual(['UCI_LimitStrength', 'true'])
        expect(cfg.options).toContainEqual(['UCI_Elo', String(l.elo)])
      } else {
        expect(cfg.options).toContainEqual(['UCI_LimitStrength', 'false'])
      }
      if (l.mode === 'custom') expect(cfg.depth).toBeGreaterThan(0)
    }
  })

  it('clamps out-of-range Elo with a warning instead of failing silently', () => {
    const cfg = engineConfigFor(getLevel('e2800'), { min: 1350, max: 2850 - 100 })
    expect(cfg.options).toContainEqual(['UCI_Elo', '2750'])
    expect(cfg.warnings[0]).toMatch(/2750/)
  })

  it('refuses Elo levels on engines without UCI_Elo, and unknown levels', () => {
    expect(() => engineConfigFor(getLevel('e1500'))).toThrow(/UCI_LimitStrength/)
    expect(() => engineConfigFor(getLevel('e1500'), { min: 3000, max: 1000 })).toThrow(/invalid/)
    expect(() => getLevel('e9999')).toThrow(/Unknown/)
    // Custom levels still work without UCI_Elo.
    expect(() => engineConfigFor(getLevel('e400'))).not.toThrow()
  })

  it('weak levels mostly pick good moves but sometimes worse ones', () => {
    const lines = [
      { multipv: 1, depth: 2, cp: 50, pv: ['e2e4'] },
      { multipv: 2, depth: 2, cp: 20, pv: ['d2d4'] },
      { multipv: 3, depth: 2, cp: -300, pv: ['g2g4'] }
    ]
    let seed = 1
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const counts: Record<string, number> = {}
    for (let i = 0; i < 2000; i++) {
      const m = pickWeakMove(lines, getLevel('e1000'), rand)!
      counts[m] = (counts[m] ?? 0) + 1
    }
    expect(counts['e2e4']).toBeGreaterThan(counts['d2d4'])
    expect(counts['d2d4']).toBeGreaterThan(counts['g2g4'] ?? 0)
    expect(counts['g2g4'] ?? 0).toBeGreaterThan(0) // oversights happen
    // Full-strength levels always take the top line.
    expect(pickWeakMove(lines, getLevel('full'), rand)).toBe('e2e4')
  })

  it('maps mate scores to large centipawn values', () => {
    expect(lineCp({ mate: 3 })).toBeGreaterThan(90_000)
    expect(lineCp({ mate: -2 })).toBeLessThan(-90_000)
    expect(lineCp({ mate: 1 })).toBeGreaterThan(lineCp({ mate: 5 }))
  })

  it('sanitises engine settings from disk', () => {
    const s = sanitizeSettings({ threads: 999, hashMb: 'lots', analysisMs: -1, theme: 'neon', enginePath: '  ' }, 8)
    expect(s.threads).toBe(8)
    expect(s.hashMb).toBe(128)
    expect(s.analysisMs).toBe(100)
    expect(s.theme).toBe('sage')
    expect(s.enginePath).toBeNull()
  })
})
