import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { canCheckmate, formatLine, isPromotionMove, legalDests, positionKey, uciLineToSan } from '../src/shared/chessUtil'

describe('legal moves & special rules (chess.js + helpers)', () => {
  it('starting position has 20 legal moves and correct destinations', () => {
    const c = new Chess()
    expect(c.moves().length).toBe(20)
    expect(legalDests(c).get('g1')?.sort()).toEqual(['f3', 'h3'])
    expect(legalDests(c).get('e1')).toBeUndefined()
  })

  it('castles both sides and refuses castling through check', () => {
    const c = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    const kDest = legalDests(c).get('e1')!
    expect(kDest).toContain('g1')
    expect(kDest).toContain('c1')
    c.move('O-O')
    expect(c.get('g1')?.type).toBe('k')
    expect(c.get('f1')?.type).toBe('r')

    // Black bishop on c4 covers f1: white may not castle kingside.
    const d = new Chess('4k3/8/8/8/2b5/8/8/4K2R w K - 0 1')
    expect(legalDests(d).get('e1')).not.toContain('g1')
    // In check: no castling at all.
    const e = new Chess('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1')
    expect(legalDests(e).get('e1') ?? []).not.toContain('g1')
    expect(legalDests(e).get('e1') ?? []).not.toContain('c1')
  })

  it('loses castling rights after the rook moves', () => {
    const c = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
    c.move('Rh2')
    c.move('Ke7')
    c.move('Rh1')
    c.move('Ke8')
    expect(legalDests(c).get('e1')).not.toContain('g1')
    expect(legalDests(c).get('e1')).toContain('c1')
  })

  it('handles en passant only immediately after the double step', () => {
    const c = new Chess('4k3/8/8/4P3/8/8/3p4/4K3 b - - 0 1')
    c.load('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1')
    c.move('d5')
    const ep = c.moves({ verbose: true }).find((m) => m.from === 'e5' && m.to === 'd6')
    expect(ep?.isEnPassant()).toBe(true)
    c.move('exd6')
    expect(c.get('d5')).toBeUndefined()
    // One move later the capture is gone.
    const late = new Chess('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1')
    late.move('d5')
    late.move('Kd2')
    late.move('Ke7')
    expect(late.moves({ verbose: true }).some((m) => m.from === 'e5' && m.to === 'd6')).toBe(false)
  })

  it('promotes to any piece', () => {
    const c = new Chess('8/4P3/8/8/8/8/k7/4K3 w - - 0 1')
    expect(isPromotionMove(c, 'e7', 'e8')).toBe(true)
    expect(isPromotionMove(c, 'e1', 'e2')).toBe(false)
    const m = c.move({ from: 'e7', to: 'e8', promotion: 'n' })
    expect(m.san).toBe('e8=N')
    expect(c.get('e8')?.type).toBe('n')
  })

  it('detects checkmate, stalemate, insufficient material, threefold and 50-move', () => {
    const mate = new Chess()
    for (const m of ['f3', 'e5', 'g4', 'Qh4#']) mate.move(m)
    expect(mate.isCheckmate()).toBe(true)

    expect(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').isStalemate()).toBe(true)
    expect(new Chess('8/8/8/4k3/8/8/2B5/4K3 w - - 0 1').isInsufficientMaterial()).toBe(true)

    const rep = new Chess()
    for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) rep.move(m)
    expect(rep.isThreefoldRepetition()).toBe(true)

    expect(new Chess('4k3/8/8/8/8/8/8/R3K3 w - - 100 80').isDrawByFiftyMoves()).toBe(true)
  })

  it('knows who can still mate on flag fall', () => {
    expect(canCheckmate(new Chess('4k3/8/8/8/8/8/8/4K3 w - - 0 1'), 'w')).toBe(false)
    expect(canCheckmate(new Chess('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1'), 'w')).toBe(false)
    expect(canCheckmate(new Chess('4k3/8/8/8/8/8/8/1NN1K3 w - - 0 1'), 'w')).toBe(true)
    expect(canCheckmate(new Chess('4k3/8/8/8/8/8/P7/4K3 w - - 0 1'), 'w')).toBe(true)
  })

  it('converts engine lines to SAN and formats them', () => {
    const start = new Chess().fen()
    const san = uciLineToSan(start, ['e2e4', 'e7e5', 'g1f3', 'zzzz', 'b8c6'])
    expect(san).toEqual(['e4', 'e5', 'Nf3'])
    expect(formatLine(start, san)).toBe('1. e4 e5 2. Nf3')
    const afterE4 = new Chess()
    afterE4.move('e4')
    expect(formatLine(afterE4.fen(), ['e5', 'Nf3'])).toBe('1... e5 2. Nf3')
  })

  it('position keys ignore move counters', () => {
    expect(positionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(
      positionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 5 9')
    )
  })
})
