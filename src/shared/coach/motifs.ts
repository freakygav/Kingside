import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js'
import { parseUci } from '../chessUtil'
import type { Color } from '../types'
import { between, hangingPieces, NAME, other, pieces, pinsAgainst, VALUE, type Placed } from './features'

/**
 * Tactical facts about a single move, computed by playing it on a copy of the board.
 * Used to explain engine lines ("this knight move forks your king and rook") without inventing anything.
 */
export type MotifKind =
  | 'mate'
  | 'check'
  | 'doubleCheck'
  | 'capture'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discoveredAttack'
  | 'promotion'
  | 'castle'
  | 'develops'
  | 'hangsPiece'
  | 'removesDefender'
  | 'backRankMate'
  | 'threatensMate'

export interface Motif {
  kind: MotifKind
  /** Squares involved, for arrows/highlights. */
  squares: Square[]
  /** Short factual description (neutral wording; coaches rephrase by level). */
  text: string
  /** Pieces targeted, where relevant. */
  targets?: Placed[]
}

export interface MoveFacts {
  san: string
  uci: string
  from: Square
  to: Square
  piece: PieceSymbol
  color: Color
  captured: PieceSymbol | null
  motifs: Motif[]
}

const pieceAt = (p: Placed) => `${NAME[p.type]} on ${p.square}`

function attacksFrom(chess: Chess, sq: Square, byColor: Color): Placed[] {
  // Enemy pieces that the piece on `sq` attacks.
  return pieces(chess, other(byColor)).filter((t) => chess.attackers(t.square, byColor).includes(sq))
}

/** Play `uci` from `fen` and describe it. Returns null if the move is illegal. */
export function analyzeMove(fen: string, uci: string): MoveFacts | null {
  const mv = parseUci(uci)
  if (!mv) return null
  const before = new Chess(fen)
  const color = before.turn()
  const opp = other(color)
  let m: Move
  const after = new Chess(fen)
  try {
    m = after.move(mv)
  } catch {
    return null
  }
  const motifs: Motif[] = []
  const movedType = (m.promotion ?? m.piece) as PieceSymbol

  if (after.isCheckmate()) {
    const k = pieces(after, opp).find((p) => p.type === 'k')!
    // Back-rank mate: the check comes along the king's own (first) rank, and the king's
    // second-rank squares are blocked by its own pawns.
    const homeRank = opp === 'w' ? '1' : '8'
    const secondRank = opp === 'w' ? '2' : '7'
    const checkers = after.attackers(k.square, color)
    const alongRank = checkers.some((s) => s[1] === homeRank)
    const kf = k.square.charCodeAt(0)
    const shieldPawns = pieces(after, opp).filter((p) => p.type === 'p' && p.square[1] === secondRank && Math.abs(p.square.charCodeAt(0) - kf) <= 1).length
    const boxed = k.square[1] === homeRank && alongRank && shieldPawns >= 2
    motifs.push({ kind: boxed ? 'backRankMate' : 'mate', squares: [m.to, k.square], text: boxed ? 'back-rank checkmate' : 'checkmate' })
  } else if (after.inCheck()) {
    const k = pieces(after, opp).find((p) => p.type === 'k')!
    const checkers = after.attackers(k.square, color)
    if (checkers.length >= 2) motifs.push({ kind: 'doubleCheck', squares: [...checkers, k.square], text: 'double check' })
    else motifs.push({ kind: 'check', squares: [m.to, k.square], text: 'check' })
  }
  if (m.captured) {
    motifs.push({ kind: 'capture', squares: [m.to], text: `captures the ${NAME[m.captured as PieceSymbol]} on ${m.to}`, targets: [{ square: m.to, type: m.captured as PieceSymbol, color: opp }] })
    // Removing the defender: the captured piece was the only guard of another piece that is now hanging.
    const nowHanging = hangingPieces(after, opp).filter((h) => h.reason === 'undefended' && before.attackers(h.square, opp).includes(m.to))
    if (nowHanging.length) motifs.push({ kind: 'removesDefender', squares: [m.to, nowHanging[0].square], text: `removes the defender of the ${pieceAt(nowHanging[0])}`, targets: [nowHanging[0]] })
  }
  if (m.promotion) motifs.push({ kind: 'promotion', squares: [m.to], text: `promotes to a ${NAME[m.promotion as PieceSymbol]}` })
  if (m.isKingsideCastle() || m.isQueensideCastle()) motifs.push({ kind: 'castle', squares: [m.to], text: 'castles the king to safety' })
  if ((m.piece === 'n' || m.piece === 'b') && (m.from[1] === '1' || m.from[1] === '8') && !m.captured) motifs.push({ kind: 'develops', squares: [m.from, m.to], text: `develops the ${NAME[m.piece]}` })

  // Fork: the moved piece attacks two or more worthwhile targets (king counts) it can win.
  const attacked = attacksFrom(after, m.to, color).filter((t) => {
    if (t.type === 'k') return true
    const defended = after.attackers(t.square, opp).length > 0
    return VALUE[t.type] > VALUE[movedType] || (!defended && VALUE[t.type] >= 3)
  })
  if (attacked.length >= 2) {
    const tg = attacked.sort((a, b) => VALUE[b.type] - VALUE[a.type]).slice(0, 3)
    motifs.push({ kind: 'fork', squares: [m.to, ...tg.map((t) => t.square)], text: `forks the ${tg.map(pieceAt).join(' and the ')}`, targets: tg })
  }

  // Pins / skewers created by the moved slider.
  if (['b', 'r', 'q'].includes(movedType)) {
    for (const pin of pinsAgainst(after, opp)) {
      if (pin.by.square !== m.to) continue
      const wasPinned = pinsAgainst(before, opp).some((p) => p.pinned.square === pin.pinned.square && p.by.square === pin.by.square)
      if (!wasPinned) motifs.push({ kind: 'pin', squares: [m.to, pin.pinned.square, pin.behind.square], text: `pins the ${pieceAt(pin.pinned)} to the ${NAME[pin.behind.type]}`, targets: [pin.pinned] })
    }
    // Skewer: a more valuable piece (or king) attacked in front of a less valuable one on the same line.
    for (const front of attacksFrom(after, m.to, color)) {
      if (front.type !== 'k' && VALUE[front.type] <= VALUE[movedType] && front.type !== 'q') continue
      const df = Math.sign(front.square.charCodeAt(0) - m.to.charCodeAt(0))
      const dr = Math.sign(Number(front.square[1]) - Number(m.to[1]))
      let f = front.square.charCodeAt(0) - 97 + df
      let r = Number(front.square[1]) - 1 + dr
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const sq = `${String.fromCharCode(97 + f)}${r + 1}` as Square
        const pc = after.get(sq)
        if (pc) {
          if (pc.color === opp && pc.type !== 'k' && VALUE[pc.type] < VALUE[front.type] && between(m.to, sq).includes(front.square))
            motifs.push({ kind: 'skewer', squares: [m.to, front.square, sq], text: `skewers the ${pieceAt(front)}; the ${NAME[pc.type]} on ${sq} behind it falls`, targets: [front, { square: sq, type: pc.type, color: opp }] })
          break
        }
        f += df
        r += dr
      }
    }
  }

  // Discovered attack: another friendly piece now attacks something valuable through the vacated square.
  for (const ally of pieces(after, color)) {
    if (ally.square === m.to || !['b', 'r', 'q'].includes(ally.type)) continue
    for (const t of attacksFrom(after, ally.square, color)) {
      if (!between(ally.square, t.square).includes(m.from)) continue
      if (t.type === 'k' || VALUE[t.type] >= 3)
        motifs.push({ kind: 'discoveredAttack', squares: [ally.square, t.square, m.from], text: `uncovers an attack by the ${pieceAt(ally)} on the ${pieceAt(t)}`, targets: [t] })
    }
  }

  // The moved piece itself left en prise.
  const mine = hangingPieces(after, color).find((h) => h.square === m.to)
  if (mine && !after.isCheckmate()) motifs.push({ kind: 'hangsPiece', squares: [m.to, ...mine.attackers], text: `leaves the ${NAME[movedType]} on ${m.to} ${mine.reason === 'undefended' ? 'undefended' : 'attacked by a cheaper piece'}` })

  // Mate threat: if the opponent passed, could we mate next move?
  if (!after.isGameOver() && !after.inCheck()) {
    const parts = after.fen().split(' ')
    parts[1] = color
    parts[3] = '-'
    try {
      const probe = new Chess(parts.join(' '))
      const mate = probe.moves({ verbose: true }).find((x) => {
        const c = new Chess(probe.fen())
        c.move(x)
        return c.isCheckmate()
      })
      if (mate) motifs.push({ kind: 'threatensMate', squares: [mate.from, mate.to], text: `threatens ${mate.san} mate` })
    } catch {
      /* position not valid with sides swapped */
    }
  }

  return { san: m.san, uci, from: m.from, to: m.to, piece: m.piece as PieceSymbol, color, captured: (m.captured as PieceSymbol) ?? null, motifs }
}

/** Net material change for the side to move after playing `pv` (first `plies` moves), in pawns. */
export function materialSwing(fen: string, pv: string[], plies = 4): number {
  const c = new Chess(fen)
  const side = c.turn()
  let swing = 0
  for (const u of pv.slice(0, plies)) {
    const mv = parseUci(u)
    if (!mv) break
    let m: Move
    try {
      m = c.move(mv)
    } catch {
      break
    }
    const sign = m.color === side ? 1 : -1
    if (m.captured) swing += sign * VALUE[m.captured as PieceSymbol]
    if (m.promotion) swing += sign * (VALUE[m.promotion as PieceSymbol] - 1)
  }
  return swing
}

/** Pieces that `uci`'s moving piece was guarding before the move and that are left hanging after it. */
export function abandonedDuties(fen: string, uci: string): Placed[] {
  const mv = parseUci(uci)
  if (!mv) return []
  const before = new Chess(fen)
  const color = before.turn()
  const after = new Chess(fen)
  try {
    after.move(mv)
  } catch {
    return []
  }
  const guarded = pieces(before, color).filter((p) => p.square !== mv.from && before.attackers(p.square, color).includes(mv.from))
  const hangingAfter = new Set(hangingPieces(after, color).map((h) => h.square))
  return guarded.filter((g) => hangingAfter.has(g.square))
}
