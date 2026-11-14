import { Chess, type Square } from 'chess.js'
import { formatLine, parseUci, uciLineToSan } from '../chessUtil'
import type { OpeningMatch } from '../openings'
import { CLASS_LABEL, classifyMove, winProbability, type MoveClass } from '../review'
import { lineCp } from '../strength'
import type { AnalysisLine, Color } from '../types'
import type { Coach } from './coaches'
import {
  bishopPair, centerControl, development, gamePhase, hangingPieces, kingCatchesPawn, kingCentrality, kingSafety, kingSquare,
  material, NAME, opposition, other, outposts, overloadedDefenders, pawnStructure, pinsAgainst, rookActivity, sideName,
  VALUE, weakSquares, withSideToMove, type Placed
} from './features'
import { abandonedDuties, analyzeMove, materialSwing, type Motif, type MoveFacts } from './motifs'

export interface CoachArrow {
  from: Square
  to: Square
  color: 'best' | 'alt' | 'user'
}

export interface CoachMessage {
  paragraphs: string[]
  /** Labeled lines (variations, facts) shown under the text. */
  lines?: { label: string; text: string }[]
  arrows?: CoachArrow[]
  squares?: { square: Square; kind: 'good' | 'bad' | 'focus' }[]
}

export interface PositionContext {
  fen: string
  /** Engine lines for the side to move, best first (MultiPV). */
  lines: AnalysisLine[]
  opening?: OpeningMatch | null
  /** The side the user is playing/studying; "you" refers to this side. */
  perspective: Color
}

// ---------------------------------------------------------------------------------------------
// Wording helpers

type Tier = Coach['tier']
const simple = (t: Tier) => t <= 2
const mid = (t: Tier) => t >= 3 && t <= 4

function you(c: Color, ctx: { perspective: Color }, t: Tier, cap = false): string {
  const s = t >= 4 ? sideName(c) : c === ctx.perspective ? 'you' : 'your opponent'
  return cap ? s[0].toUpperCase() + s.slice(1) : s
}
function your(c: Color, ctx: { perspective: Color }, t: Tier): string {
  return t >= 4 ? `${sideName(c)}'s` : c === ctx.perspective ? 'your' : "your opponent's"
}
const piece = (p: Placed) => `${NAME[p.type]} on ${p.square}`

/** Side-to-move score -> white POV centipawns. */
function whiteCp(fen: string, line: AnalysisLine): number {
  const cp = lineCp(line)
  return fen.split(' ')[1] === 'w' ? cp : -cp
}

export function formatScore(whiteCentipawns: number): string {
  if (Math.abs(whiteCentipawns) >= 50_000) {
    const n = Math.max(1, Math.round((100_000 - Math.abs(whiteCentipawns)) / 100))
    return `${whiteCentipawns > 0 ? '' : '-'}M${n}`
  }
  const v = whiteCentipawns / 100
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`
}

/** Verbal evaluation for `forColor`, scaled to the coach. */
export function evalSentence(fen: string, line: AnalysisLine | undefined, forColor: Color, ctx: { perspective: Color }, t: Tier): string {
  if (!line) return 'I could not get an evaluation for this position.'
  const wcp = whiteCp(fen, line)
  const cp = forColor === 'w' ? wcp : -wcp
  const who = you(forColor, ctx, t, true)
  const mateIn = line.mate
  if (mateIn !== undefined && mateIn !== 0) {
    const stm = fen.split(' ')[1] as Color
    const winner: Color = mateIn > 0 ? stm : other(stm)
    const n = Math.abs(mateIn)
    if (simple(t)) return `${you(winner, ctx, t, true)} can force checkmate${n <= 3 ? ` in ${n} move${n > 1 ? 's' : ''}` : ''}!`
    return `${sideName(winner)} has a forced mate in ${n} (${formatScore(wcp)}).`
  }
  const ep = winProbability(cp)
  let words: string
  if (ep >= 0.9) words = simple(t) ? `${who} ${forColor === ctx.perspective && t < 4 ? 'are' : 'is'} winning` : `${who} ${forColor === ctx.perspective && t < 4 ? 'have' : 'has'} a decisive advantage`
  else if (ep >= 0.7) words = `${who} ${forColor === ctx.perspective && t < 4 ? 'are' : 'is'} clearly better`
  else if (ep >= 0.57) words = `${who} ${forColor === ctx.perspective && t < 4 ? 'are' : 'is'} slightly better`
  else if (ep > 0.43) words = 'the position is about equal'
  else if (ep > 0.3) words = `${who} ${forColor === ctx.perspective && t < 4 ? 'are' : 'is'} slightly worse`
  else if (ep > 0.1) words = `${who} ${forColor === ctx.perspective && t < 4 ? 'are' : 'is'} clearly worse`
  else words = `${who} ${forColor === ctx.perspective && t < 4 ? 'are' : 'is'} losing`
  words = words[0].toUpperCase() + words.slice(1)
  if (t === 1) return `${words}.`
  if (t === 2) {
    const pawns = Math.abs(cp) / 100
    return pawns >= 0.8 ? `${words} — roughly ${pawns >= 2.5 ? 'a piece' : pawns >= 1.6 ? 'two pawns' : 'a pawn'} worth of advantage${cp < 0 ? ' for the other side' : ''}.` : `${words}.`
  }
  if (mid(t)) return `${words} (${formatScore(wcp)}).`
  return `${words}: ${formatScore(wcp)} at depth ${line.depth}, an expected score of about ${Math.round(ep * 100)}% for ${sideName(forColor)}.`
}

function lineText(fen: string, pv: string[], plies: number): string {
  if (plies <= 0) return ''
  return formatLine(fen, uciLineToSan(fen, pv, plies))
}

function arrowsFor(fen: string, pv: string[], n: number, color: CoachArrow['color'] = 'best'): CoachArrow[] {
  return pv.slice(0, n).map((u, i) => {
    const m = parseUci(u)!
    return { from: m.from, to: m.to, color: i === 0 ? color : 'alt' }
  }).filter((a) => !!a.from && fen.length > 0)
}

/** Rephrase a motif for the coach's level. */
function motifSentence(m: Motif, facts: MoveFacts, ctx: PositionContext, t: Tier): string {
  const mover = facts.color
  switch (m.kind) {
    case 'mate':
      return simple(t) ? `${facts.san} is checkmate — the king has no escape!` : `${facts.san} is mate.`
    case 'backRankMate':
      return simple(t)
        ? `${facts.san} is checkmate on the back row: the king is stuck behind its own pawns.`
        : `${facts.san} delivers a back-rank mate; the king is boxed in by its own pawns.`
    case 'doubleCheck':
      return simple(t) ? `${facts.san} gives check with two pieces at once, so the king must move.` : `${facts.san} is a double check — only a king move is possible.`
    case 'check':
      return t === 1 ? `${facts.san} gives check.` : `${facts.san} comes with check, keeping the initiative.`
    case 'capture':
      return t === 1 ? `${facts.san} takes the ${NAME[facts.captured!]}.` : `${facts.san} ${m.text}.`
    case 'fork':
      return t === 1
        ? `${facts.san} attacks two things at once (${m.targets!.map((x) => x.type === 'k' ? 'the king' : `the ${NAME[x.type]}`).join(' and ')}). ${you(other(mover), ctx, t, true)} can only save one!`
        : t <= 3 ? `${facts.san} is a fork: it ${m.text.replace('forks', 'attacks')} at the same time.` : `${facts.san} ${m.text}; both can't be saved.`
    case 'pin':
      return t <= 2
        ? `${facts.san} pins a piece: the ${piece(m.targets![0])} can't move without exposing what's behind it.`
        : `${facts.san} ${m.text}.`
    case 'skewer':
      return t <= 2 ? `${facts.san} is a skewer: the front piece must move and the one behind it is lost.` : `${facts.san} ${m.text}.`
    case 'discoveredAttack':
      return t <= 2
        ? `${facts.san} moves out of the way and opens a hidden attack: ${m.text.replace('uncovers an attack by the', 'the')}.`
        : `${facts.san} is a discovered attack — it ${m.text}.`
    case 'promotion':
      return `${facts.san} ${m.text}.`
    case 'castle':
      return t <= 2 ? `${facts.san} castles, tucking the king away and connecting the rooks.` : `${facts.san} completes king safety and connects the rooks.`
    case 'develops':
      return t <= 2 ? `${facts.san} brings a new piece into the game.` : `${facts.san} ${m.text} toward the centre.`
    case 'hangsPiece':
      return t === 1 ? `Careful: after ${facts.san} that piece can be taken.` : `${facts.san} ${m.text}.`
    case 'removesDefender':
      return t <= 2 ? `${facts.san} takes away a defender, so another piece is left unprotected.` : `${facts.san} ${m.text}.`
    case 'threatensMate':
      return t <= 2 ? `${facts.san} creates a threat of checkmate next move.` : `${facts.san} ${m.text}.`
  }
}

/** The 1-2 most instructive motifs of a move, most important first. */
function keyMotifs(f: MoveFacts): Motif[] {
  const order: Motif['kind'][] = ['mate', 'backRankMate', 'doubleCheck', 'fork', 'skewer', 'pin', 'discoveredAttack', 'removesDefender', 'threatensMate', 'promotion', 'capture', 'check', 'castle', 'develops', 'hangsPiece']
  return [...f.motifs].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, 2)
}

function describeMove(fen: string, uci: string, ctx: PositionContext, t: Tier): string {
  const f = analyzeMove(fen, uci)
  if (!f) return ''
  const ms = keyMotifs(f).filter((m) => m.kind !== 'hangsPiece')
  if (ms.length === 0) return t <= 2 ? `${f.san} improves your position.` : `${f.san} is a quiet improving move.`
  return ms.map((m) => motifSentence(m, f, ctx, t)).join(' ')
}

// ---------------------------------------------------------------------------------------------
// Topics

export function explainEvaluation(ctx: PositionContext, coach: Coach): CoachMessage {
  const t = coach.tier
  const stm = ctx.fen.split(' ')[1] as Color
  const paragraphs = [evalSentence(ctx.fen, ctx.lines[0], ctx.perspective, ctx, t)]
  const m = material(new Chess(ctx.fen))
  const diff = ctx.perspective === 'w' ? m.w - m.b : m.b - m.w
  if (t <= 3 && diff !== 0) paragraphs.push(`On material ${diff > 0 ? `${you(ctx.perspective, ctx, t)} ${t < 4 ? 'are' : 'is'} up` : `${you(ctx.perspective, ctx, t)} ${t < 4 ? 'are' : 'is'} down`} ${Math.abs(diff)} point${Math.abs(diff) === 1 ? '' : 's'} (pawn = 1, knight/bishop = 3, rook = 5, queen = 9).`)
  if (t >= 4 && ctx.lines.length > 1 && ctx.lines[0].mate === undefined) {
    const gap = Math.abs(lineCp(ctx.lines[0]) - lineCp(ctx.lines[1])) / 100
    paragraphs.push(gap >= 1 ? `${sideName(stm)} has only one good continuation here: the second choice is ${gap.toFixed(2)} pawns worse.` : `${sideName(stm)} has several playable options (top two within ${gap.toFixed(2)}).`)
  }
  return { paragraphs }
}

export function explainSafety(ctx: PositionContext, coach: Coach): CoachMessage {
  const t = coach.tier
  const chess = new Chess(ctx.fen)
  const me = ctx.perspective
  const mine = hangingPieces(chess, me)
  const theirs = hangingPieces(chess, other(me))
  const paragraphs: string[] = []
  const squares: CoachMessage['squares'] = []
  if (mine.length === 0) paragraphs.push(t === 1 ? 'All of your pieces are safe right now — nothing can be taken for free.' : `${your(me, ctx, t)[0].toUpperCase() + your(me, ctx, t).slice(1)} pieces are all adequately protected.`)
  for (const h of mine.slice(0, 3)) {
    squares.push({ square: h.square, kind: 'bad' })
    if (t === 1) paragraphs.push(h.reason === 'undefended'
      ? `Your ${NAME[h.type]} on ${h.square} is not protected. Your opponent can capture it without losing anything in return.`
      : `Your ${NAME[h.type]} on ${h.square} can be taken by a smaller piece. Even if you take back, you lose more than you win.`)
    else if (t === 2) paragraphs.push(`The ${piece(h)} is hanging — attacked by ${h.attackers.join(', ')}${h.reason === 'undefended' ? ' and not defended at all' : ', and the attacker is worth less'}.`)
    else paragraphs.push(`${piece(h)[0].toUpperCase() + piece(h).slice(1)} is loose: ${h.attackers.length} attacker${h.attackers.length > 1 ? 's' : ''} (${h.attackers.join(', ')}) vs ${h.defenders.length} defender${h.defenders.length === 1 ? '' : 's'}${h.reason === 'attacked-by-cheaper' ? `, and the cheapest attacker is worth ${h.cheapest}` : ''}.`)
  }
  for (const h of theirs.slice(0, 2)) {
    squares.push({ square: h.square, kind: 'good' })
    paragraphs.push(t === 1 ? `Your opponent's ${NAME[h.type]} on ${h.square} is unprotected — can you capture it safely?` : `Target: the ${piece(h)} is ${h.reason === 'undefended' ? 'undefended' : 'attacked by a cheaper piece'}.`)
  }
  if (t >= 4) {
    for (const o of overloadedDefenders(chess, me)) paragraphs.push(`${your(me, ctx, t)[0].toUpperCase() + your(me, ctx, t).slice(1)} ${piece(o.defender)} is overloaded: it is the only defender of ${o.duties.map(piece).join(' and ')}. It cannot keep both duties if one is attacked again.`)
    for (const p of pinsAgainst(chess, me).slice(0, 2)) paragraphs.push(`The ${piece(p.pinned)} is ${p.absolute ? 'absolutely' : 'relatively'} pinned by the ${piece(p.by)} against the ${NAME[p.behind.type]}.`)
  } else if (t >= 2) {
    for (const p of pinsAgainst(chess, me).slice(0, 1)) paragraphs.push(`Watch out: your ${piece(p.pinned)} is pinned to your ${NAME[p.behind.type]} by the ${piece(p.by)}.`)
  }
  return { paragraphs, squares }
}

export function explainCandidates(ctx: PositionContext, coach: Coach): CoachMessage {
  const t = coach.tier
  const n = Math.min(coach.candidates, ctx.lines.length)
  if (n === 0) return { paragraphs: ['There are no legal moves in this position.'] }
  const stm = ctx.fen.split(' ')[1] as Color
  const lines: CoachMessage['lines'] = []
  const paragraphs: string[] = []
  if (t === 1) {
    const best = ctx.lines[0]
    const san = uciLineToSan(ctx.fen, best.pv, 1)[0]
    paragraphs.push(`My suggestion for ${you(stm, ctx, t)}: **${san}**.`)
    paragraphs.push(describeMove(ctx.fen, best.pv[0], ctx, t))
  } else {
    paragraphs.push(t <= 3 ? `Here are the moves I would look at first for ${you(stm, ctx, t)}:` : `Main candidates for ${sideName(stm)}:`)
    for (const l of ctx.lines.slice(0, n)) {
      const san = uciLineToSan(ctx.fen, l.pv, 1)[0]
      const why = describeMove(ctx.fen, l.pv[0], ctx, t)
      const score = t >= 3 ? ` (${formatScore(whiteCp(ctx.fen, l))})` : ''
      const cont = coach.pvPlies > 1 ? lineText(ctx.fen, l.pv, coach.pvPlies) : ''
      lines.push({ label: `${san}${score}`, text: `${why}${cont ? ` Line: ${cont}` : ''}` })
    }
    if (t >= 5 && ctx.lines.length > 1) {
      const gap = (lineCp(ctx.lines[0]) - lineCp(ctx.lines[1])) / 100
      paragraphs.push(gap > 0.3 ? `${uciLineToSan(ctx.fen, ctx.lines[0].pv, 1)[0]} is objectively strongest; the alternatives concede at least ${gap.toFixed(2)}.` : 'The top moves are close; choose the one whose plan you understand best.')
    }
  }
  return { paragraphs, lines, arrows: arrowsFor(ctx.fen, ctx.lines.slice(0, n).map((l) => l.pv[0]), n) }
}

/** Threats the opponent would have if it were their move (captures that win material, mates). */
function opponentThreats(fen: string, me: Color): { san: string; text: string; from: Square; to: Square }[] {
  const probe = withSideToMove(fen, other(me))
  if (!probe) return []
  const out: { san: string; text: string; from: Square; to: Square }[] = []
  for (const m of probe.moves({ verbose: true })) {
    const c = new Chess(probe.fen())
    c.move(m)
    if (c.isCheckmate()) out.push({ san: m.san, text: `${m.san} would be checkmate`, from: m.from, to: m.to })
    else if (m.captured) {
      const gain = VALUE[m.captured as keyof typeof VALUE] - (c.attackers(m.to, me).length > 0 ? VALUE[m.piece as keyof typeof VALUE] : 0)
      if (gain >= 2) out.push({ san: m.san, text: `${m.san} would win your ${NAME[m.captured as keyof typeof NAME]}`, from: m.from, to: m.to })
    }
  }
  return out.slice(0, 3)
}

export function explainThinking(ctx: PositionContext, coach: Coach): CoachMessage {
  const t = coach.tier
  const chess = new Chess(ctx.fen)
  const stm = chess.turn()
  const paragraphs: string[] = []
  const squares: CoachMessage['squares'] = []
  const arrows: CoachArrow[] = []
  if (chess.inCheck()) paragraphs.push(t === 1 ? 'Your king is in check! First you must get out of check: move the king, block, or capture the checking piece.' : 'You are in check, so the only question is how to meet it: move, block or capture.')
  const threats = opponentThreats(ctx.fen, stm)
  if (threats.length) {
    paragraphs.push(t === 1 ? `First, look at what your opponent wants to do. ${threats[0].text}.` : `Threat check: ${threats.map((x) => x.text).join('; ')}.`)
    for (const th of threats.slice(0, 2)) arrows.push({ from: th.from, to: th.to, color: 'user' })
  } else paragraphs.push(t === 1 ? 'Your opponent has no immediate threat, so you can think about your own plan.' : 'No immediate threats against you, so you have time to improve your position.')
  const mine = hangingPieces(chess, stm)
  if (mine.length) {
    squares.push(...mine.map((h) => ({ square: h.square, kind: 'bad' as const })))
    paragraphs.push(t === 1 ? `Make sure your ${NAME[mine[0].type]} on ${mine[0].square} is safe.` : `Fix the loose ${piece(mine[0])} first.`)
  }
  const targets = hangingPieces(chess, other(stm))
  if (targets.length) {
    squares.push(...targets.map((h) => ({ square: h.square, kind: 'good' as const })))
    paragraphs.push(t === 1 ? `Is there something you can capture for free? Look at the ${piece(targets[0])}.` : `Opportunity: the ${piece(targets[0])} is a target.`)
  }
  if (t >= 2) paragraphs.push(t <= 3 ? 'Then go through your checks, captures and threats — forcing moves first.' : 'Scan forcing moves (checks, captures, threats) before quiet plans.')

  const phase = gamePhase(chess)
  if (phase === 'opening') {
    const dev = development(chess, stm)
    if (dev.undeveloped.length >= 2) paragraphs.push(t <= 2 ? `You still have ${dev.undeveloped.length} knights/bishops at home. Bring them out before moving the same piece twice.` : `Development: ${dev.undeveloped.map(piece).join(', ')} still undeveloped.`)
    if (!dev.castled && (kingSafety(chess, stm).canCastle.k || kingSafety(chess, stm).canCastle.q)) paragraphs.push(t <= 2 ? 'Get your king safe by castling soon.' : 'Castling is still pending; king safety comes before ambitious plans.')
    const cc = centerControl(chess, stm)
    if (cc.occupied.length === 0 && t <= 3) paragraphs.push('Try to control the centre squares (d4, e4, d5, e5) with pawns and pieces.')
  } else if (phase === 'middlegame') {
    if (t >= 2) {
      const ra = rookActivity(chess, stm)
      if (ra.freeFiles.length && ra.onOpen.length === 0) paragraphs.push(t <= 3 ? `Your rooks would like an open file: the ${ra.freeFiles.slice(0, 2).join('/')}-file${ra.freeFiles.length > 1 ? 's are' : ' is'} available.` : `Rook activity: ${ra.freeFiles.slice(0, 2).join('/')}-file${ra.freeFiles.length > 1 ? 's are' : ' is'} open for your rooks.`)
    }
    if (t >= 3) {
      const op = outposts(chess, stm)
      if (op.length) {
        paragraphs.push(`Outpost${op.length > 1 ? 's' : ''} available: ${op.slice(0, 3).join(', ')} — a knight there can't be chased by pawns.`)
        squares.push(...op.slice(0, 3).map((s) => ({ square: s, kind: 'focus' as const })))
      }
      const ps = pawnStructure(chess, other(stm))
      const weak = [...ps.isolated, ...ps.backward]
      if (weak.length) paragraphs.push(`Targets in ${your(other(stm), ctx, t)} structure: ${ps.isolated.length ? `isolated pawn${ps.isolated.length > 1 ? 's' : ''} on ${ps.isolated.join(', ')}` : ''}${ps.isolated.length && ps.backward.length ? '; ' : ''}${ps.backward.length ? `backward pawn${ps.backward.length > 1 ? 's' : ''} on ${ps.backward.join(', ')}` : ''}.`)
    }
    const ks = kingSafety(chess, other(stm))
    if (t >= 3 && ks.attackedNear >= 3) paragraphs.push(`The enemy king is short of air: ${ks.attackedNear} squares around it are already covered by your pieces.`)
  } else {
    paragraphs.push(t <= 2 ? 'In the endgame your king becomes a strong piece — bring it toward the centre and push passed pawns.' : 'Endgame priorities: king activity, passed pawns, and rook behind passed pawns.')
  }
  if (ctx.lines[0]) {
    const f = analyzeMove(ctx.fen, ctx.lines[0].pv[0])
    if (f) {
      const idea = keyMotifs(f)[0]
      if (t <= 2) paragraphs.push(`Hint: the strongest idea involves your ${NAME[f.piece]}${idea && ['fork', 'pin', 'skewer', 'discoveredAttack', 'mate', 'backRankMate', 'capture', 'check'].includes(idea.kind) ? ` and it's a ${idea.kind === 'discoveredAttack' ? 'discovered attack' : idea.kind === 'backRankMate' ? 'checkmate' : idea.kind}` : ''}.`)
      else paragraphs.push(`The engine's main idea starts with the ${NAME[f.piece]} on ${f.from}${idea ? ` (${idea.kind === 'discoveredAttack' ? 'discovered attack' : idea.kind})` : ''}. Ask for candidate moves if you want the details.`)
    }
  }
  return { paragraphs, squares, arrows }
}

export function explainTactics(ctx: PositionContext, coach: Coach): CoachMessage {
  const t = coach.tier
  const best = ctx.lines[0]
  if (!best) return { paragraphs: ['There is nothing to calculate: the game is over in this position.'] }
  const stm = ctx.fen.split(' ')[1] as Color
  const paragraphs: string[] = []
  const lines: CoachMessage['lines'] = []
  // Walk the first plies of the main line and collect real motifs.
  const c = new Chess(ctx.fen)
  const depth = Math.min(best.pv.length, Math.max(3, coach.pvPlies))
  let found = 0
  for (let i = 0; i < depth; i++) {
    const fen = c.fen()
    const f = analyzeMove(fen, best.pv[i])
    if (!f) break
    const ms = keyMotifs(f).filter((m) => !['develops', 'castle', 'hangsPiece'].includes(m.kind))
    if (ms.length && (i % 2 === 0 || t >= 4)) {
      found++
      lines.push({ label: `${i % 2 === 0 ? sideName(stm) : sideName(other(stm))} ${f.san}`, text: ms.map((m) => motifSentence(m, f, ctx, t)).join(' ') })
    }
    c.move(parseUci(best.pv[i])!)
  }
  const swing = materialSwing(ctx.fen, best.pv, 6)
  if (found === 0) {
    paragraphs.push(t <= 2 ? "There's no quick trick here. Improve your pieces and stay alert for your opponent's threats." : 'No forcing tactic in the main line — this is a manoeuvring position. The engine prefers a quiet improvement.')
  } else {
    paragraphs.push(t === 1 ? 'Here is the trick in this position:' : t <= 3 ? 'The tactical idea in the main line:' : 'Tactical content of the principal variation:')
  }
  if (swing >= 2) paragraphs.push(t === 1 ? `If played correctly, ${you(stm, ctx, t)} win${stm === ctx.perspective ? '' : 's'} material — about ${swing} point${swing > 1 ? 's' : ''} worth.` : `Net result of the line: ${sideName(stm)} gains ${swing} point${swing > 1 ? 's' : ''} of material.`)
  if (best.mate !== undefined && best.mate > 0) paragraphs.push(t <= 2 ? `It ends in checkmate in ${best.mate}.` : `It is a forced mate in ${best.mate}.`)
  if (coach.pvPlies > 0) lines.push({ label: 'Line', text: lineText(ctx.fen, best.pv, Math.max(coach.pvPlies, 2)) })
  const threats = opponentThreats(ctx.fen, stm)
  if (threats.length) paragraphs.push(`Defensive note: ${threats[0].text} if ${you(stm, ctx, t)} ignore${stm === ctx.perspective && t < 4 ? '' : 's'} it.`)
  return { paragraphs, lines, arrows: arrowsFor(ctx.fen, best.pv, t <= 2 ? 1 : 2) }
}

export function explainOpening(ctx: PositionContext, coach: Coach): CoachMessage {
  const t = coach.tier
  const chess = new Chess(ctx.fen)
  const paragraphs: string[] = []
  if (ctx.opening) paragraphs.push(t <= 2 ? `This is the ${ctx.opening.name}.` : `${ctx.opening.eco} ${ctx.opening.name}, reached via ${ctx.opening.pgn}.`)
  else paragraphs.push('This position is not in my opening database, so I will judge it by general principles instead of by name.')
  for (const c of ['w', 'b'] as Color[]) {
    const dev = development(chess, c)
    const cc = centerControl(chess, c)
    const ks = kingSafety(chess, c)
    const bits: string[] = []
    bits.push(dev.undeveloped.length === 0 ? 'all minor pieces developed' : `${4 - dev.undeveloped.length}/4 minor pieces developed`)
    bits.push(ks.castled ? 'king castled' : ks.canCastle.k || ks.canCastle.q ? 'not castled yet' : 'cannot castle any more')
    if (t >= 2) bits.push(`${cc.occupied.length} centre square${cc.occupied.length === 1 ? '' : 's'} occupied, ${cc.attacks} centre attack${cc.attacks === 1 ? '' : 's'}`)
    if (t >= 3 && dev.queenMoved && dev.undeveloped.length >= 2) bits.push('queen out early')
    paragraphs.push(`${your(c, ctx, t)[0].toUpperCase() + your(c, ctx, t).slice(1)} side: ${bits.join(', ')}.`)
  }
  if (t <= 2) paragraphs.push('Opening rules of thumb: control the centre, develop knights and bishops, castle early, and don\'t move the same piece twice without a reason.')
  if (t >= 4) {
    const ps = pawnStructure(chess, ctx.perspective)
    if (ps.isolated.length) paragraphs.push(`Structure: ${your(ctx.perspective, ctx, t)} isolated pawn on ${ps.isolated.join(', ')} gives piece activity in return for a long-term target.`)
    if (bishopPair(chess, ctx.perspective) !== bishopPair(chess, other(ctx.perspective))) paragraphs.push(`${bishopPair(chess, ctx.perspective) ? sideName(ctx.perspective) : sideName(other(ctx.perspective))} has the bishop pair — a lasting asset if the position opens.`)
  }
  if (ctx.lines[0]) {
    const san = uciLineToSan(ctx.fen, ctx.lines[0].pv, 1)[0]
    paragraphs.push(`${t <= 2 ? 'A good move here is' : 'Engine choice:'} **${san}**. ${describeMove(ctx.fen, ctx.lines[0].pv[0], ctx, t)}`)
  }
  return { paragraphs, arrows: ctx.lines[0] ? arrowsFor(ctx.fen, ctx.lines[0].pv, 1) : [] }
}

export function explainEndgame(ctx: PositionContext, coach: Coach): CoachMessage {
  const t = coach.tier
  const chess = new Chess(ctx.fen)
  const stm = chess.turn()
  const m = material(chess)
  const paragraphs: string[] = []
  const squares: CoachMessage['squares'] = []
  const phase = gamePhase(chess)
  if (phase !== 'endgame') paragraphs.push(t <= 2 ? "We're not in the endgame yet — there's still a lot of material on the board. Here's what to keep in mind for later:" : 'Strictly speaking this is not an endgame yet, but here are the endgame-relevant factors:')
  const kinds = (c: Color) => (['q', 'r', 'b', 'n'] as const).filter((p) => m.counts[c][p] > 0)
  const all = new Set([...kinds('w'), ...kinds('b')])
  const type = all.size === 0 ? 'pawn' : all.size === 1 && all.has('r') ? 'rook' : all.size === 1 && all.has('q') ? 'queen' : [...all].every((k) => k === 'b' || k === 'n') ? 'minor-piece' : 'mixed'
  const typeName: Record<string, string> = { pawn: 'king and pawn', rook: 'rook', queen: 'queen', 'minor-piece': 'minor-piece', mixed: 'mixed-material' }
  paragraphs.push(`Type: ${typeName[type]} ending. Material: ${sideName('w')} ${m.w}, ${sideName('b')} ${m.b}.`)
  for (const c of ['w', 'b'] as Color[]) {
    const ps = pawnStructure(chess, c)
    if (!ps.passed.length) continue
    squares.push(...ps.passed.map((s) => ({ square: s, kind: (c === ctx.perspective ? 'good' : 'bad') as 'good' | 'bad' })))
    const ek = kingSquare(chess, other(c))
    const onlyKings = m.nonPawn.w + m.nonPawn.b === 0
    const runner = onlyKings ? ps.passed.find((p) => !kingCatchesPawn(p, c, ek, stm)) : undefined
    paragraphs.push(`${your(c, ctx, t)[0].toUpperCase() + your(c, ctx, t).slice(1)} passed pawn${ps.passed.length > 1 ? 's' : ''}: ${ps.passed.join(', ')}.${runner ? (t <= 2 ? ` The pawn on ${runner} can't be caught by the king — just push it!` : ` By the rule of the square, the pawn on ${runner} cannot be caught by the enemy king.`) : ''}`)
  }
  const wk = kingSquare(chess, 'w')
  const bk = kingSquare(chess, 'b')
  const act = (s: Square) => (kingCentrality(s) <= 1 ? 'active' : kingCentrality(s) >= 2.5 ? 'passive' : 'fairly active')
  paragraphs.push(t <= 2 ? `King activity: White's king is ${act(wk)}, Black's king is ${act(bk)}. In endgames the king should march toward the action.` : `King activity — White ${wk} (${act(wk)}), Black ${bk} (${act(bk)}).`)
  if (type === 'pawn') {
    const op = opposition(chess)
    if (op) paragraphs.push(t <= 2 ? `The kings are face to face. ${sideName(op.has)} has the opposition — the other king has to step aside.` : `${sideName(op.has)} holds the direct opposition (${op.kind}); with the move, ${sideName(stm)} must yield ground.`)
    else if (t >= 3) paragraphs.push('No direct opposition right now; count tempi and look for the key squares in front of the pawn.')
  }
  if (type === 'rook' && t >= 3) {
    const ra = rookActivity(chess, stm)
    paragraphs.push(t >= 4 ? 'Rook endings: rooks belong behind passed pawns; the defending side aims for the Philidor (third-rank) defence, the attacker for a Lucena bridge once the pawn reaches the 7th.' : 'In rook endings, keep your rook active and put it behind passed pawns.')
    if (ra.onOpen.length) paragraphs.push(`${sideName(stm)}'s rook is already on an open file (${ra.onOpen.join(', ')}).`)
  }
  if (ctx.lines[0]) {
    paragraphs.push(evalSentence(ctx.fen, ctx.lines[0], ctx.perspective, ctx, t))
    const san = uciLineToSan(ctx.fen, ctx.lines[0].pv, 1)[0]
    paragraphs.push(`${t <= 2 ? 'Best move:' : 'Precise move:'} **${san}**. ${describeMove(ctx.fen, ctx.lines[0].pv[0], ctx, t)}${coach.pvPlies > 2 ? ` Line: ${lineText(ctx.fen, ctx.lines[0].pv, coach.pvPlies)}` : ''}`)
  }
  return { paragraphs, squares, arrows: ctx.lines[0] ? arrowsFor(ctx.fen, ctx.lines[0].pv, 1) : [] }
}

export interface MoveJudgement extends CoachMessage {
  cls: MoveClass | null
  loss: number
  /** Short tags for the improvement plan (e.g. "hanging", "allowedFork"). */
  tags: string[]
}

/**
 * Judge a move with real engine data: `before` = lines for the position before the move,
 * `after` = lines for the position after it (opponent to move).
 */
export function judgeMove(fenBefore: string, uci: string, before: AnalysisLine[], after: AnalysisLine[], ctxBase: { perspective: Color; prevLoss?: number; prevMoverEp?: number | null; isBook?: boolean }, coach: Coach): MoveJudgement {
  const t = coach.tier
  const facts = analyzeMove(fenBefore, uci)
  if (!facts) return { paragraphs: [`${uci} is not a legal move in this position.`], cls: null, loss: 0, tags: [] }
  const ctx: PositionContext = { fen: fenBefore, lines: before, perspective: ctxBase.perspective }
  const afterChess = new Chess(fenBefore)
  afterChess.move(parseUci(uci)!)
  const fenAfter = afterChess.fen()
  const legal = new Chess(fenBefore).moves().length
  const terminal = afterChess.isCheckmate() ? 'checkmate' : afterChess.isDraw() || afterChess.isStalemate() ? 'draw' : undefined
  const r = classifyMove({
    ply: 0,
    move: { san: facts.san, uci, color: facts.color },
    before: { fen: fenBefore, lines: before },
    after: { fen: fenAfter, lines: after, terminal },
    legalMoves: legal,
    isBook: !!ctxBase.isBook,
    prevLoss: ctxBase.prevLoss ?? 0,
    prevMoverEp: ctxBase.prevMoverEp ?? null,
    prevUci: null
  })
  const tags: string[] = []
  const paragraphs: string[] = []
  const lines: CoachMessage['lines'] = []
  const arrows: CoachArrow[] = []
  const label = r.cls ? CLASS_LABEL[r.cls] : 'Move'
  const bad = r.cls === 'inaccuracy' || r.cls === 'mistake' || r.cls === 'blunder' || r.cls === 'miss'
  const mover = facts.color
  const head = t === 1
    ? bad ? `${facts.san} was not a good move.` : r.cls === 'best' || r.cls === 'great' || r.cls === 'brilliant' ? `${facts.san} — great move!` : `${facts.san} is fine.`
    : `${facts.san}: ${label.toLowerCase()}${t >= 3 ? ` (${formatScore(whiteCp(fenBefore, before[0] ?? { multipv: 1, depth: 0, cp: 0, pv: [] }))} → ${after[0] ? formatScore(whiteCp(fenAfter, after[0])) : terminal === 'checkmate' ? 'mate' : '0.00'})` : ''}.`
  paragraphs.push(head)

  // What the move itself does.
  const positives = keyMotifs(facts).filter((m) => m.kind !== 'hangsPiece')
  if (positives.length && !bad) paragraphs.push(positives.map((m) => motifSentence(m, facts, ctx, t)).join(' '))

  if (bad) {
    // Duties abandoned by the moved piece.
    const lost = abandonedDuties(fenBefore, uci)
    if (lost.length) {
      tags.push('defenseRemoved')
      paragraphs.push(t === 1
        ? `Your ${NAME[facts.piece]} was protecting your ${NAME[lost[0].type]} on ${lost[0].square}. When it moved away, that ${NAME[lost[0].type]} was left unprotected.`
        : t <= 3 ? `Moving the ${NAME[facts.piece]} from ${facts.from} abandoned the defence of the ${piece(lost[0])}.` : `The ${NAME[facts.piece]} left ${facts.from}, where it was the only guard of the ${piece(lost[0])}.`)
    }
    if (facts.motifs.some((m) => m.kind === 'hangsPiece')) {
      tags.push('hanging')
      paragraphs.push(t === 1 ? `On ${facts.to} your ${NAME[facts.piece]} can be captured and you can't win it back.` : `The ${NAME[facts.piece]} on ${facts.to} is left en prise.`)
    }
    // The refutation: opponent's best reply in the position after the move.
    const reply = after[0]
    if (reply?.pv[0]) {
      const rf = analyzeMove(fenAfter, reply.pv[0])
      if (rf) {
        const rm = keyMotifs(rf).filter((m) => m.kind !== 'hangsPiece' && m.kind !== 'develops')
        const swing = -materialSwing(fenAfter, reply.pv, 4)
        for (const m of rm) {
          if (m.kind === 'fork') tags.push('allowedFork')
          else if (m.kind === 'pin') tags.push('allowedPin')
          else if (m.kind === 'skewer') tags.push('allowedSkewer')
          else if (m.kind === 'discoveredAttack') tags.push('allowedDiscovery')
          else if (m.kind === 'backRankMate') tags.push('backRank')
          else if (m.kind === 'mate' || m.kind === 'threatensMate') tags.push('kingSafety')
          else if (m.kind === 'capture' && !tags.includes('hanging')) tags.push('hanging')
        }
        const replyText = rm.length ? rm.map((m) => motifSentence(m, rf, { ...ctx, fen: fenAfter }, t)).join(' ') : `${rf.san} is the strongest reply.`
        paragraphs.push(t === 1 ? `Your opponent can answer with ${rf.san}. ${replyText}` : `The refutation is ${rf.san}: ${replyText}`)
        if (reply.mate !== undefined && reply.mate > 0) paragraphs.push(t <= 2 ? `That leads to checkmate.` : `It forces mate in ${reply.mate}.`)
        else if (swing <= -2) paragraphs.push(t === 1 ? `You would lose about ${-swing} points of material.` : `Material after the forcing line: ${swing} for ${sideName(mover)}.`)
        arrows.push({ from: rf.from, to: rf.to, color: 'user' })
        if (coach.pvPlies > 0) lines.push({ label: 'After your move', text: lineText(fenAfter, reply.pv, Math.max(2, coach.pvPlies)) })
      }
    }
    if (r.cls === 'miss') tags.push('missedWin')
    // What was better.
    const best = before[0]
    if (best?.pv[0] && best.pv[0] !== uci) {
      const bf = analyzeMove(fenBefore, best.pv[0])
      if (bf) {
        const bm = keyMotifs(bf).filter((m) => m.kind !== 'hangsPiece')
        for (const m of bm) if (['fork', 'pin', 'skewer', 'discoveredAttack', 'mate', 'backRankMate'].includes(m.kind)) tags.push(`missed${m.kind[0].toUpperCase()}${m.kind.slice(1)}`)
        paragraphs.push(`${t === 1 ? 'A better move was' : 'Better was'} **${bf.san}**. ${bm.length ? bm.map((m) => motifSentence(m, bf, ctx, t)).join(' ') : ''}`.trim())
        arrows.unshift({ from: bf.from, to: bf.to, color: 'best' })
        if (coach.pvPlies > 0) lines.push({ label: 'Best line', text: lineText(fenBefore, best.pv, Math.max(2, coach.pvPlies)) })
      }
    }
    if (tags.length === 0) tags.push(gamePhase(new Chess(fenBefore)) === 'endgame' ? 'endgameTechnique' : 'positional')
  } else if (r.cls !== 'best' && r.cls !== 'book' && r.cls !== 'forced' && before[0]?.pv[0] && before[0].pv[0] !== uci && t >= 2) {
    const bs = uciLineToSan(fenBefore, before[0].pv, 1)[0]
    paragraphs.push(t >= 4 ? `Marginally stronger was ${bs} (${formatScore(whiteCp(fenBefore, before[0]))}).` : `${bs} was a little more precise.`)
  }
  return { paragraphs, lines, arrows, cls: r.cls, loss: r.loss, tags: [...new Set(tags)] }
}

/** Short overview used when a question isn't recognised. */
export function explainOverview(ctx: PositionContext, coach: Coach): CoachMessage {
  const ev = explainEvaluation(ctx, coach)
  const safety = explainSafety(ctx, coach)
  return { paragraphs: [...ev.paragraphs, ...safety.paragraphs.slice(0, 2)], squares: safety.squares }
}

export type CoachTopic = 'overview' | 'evaluation' | 'safety' | 'candidates' | 'thinking' | 'tactics' | 'opening' | 'endgame'

export function explainTopic(topic: CoachTopic, ctx: PositionContext, coach: Coach): CoachMessage {
  switch (topic) {
    case 'evaluation': return explainEvaluation(ctx, coach)
    case 'safety': return explainSafety(ctx, coach)
    case 'candidates': return explainCandidates(ctx, coach)
    case 'thinking': return explainThinking(ctx, coach)
    case 'tactics': return explainTactics(ctx, coach)
    case 'opening': return explainOpening(ctx, coach)
    case 'endgame': return explainEndgame(ctx, coach)
    default: return explainOverview(ctx, coach)
  }
}

export interface ParsedQuestion {
  topic: CoachTopic | 'move' | 'lastMove'
  /** SAN/UCI the question mentions, for "why is Nf3 good?". */
  move?: string
}

/**
 * Keyword-based question understanding. The coach is not a chatbot: it recognises these topics
 * and always answers from the current position's analysis.
 */
export function parseQuestion(q: string, fen: string): ParsedQuestion {
  const text = q.trim()
  const lower = text.toLowerCase()
  const chess = new Chess(fen)
  const legal = chess.moves({ verbose: true })
  const tokens = text.replace(/[?!.,;:]/g, ' ').split(/\s+/).filter(Boolean)
  for (const tok of tokens) {
    const norm = tok.replace(/^\d+\.+/, '')
    const hit = legal.find((m) => m.san === norm || m.san.replace(/[+#]/g, '') === norm.replace(/[+#]/g, '') || m.lan === norm.toLowerCase() || `${m.from}${m.to}` === norm.toLowerCase())
    if (hit) return { topic: 'move', move: hit.from + hit.to + (hit.promotion ?? '') }
  }
  if (/\b(last|my) move\b|\bthat move\b|\bwhat i (just )?played\b/.test(lower)) return { topic: 'lastMove' }
  if (/candidate|options?\b|what (should|can) i play|best move|which move|suggest/.test(lower)) return { topic: 'candidates' }
  if (/think|plan|idea|strategy|what now|what should i do|focus/.test(lower)) return { topic: 'thinking' }
  if (/tactic|combination|trick|fork|pin|skewer|discover|sacrifice|threat/.test(lower)) return { topic: 'tactics' }
  if (/opening|theory|book|eco/.test(lower)) return { topic: 'opening' }
  if (/endgame|ending|king and pawn|opposition|passed pawn|promot/.test(lower)) return { topic: 'endgame' }
  if (/eval|winning|losing|better|worse|equal|who is|score|advantage/.test(lower)) return { topic: 'evaluation' }
  if (/hang|safe|undefended|unprotected|loose|protect|defend/.test(lower)) return { topic: 'safety' }
  // A move-like token that isn't legal here.
  const moveLike = tokens.find((x) => /^(O-O(-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?)$/.test(x))
  if (moveLike) return { topic: 'move', move: moveLike }
  return { topic: 'overview' }
}

/** Material-free one-liner about who is to move (position info panel). */
export function positionFacts(fen: string): { toMove: string; phase: string; material: string; check: boolean } {
  const c = new Chess(fen)
  const m = material(c)
  return {
    toMove: sideName(c.turn()),
    phase: gamePhase(c),
    material: m.w === m.b ? 'Material is level' : `${m.w > m.b ? 'White' : 'Black'} +${Math.abs(m.w - m.b)}`,
    check: c.inCheck()
  }
}

export { weakSquares }
