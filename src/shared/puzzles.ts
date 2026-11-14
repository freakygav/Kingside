/**
 * Puzzle categories, rating bands and the puzzle record format.
 * Puzzles come from the lichess.org puzzle database (CC0), see data/puzzles/SOURCE.md.
 * Lichess format: FEN is the position BEFORE the opponent's move; moves[0] is that opponent move,
 * then the solver's moves and the opponent's forced replies alternate.
 */
export interface PuzzleRecord {
  id: string
  fen: string
  /** UCI moves; [0] is the opponent's set-up move. */
  moves: string[]
  rating: number
  themes: string[]
}

/** Compact on-disk form: [id, fen, "uci uci ...", rating, "theme theme ..."]. */
export type PackedPuzzle = [string, string, string, number, string]

export function unpackPuzzle(p: PackedPuzzle): PuzzleRecord {
  return { id: p[0], fen: p[1], moves: p[2].split(' '), rating: p[3], themes: p[4].split(' ') }
}

export interface PuzzleCategory {
  id: string
  name: string
  /** What the solver is asked to do. */
  goal: string
  match: (themes: Set<string>) => boolean
}

export const PUZZLE_CATEGORIES: PuzzleCategory[] = [
  { id: 'mix', name: 'Mixed', goal: 'Find the best move.', match: () => true },
  { id: 'mateIn1', name: 'Mate in 1', goal: 'Deliver checkmate in one move.', match: (t) => t.has('mateIn1') },
  { id: 'mateIn2', name: 'Mate in 2', goal: 'Force checkmate in two moves.', match: (t) => t.has('mateIn2') },
  { id: 'mateIn3', name: 'Mate in 3', goal: 'Force checkmate in three moves.', match: (t) => t.has('mateIn3') },
  { id: 'bestMove', name: 'Find the best move', goal: 'Find the strongest continuation.', match: (t) => !t.has('mate') },
  { id: 'material', name: 'Winning material', goal: 'Win material by force.', match: (t) => !t.has('mate') && (t.has('crushing') || t.has('advantage')) },
  { id: 'combination', name: 'Tactical combinations', goal: 'Play the whole combination.', match: (t) => t.has('long') || t.has('veryLong') },
  { id: 'fork', name: 'Forks', goal: 'Use a fork to win material.', match: (t) => t.has('fork') },
  { id: 'pin', name: 'Pins', goal: 'Exploit a pin.', match: (t) => t.has('pin') },
  { id: 'skewer', name: 'Skewers', goal: 'Use a skewer.', match: (t) => t.has('skewer') },
  { id: 'discoveredAttack', name: 'Discovered attacks', goal: 'Unleash a discovered attack.', match: (t) => t.has('discoveredAttack') },
  { id: 'deflection', name: 'Deflection', goal: 'Deflect a key defender.', match: (t) => t.has('deflection') },
  { id: 'attraction', name: 'Attraction', goal: 'Lure a piece onto a fatal square.', match: (t) => t.has('attraction') },
  { id: 'defensiveMove', name: 'Defensive moves', goal: 'Find the only defence.', match: (t) => t.has('defensiveMove') },
  { id: 'equality', name: 'Saving a losing position', goal: 'Escape from a losing position.', match: (t) => t.has('equality') },
  { id: 'endgame', name: 'Endgame', goal: 'Find the winning endgame idea.', match: (t) => t.has('endgame') },
  { id: 'advanced', name: 'Advanced combinations', goal: 'Calculate a long, deep combination.', match: (t) => t.has('veryLong') || (t.has('sacrifice') && t.has('long')) }
]

export interface RatingBand {
  id: string
  label: string
  min: number
  /** Exclusive upper bound. */
  max: number
}

export const RATING_BANDS: RatingBand[] = [
  { id: '400', label: '400–600', min: 0, max: 600 },
  { id: '600', label: '600–800', min: 600, max: 800 },
  { id: '800', label: '800–1000', min: 800, max: 1000 },
  { id: '1000', label: '1000–1200', min: 1000, max: 1200 },
  { id: '1200', label: '1200–1400', min: 1200, max: 1400 },
  { id: '1400', label: '1400–1600', min: 1400, max: 1600 },
  { id: '1600', label: '1600–1800', min: 1600, max: 1800 },
  { id: '1800', label: '1800–2000', min: 1800, max: 2000 },
  { id: '2000', label: '2000–2200', min: 2000, max: 2200 },
  { id: '2200', label: '2200–2500', min: 2200, max: 2500 },
  { id: '2500', label: '2500+', min: 2500, max: 10_000 }
]

export function bandFor(rating: number): RatingBand {
  return RATING_BANDS.find((b) => rating >= b.min && rating < b.max) ?? RATING_BANDS[RATING_BANDS.length - 1]
}

/** Human-readable explanations for the lichess theme tags we surface. */
export const THEME_TEXT: Record<string, { name: string; idea: string }> = {
  mateIn1: { name: 'Mate in 1', idea: 'There is a checkmate available right now. Look at every check.' },
  mateIn2: { name: 'Mate in 2', idea: 'A forcing first move (usually a check) leaves the opponent with no defence against mate.' },
  mateIn3: { name: 'Mate in 3', idea: 'Use checks and captures to drive the king into a mating net.' },
  mateIn4: { name: 'Mate in 4', idea: 'A long forcing sequence ends in mate. Keep giving checks.' },
  mateIn5: { name: 'Long mate', idea: 'A long forcing sequence ends in mate.' },
  fork: { name: 'Fork', idea: 'One piece can attack two targets at once.' },
  pin: { name: 'Pin', idea: 'A piece cannot move without exposing something more valuable behind it.' },
  skewer: { name: 'Skewer', idea: 'Attack a valuable piece so that when it moves, the piece behind it falls.' },
  discoveredAttack: { name: 'Discovered attack', idea: 'Moving one piece out of the way opens an attack by another.' },
  deflection: { name: 'Deflection', idea: 'Force a defender away from the square or piece it guards.' },
  attraction: { name: 'Attraction', idea: 'Sacrifice to lure an enemy piece (often the king) onto a bad square.' },
  defensiveMove: { name: 'Defensive move', idea: 'The obvious moves lose. Find the precise defence.' },
  equality: { name: 'Saving the game', idea: 'You are worse; find the resource that holds the balance.' },
  endgame: { name: 'Endgame', idea: 'Few pieces are left: king activity, passed pawns and precise calculation decide.' },
  hangingPiece: { name: 'Hanging piece', idea: 'Something is undefended and can simply be taken.' },
  trappedPiece: { name: 'Trapped piece', idea: 'An enemy piece has no safe squares. Attack it.' },
  sacrifice: { name: 'Sacrifice', idea: 'Giving up material is the key to the combination.' },
  backRankMate: { name: 'Back-rank mate', idea: "The king is boxed in by its own pawns on the back rank." },
  doubleCheck: { name: 'Double check', idea: 'Two pieces give check at once, so the king must move.' },
  capturingDefender: { name: 'Remove the defender', idea: 'Capture the piece that holds the position together.' },
  intermezzo: { name: 'Zwischenzug', idea: 'Insert an in-between move before the expected recapture.' },
  xRayAttack: { name: 'X-ray', idea: 'A piece attacks through another piece along a line.' },
  quietMove: { name: 'Quiet move', idea: 'The key move is not a check or capture, but it creates an unstoppable threat.' },
  promotion: { name: 'Promotion', idea: 'A pawn is close to queening. Clear its path.' },
  advancedPawn: { name: 'Advanced pawn', idea: 'A far-advanced pawn is the decisive factor.' },
  kingsideAttack: { name: 'Kingside attack', idea: 'The enemy king is short of defenders on the kingside.' },
  queensideAttack: { name: 'Queenside attack', idea: 'Attack on the queenside where the king lives.' },
  crushing: { name: 'Crushing', idea: 'The correct line wins decisively.' },
  advantage: { name: 'Advantage', idea: 'The correct line gives a clear advantage.' },
  rookEndgame: { name: 'Rook endgame', idea: 'Rook activity and checks from behind are key.' },
  pawnEndgame: { name: 'Pawn endgame', idea: 'Opposition and counting tempi decide.' },
  queenEndgame: { name: 'Queen endgame', idea: 'Checks and king safety decide.' },
  clearance: { name: 'Clearance', idea: 'Vacate a square or line for another piece.' },
  interference: { name: 'Interference', idea: 'Block the line between an enemy piece and what it defends.' },
  zugzwang: { name: 'Zugzwang', idea: 'Every opponent move worsens their position.' }
}

/** The most specific explanatory theme for a puzzle (used for the first hint). */
export function primaryTheme(themes: string[]): string | null {
  const order = [
    'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'backRankMate', 'doubleCheck', 'fork', 'pin', 'skewer', 'discoveredAttack',
    'deflection', 'attraction', 'capturingDefender', 'intermezzo', 'xRayAttack', 'clearance', 'interference', 'trappedPiece',
    'hangingPiece', 'promotion', 'advancedPawn', 'zugzwang', 'quietMove', 'defensiveMove', 'equality', 'sacrifice',
    'rookEndgame', 'pawnEndgame', 'queenEndgame', 'endgame', 'kingsideAttack', 'queensideAttack', 'crushing', 'advantage'
  ]
  return order.find((t) => themes.includes(t)) ?? null
}
