import { Chess } from 'chess.js'
import type { OpeningMatch } from '../openings'
import { winProbability, type PositionAnalysis, type ReviewResult } from '../review'
import { lineCp } from '../strength'
import type { Color } from '../types'
import type { Coach } from './coaches'
import { judgeMove, type MoveJudgement } from './explain'
import { gamePhase, type Phase } from './features'

/** Where each mistake tag sends the player: lessons (ids) and puzzle categories (ids). */
export const TAG_INFO: Record<string, { label: string; lessons: string[]; puzzles: string[]; advice: [string, string, string] }> = {
  hanging: {
    label: 'Leaving pieces unprotected', lessons: ['double-attacks', 'removing-defender'], puzzles: ['material'],
    advice: ['Before every move, ask: is the piece I move safe on its new square, and is everything else still protected?', 'Make a blunder check before each move: what does my move leave undefended, and what can the opponent capture?', 'Your losses came from loose pieces. A routine blunder check (captures and checks for the opponent) after choosing a move would have prevented most of them.']
  },
  defenseRemoved: {
    label: 'Moving defenders away', lessons: ['removing-defender', 'deflection'], puzzles: ['deflection'],
    advice: ['Before moving a piece, check what it was protecting.', 'Track defensive duties: when a piece moves, list what it stops guarding.', 'Several moves abandoned a defensive duty; overloaded and deflected defenders are a recurring theme.']
  },
  allowedFork: { label: 'Allowing forks', lessons: ['forks'], puzzles: ['fork'], advice: ['Watch for enemy knights that could jump to a square attacking two of your pieces.', 'Check knight jumps and queen moves that hit two targets before you commit.', 'You walked into double attacks; scan for squares from which one enemy piece hits two of yours.'] },
  missedFork: { label: 'Missing forks', lessons: ['forks'], puzzles: ['fork'], advice: ['Look for moves that attack two things at once.', 'Train fork recognition: king + rook or queen + rook on knight-distance squares.', 'Several winning double attacks went unnoticed; include all forcing moves in your candidate list.'] },
  allowedPin: { label: 'Walking into pins', lessons: ['pins'], puzzles: ['pin'], advice: ['Be careful putting pieces in a line with your king or queen.', 'Avoid lining up your king, queen and rooks on open lines with enemy bishops/rooks.', 'Pins against your king and queen were exploited; break the alignment early.'] },
  missedPin: { label: 'Missing pins', lessons: ['pins'], puzzles: ['pin'], advice: ['Look for enemy pieces standing in front of their king or queen.', 'Pin pieces that shield the king or queen, then attack them again.', 'Exploitable pins were left on the board.'] },
  allowedSkewer: { label: 'Allowing skewers', lessons: ['skewers'], puzzles: ['skewer'], advice: ['Keep your king and big pieces off the same line.', 'Watch lines where a valuable piece stands in front of another.', 'Skewer geometry (king/queen in front of a rook) was exploited.'] },
  missedSkewer: { label: 'Missing skewers', lessons: ['skewers'], puzzles: ['skewer'], advice: ['Look for two enemy pieces on the same line.', 'Search lines with a valuable piece in front of a weaker one.', 'Available skewers were missed.'] },
  allowedDiscovery: { label: 'Allowing discovered attacks', lessons: ['discovered-attacks'], puzzles: ['discoveredAttack'], advice: ['Watch enemy pieces that stand in front of their own bishop, rook or queen.', 'Note hidden batteries: when the front piece moves, the back one attacks.', 'Discovered attacks against you were the decisive tactic.'] },
  missedDiscoveredAttack: { label: 'Missing discovered attacks', lessons: ['discovered-attacks'], puzzles: ['discoveredAttack'], advice: ['Look for your own pieces that can move out of the way to open an attack.', 'Use your batteries: moving the front piece with a threat creates two attacks.', 'Discovered-attack resources were left unused.'] },
  backRank: { label: 'Back-rank weakness', lessons: ['back-rank-mate'], puzzles: ['mateIn1', 'mateIn2'], advice: ['Give your king an escape square (a "luft") by moving a pawn in front of it.', 'Create luft before the back rank becomes a target.', 'The back rank was a structural liability; luft or a guarding rook was needed.'] },
  missedBackRankMate: { label: 'Missing back-rank mates', lessons: ['back-rank-mate'], puzzles: ['mateIn1', 'mateIn2'], advice: ['When the enemy king is stuck behind its pawns, look for a rook or queen check on the back row.', 'Check whether the enemy back rank is covered.', 'Back-rank mating patterns were available.'] },
  kingSafety: { label: 'King safety', lessons: ['protecting-king', 'check-checkmate'], puzzles: ['mateIn2', 'defensiveMove'], advice: ['Keep your king safe: castle early and keep pawns in front of it.', 'Count attackers near your king before grabbing material.', 'Mating attacks against your king decided the game; prophylaxis and defensive resources need work.'] },
  missedMate: { label: 'Missing checkmates', lessons: ['check-checkmate', 'back-rank-mate'], puzzles: ['mateIn1', 'mateIn2', 'mateIn3'], advice: ['Always look at every check — one of them might be checkmate!', 'Check all forcing moves for mate before playing a quiet move.', 'Forced mates were overlooked; calculate checks first.'] },
  missedWin: { label: 'Not punishing mistakes', lessons: ['tactical-combinations', 'deflection'], puzzles: ['material'], advice: ["When your opponent makes a mistake, slow down and look for how to punish it.", 'After an opponent error, search forcing moves before routine play.', 'Several winning chances after opponent errors were not converted.'] },
  endgameTechnique: { label: 'Endgame technique', lessons: ['basic-endgames', 'king-pawn-endgames', 'rook-endgames'], puzzles: ['endgame'], advice: ['In the endgame, activate your king and push your passed pawns.', 'Revise opposition, rook activity and passed-pawn technique.', 'Endgame precision cost points: work on technique and calculation of pawn races.'] },
  positional: { label: 'Positional decisions', lessons: ['positional-advantages', 'pawn-structures', 'weak-squares'], puzzles: ['bestMove'], advice: ['Put your pieces on squares where they do more.', 'Compare candidate moves by piece activity and pawn structure, not only tactics.', 'Quiet-move inaccuracies accumulated; refine plans based on structure and piece placement.'] },
  opening: { label: 'Opening play', lessons: ['opening-principles', 'developing-pieces', 'center-control'], puzzles: [], advice: ['In the opening: centre, develop, castle.', 'Prioritise development and king safety over early pawn grabs.', 'Opening decisions conceded the initiative; review the structures that arise from your openings.'] }
}

export interface PhaseReport {
  phase: Phase
  title: string
  moves: number
  accuracy: number | null
  mistakes: number
  grade: 'Strong' | 'Solid' | 'Shaky' | 'Weak' | 'Not reached'
  text: string
}

export interface KeyMoment {
  ply: number
  kind: 'mistake' | 'best' | 'missed'
  title: string
  judgement: MoveJudgement
}

export interface CoachReport {
  coachId: string
  summary: string[]
  phases: PhaseReport[]
  tactics: string[]
  moments: KeyMoment[]
  plan: { tag: string; label: string; text: string; lessons: string[]; puzzles: string[] }[]
  tags: Record<string, number>
}

export interface ReportInput {
  moves: { san: string; uci: string; color: Color }[]
  positions: PositionAnalysis[]
  review: ReviewResult
  playerColor: Color
  result: 'win' | 'loss' | 'draw' | 'unfinished'
  opening: OpeningMatch | null
  bookPlies: number
  /** Mistake tags from earlier reviewed games (most recent first). */
  history?: Record<string, number>[]
}

const level = (t: Coach['tier']) => (t <= 2 ? 0 : t <= 4 ? 1 : 2)

function grade(acc: number | null, mistakes: number): PhaseReport['grade'] {
  if (acc === null) return 'Not reached'
  if (acc >= 90 && mistakes === 0) return 'Strong'
  if (acc >= 78) return 'Solid'
  if (acc >= 62) return 'Shaky'
  return 'Weak'
}

export function buildCoachReport(input: ReportInput, coach: Coach): CoachReport {
  const t = coach.tier
  const { moves, positions, review, playerColor } = input
  const mine = review.moves.filter((m) => m.color === playerColor)
  const judgements = new Map<number, MoveJudgement>()
  const judge = (ply: number) => {
    if (!judgements.has(ply)) {
      const before = positions[ply]
      const after = positions[ply + 1]
      const prev = ply > 0 ? review.moves[ply - 1] : null
      judgements.set(
        ply,
        judgeMove(before.fen, moves[ply].uci, before.lines, after.lines, {
          perspective: playerColor,
          prevLoss: prev?.cls ? prev.loss : 0,
          prevMoverEp: prev?.cls ? 1 - prev.epBest : null,
          isBook: ply < input.bookPlies
        }, coach)
      )
    }
    return judgements.get(ply)!
  }

  // Phase split.
  const phaseOf = (ply: number): Phase => {
    if (ply < input.bookPlies) return 'opening'
    return gamePhase(new Chess(positions[ply].fen))
  }
  const tags: Record<string, number> = {}
  const bad = mine.filter((m) => m.cls && ['inaccuracy', 'mistake', 'blunder', 'miss'].includes(m.cls))
  for (const m of bad) {
    if (m.loss < 0.1 && m.cls !== 'miss') continue // tag only real mistakes
    const j = judge(m.ply)
    const ts = [...j.tags]
    if (phaseOf(m.ply) === 'opening' && !ts.some((x) => x !== 'positional')) ts.push('opening')
    if (phaseOf(m.ply) === 'endgame' && !ts.includes('endgameTechnique')) ts.push('endgameTechnique')
    for (const tg of ts) if (TAG_INFO[tg]) tags[tg] = (tags[tg] ?? 0) + 1
  }

  const phaseTitles: Record<Phase, string> = { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame' }
  const phases: PhaseReport[] = (['opening', 'middlegame', 'endgame'] as Phase[]).map((ph) => {
    const ms = mine.filter((m) => m.cls && phaseOf(m.ply) === ph)
    const acc = ms.length ? Math.round(ms.reduce((s, m) => s + m.accuracy, 0) / ms.length) : null
    const mistakes = ms.filter((m) => m.cls && ['mistake', 'blunder', 'miss'].includes(m.cls)).length
    const g = grade(acc, mistakes)
    let text: string
    if (acc === null) text = ph === 'endgame' ? 'The game did not reach an endgame.' : 'No moves in this phase.'
    else if (ph === 'opening') {
      const book = Math.min(input.bookPlies, moves.length)
      const bookMine = review.moves.slice(0, book).filter((m) => m.color === playerColor).length
      const name = input.opening ? `the ${input.opening.name}` : 'an opening outside the database'
      text = level(t) === 0
        ? `You played ${name}${bookMine ? ` and your first ${bookMine} move${bookMine > 1 ? 's were' : ' was'} known opening moves` : ''}. ${g === 'Strong' || g === 'Solid' ? 'You got your pieces out well.' : 'Some opening moves gave your opponent an easy game.'}`
        : `${input.opening ? `${input.opening.eco} ${input.opening.name}` : 'Unrecognised opening'}; ${bookMine} book move${bookMine === 1 ? '' : 's'}, then ${acc}% accuracy with ${mistakes} serious error${mistakes === 1 ? '' : 's'} before the middlegame.`
    } else text = level(t) === 0 ? `${ms.length} moves, ${acc}% accuracy, ${mistakes} big mistake${mistakes === 1 ? '' : 's'}.` : `${ms.length} moves at ${acc}% accuracy; ${mistakes} mistake${mistakes === 1 ? '' : 's'}/blunder${mistakes === 1 ? '' : 's'}, average expected-points loss ${(ms.reduce((s, m) => s + m.loss, 0) / ms.length).toFixed(3)}.`
    return { phase: ph, title: phaseTitles[ph], moves: ms.length, accuracy: acc, mistakes, grade: g, text }
  })

  // Tactics summary.
  const tactics: string[] = []
  const tacticalErrors = Object.entries(tags).filter(([k]) => k !== 'positional' && k !== 'opening' && k !== 'endgameTechnique').reduce((s, [, n]) => s + n, 0)
  const brilliants = mine.filter((m) => m.cls === 'brilliant' || m.cls === 'great').length
  tactics.push(tacticalErrors === 0
    ? (level(t) === 0 ? 'You did not fall for any tricks this game. Well done!' : 'No tactical errors detected in your moves.')
    : level(t) === 0 ? `You missed or allowed ${tacticalErrors} tactic${tacticalErrors > 1 ? 's' : ''}.` : `${tacticalErrors} tactically motivated error${tacticalErrors > 1 ? 's' : ''}: ${Object.entries(tags).filter(([k]) => TAG_INFO[k] && !['positional', 'opening', 'endgameTechnique'].includes(k)).map(([k, n]) => `${TAG_INFO[k].label.toLowerCase()} ×${n}`).join(', ')}.`)
  if (brilliants) tactics.push(level(t) === 0 ? `You found ${brilliants} excellent hard move${brilliants > 1 ? 's' : ''}!` : `${brilliants} great/brilliant move${brilliants > 1 ? 's' : ''} — only-moves or sound sacrifices.`)
  const positionalLoss = mine.filter((m) => m.cls === 'inaccuracy').length
  if (positionalLoss && t >= 3) tactics.push(`${positionalLoss} inaccuracies — mostly small positional concessions rather than tactics.`)

  // Key moments.
  const moments: KeyMoment[] = []
  for (const m of [...bad].sort((a, b) => b.loss - a.loss).slice(0, 3)) {
    moments.push({ ply: m.ply, kind: m.cls === 'miss' ? 'missed' : 'mistake', title: `${Math.floor(m.ply / 2) + 1}${m.color === 'w' ? '.' : '...'} ${m.san}`, judgement: judge(m.ply) })
  }
  const goods = mine.filter((m) => {
    if (!(m.cls === 'brilliant' || m.cls === 'great' || m.cls === 'best')) return false
    const lines = positions[m.ply].lines
    if (lines.length < 2) return m.cls !== 'best'
    return m.cls !== 'best' || winProbability(lineCp(lines[0])) - winProbability(lineCp(lines[1])) >= 0.15
  })
  for (const m of goods.slice(0, 2)) moments.push({ ply: m.ply, kind: 'best', title: `${Math.floor(m.ply / 2) + 1}${m.color === 'w' ? '.' : '...'} ${m.san}`, judgement: judge(m.ply) })
  moments.sort((a, b) => a.ply - b.ply)

  // Summary.
  const acc = review.accuracy[playerColor]
  const summary: string[] = []
  const resWord = input.result === 'win' ? 'won' : input.result === 'loss' ? 'lost' : input.result === 'draw' ? 'drew' : 'did not finish'
  if (level(t) === 0) summary.push(`You ${resWord} this game${acc !== null ? ` with an accuracy of ${acc}%` : ''}. ${bad.length === 0 ? 'You avoided big mistakes!' : `You made ${bad.filter((m) => m.cls !== 'inaccuracy').length} big mistake${bad.filter((m) => m.cls !== 'inaccuracy').length === 1 ? '' : 's'}. Let's look at them.`}`)
  else summary.push(`Result: ${resWord}. Accuracy ${acc ?? '–'}% (approximate). ${bad.length} inaccurate move${bad.length === 1 ? '' : 's'} of ${mine.length}; ${mine.filter((m) => m.cls === 'blunder').length} blunder${mine.filter((m) => m.cls === 'blunder').length === 1 ? '' : 's'}.`)
  const worst = phases.filter((p) => p.accuracy !== null).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))[0]
  if (worst && worst.grade !== 'Strong') summary.push(level(t) === 0 ? `Your hardest part of the game was the ${worst.title.toLowerCase()}.` : `Weakest phase: ${worst.title.toLowerCase()} (${worst.accuracy}%).`)

  // Improvement plan from this game + recent history.
  const combined: Record<string, number> = { ...tags }
  for (const h of input.history ?? []) for (const [k, n] of Object.entries(h)) combined[k] = (combined[k] ?? 0) + n * 0.5
  const top = Object.entries(combined).filter(([k]) => TAG_INFO[k]).sort((a, b) => b[1] - a[1]).slice(0, 3)
  const plan = top.map(([tag, n]) => {
    const info = TAG_INFO[tag]
    const recurring = (input.history ?? []).some((h) => h[tag])
    return {
      tag, label: info.label,
      text: `${info.advice[level(t)]}${recurring ? (level(t) === 0 ? ' This happened in earlier games too.' : ' This also showed up in your previous games.') : ''}${n >= 2 && !recurring ? ` (${Math.round(n)}× this game)` : ''}`,
      lessons: info.lessons,
      puzzles: info.puzzles
    }
  })
  if (plan.length === 0) plan.push({ tag: 'keep-going', label: 'Keep it up', text: level(t) === 0 ? 'No big weaknesses this game. Try a stronger bot or harder puzzles!' : 'No recurring weaknesses detected; raise the bot level or puzzle difficulty to find your limits.', lessons: [], puzzles: ['mix'] })

  return { coachId: coach.id, summary, phases, tactics, moments, plan, tags }
}
