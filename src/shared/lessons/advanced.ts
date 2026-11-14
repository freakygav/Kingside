import type { Lesson } from './types'

export const ADVANCED: Lesson[] = [
  {
    id: 'zwischenzug', level: 'advanced', title: 'Zwischenzug', icon: '⇄',
    summary: 'The in-between move that changes the outcome of an exchange.',
    steps: [
      {
        kind: 'concept', title: 'Don\'t recapture automatically', fen: 'rnbqk2r/1p3ppp/p4b2/2PQ4/8/2N2N2/PP2PPPP/R3KB1R b KQkq - 0 9', orientation: 'b', arrows: ['d8d5', 'f6c3'],
        body: [
          'A **zwischenzug** (German for "in-between move") is a forcing move played *before* the expected reply — usually before recapturing.',
          'White\'s queen has just landed on d5, facing your queen. The automatic …Qxd5 is met by Nxd5 and nothing is gained. Look for a check first. (lichess puzzle 00Htd)'
        ]
      },
      {
        kind: 'demo', title: 'The automatic recapture', intro: 'What happens if Black trades queens straight away.', fen: 'rnbqk2r/1p3ppp/p4b2/2PQ4/8/2N2N2/PP2PPPP/R3KB1R b KQkq - 0 9', orientation: 'b',
        moves: [
          { san: 'Qxd5', note: 'Natural, but…' },
          { san: 'Nxd5', note: '…the knight recaptures and material is level.' }
        ]
      },
      {
        kind: 'exercise', title: 'Insert the check', prompt: 'Black to move. Win a piece with an in-between move.', orientation: 'b',
        fen: 'rnbqk2r/1p3ppp/p4b2/2PQ4/8/2N2N2/PP2PPPP/R3KB1R b KQkq - 0 9', solution: ['Bxc3+', 'bxc3', 'Qxd5'], verify: 'best',
        wrong: { Qxd5: 'After Nxd5 White simply recaptures and you have only traded queens. Remove the knight first — with check.' },
        hint: 'The knight on c3 is the piece that would recapture on d5. Can you take it with check?',
        success: 'Bxc3+ removed the recapturing knight with check; after bxc3 the queen on d5 is simply lost.'
      },
      { kind: 'quiz', question: 'What makes a zwischenzug work?', options: ['It is a quiet move', 'It is forcing (check, capture or big threat), so the opponent has no time to complete the exchange', 'It must be a pawn move', 'It only works in endgames'], answer: 1, explanation: 'The intermediate move must demand an answer.' },
      { kind: 'quiz', question: 'When should you look for a zwischenzug?', options: ['Only when ahead', 'Whenever an exchange or recapture seems automatic', 'Never in the opening', 'Only with knights'], answer: 1, explanation: 'Automatic recaptures are where in-between moves hide.' }
    ]
  },
  {
    id: 'zugzwang', level: 'advanced', title: 'Zugzwang', icon: '⏸',
    summary: 'When every move makes your position worse.',
    steps: [
      {
        kind: 'concept', title: 'The obligation to move', fen: '8/8/p6k/1p2p3/1P2P2p/P6K/8/8 w - - 0 41',
        body: [
          '**Zugzwang** means any move a player makes worsens their position — they would rather pass, but passing is not allowed.',
          'It is most common in king and pawn endings, where there are few spare moves. Counting the remaining pawn moves (tempi) often decides the game.'
        ]
      },
      {
        kind: 'demo', title: 'Into a won pawn ending', intro: 'Black takes the knight; the remaining pawn ending is decided by king activity. (lichess puzzle 4pUkN)', fen: '8/8/8/p1p2kN1/P1P5/6K1/8/8 b - - 0 49', orientation: 'b',
        moves: [
          { san: 'Kxg5', note: 'Black wins the knight.' },
          { san: 'Kf3', note: 'White\'s king heads for the queenside pawns.' },
          { san: 'Kf5', note: 'Black keeps the opposition…' },
          { san: 'Ke3', note: '…' },
          { san: 'Ke5', note: 'Black\'s king is in front; White runs out of good king moves first.' }
        ]
      },
      {
        kind: 'exercise', title: 'Use the zugzwang', prompt: 'Capture the h-pawn, then keep the black king out.',
        fen: '8/8/p6k/1p2p3/1P2P2p/P6K/8/8 w - - 0 41', solution: ['Kxh4', 'Kg6', 'Kg4'], verify: 'best',
        hint: 'Take the pawn first. Then take the opposition so Black\'s king has to give way.',
        success: 'After Kg4 Black is in zugzwang: the king must step back and White\'s king marches in. (lichess puzzle 3mFHk)'
      },
      {
        kind: 'exercise', title: 'Counting tempi', prompt: 'Win the pawn race on the queenside.',
        fen: '8/8/2k5/3p2p1/p2P2P1/1K6/8/8 w - - 0 45', solution: ['Kxa4', 'Kb6', 'Kb4'], verify: 'best',
        hint: 'Grab the a-pawn, then take the opposition with your king.',
        success: 'Kb4 puts Black in zugzwang: the king must allow White\'s king forward. (lichess puzzle 4llTY)'
      },
      { kind: 'quiz', question: 'What is zugzwang?', options: ['A sacrifice for attack', 'A position where the obligation to move is a disadvantage', 'A draw by repetition', 'A type of fork'], answer: 1, explanation: 'Being forced to move hurts.' },
      { kind: 'quiz', question: 'In which phase is zugzwang most common?', options: ['Opening', 'Middlegame', 'Endgame', 'It never happens'], answer: 2, explanation: 'Few pieces means few waiting moves.' }
    ]
  },
  {
    id: 'opposition', level: 'advanced', title: 'Opposition', icon: '⇵',
    summary: 'The king-versus-king duel that decides pawn endings.',
    steps: [
      {
        kind: 'concept', title: 'Direct opposition', fen: '8/8/4k3/8/4K3/8/4P3/8 b - - 0 1', squares: ['e4', 'e6', 'e5'],
        body: [
          'Kings may never stand next to each other, so the square between them (e5) is a no-man\'s-land.',
          'The side **not** to move holds the opposition. The opponent must step aside and let the other king through. Distant opposition (3 or 5 squares apart) follows the same logic.'
        ]
      },
      {
        kind: 'exercise', title: 'Take the opposition', prompt: 'White to move. Step into the opposition in front of your pawn.',
        fen: '8/8/4k3/8/3K4/8/4P3/8 w - - 0 1', solution: ['Ke4'], verify: 'winning',
        wrong: { e4: 'Pushing the pawn first lets Black take the opposition with …Kd6, and the position is a draw.' },
        hint: 'Put your king directly opposite Black\'s king, one square between them.',
        success: 'Ke4 takes the opposition with your king in front of the pawn — a theoretical win.'
      },
      {
        kind: 'demo', title: 'Converting with the opposition', intro: 'After Ke4, Black must give way and White\'s king reaches the 6th rank.', fen: '8/8/4k3/8/4K3/8/4P3/8 b - - 0 1',
        moves: [
          { san: 'Kd6', note: 'Black steps aside.' },
          { san: 'Kf5', note: 'White outflanks on the other side.' },
          { san: 'Ke7', note: 'Black tries to keep in front.' },
          { san: 'Ke5', note: 'Opposition again — Black must give way once more.' },
          { san: 'Kd7', note: '…' },
          { san: 'Kf6', note: 'White\'s king reaches the 6th rank in front of the pawn: a winning setup.' }
        ]
      },
      { kind: 'quiz', question: 'Kings stand on e4 and e6 and it is White\'s move. Who has the opposition?', options: ['White', 'Black', 'Nobody', 'Whoever has more pawns'], answer: 1, explanation: 'The side NOT to move — Black — holds it.' },
      { kind: 'quiz', question: 'Why is the opposition important?', options: ['It wins material directly', 'It forces the other king to give way, letting your king advance', 'It prevents castling', 'It only matters with queens on the board'], answer: 1, explanation: 'Gaining ground with the king decides most pawn endings.' }
    ]
  },
  {
    id: 'positional-sacrifices', level: 'advanced', title: 'Complex positional sacrifices', icon: '♟→',
    summary: 'Giving material for development, the centre or long-term pressure.',
    steps: [
      {
        kind: 'concept', title: 'Compensation', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        body: [
          'Not every sacrifice leads to mate. A **positional sacrifice** gives material for lasting assets: a lead in development, a strong centre, open lines toward the king, or a crippled enemy structure.',
          'The test is concrete: does the compensation still exist several moves later? Engines measure it in the evaluation, not in the material count.'
        ]
      },
      {
        kind: 'demo', title: 'The Evans Gambit', intro: 'White gives a pawn to gain time for a big centre.', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        moves: [
          { san: 'b4', note: 'The pawn offer: if the bishop takes, White gains time.' },
          { san: 'Bxb4', note: 'Black accepts.' },
          { san: 'c3', note: 'Attacking the bishop and preparing d4.' },
          { san: 'Ba5', note: 'The bishop retreats — another tempo for White.' },
          { san: 'd4', note: 'White builds a broad centre and opens lines. The pawn is the price.' }
        ]
      },
      {
        kind: 'exercise', title: 'Offer the gambit', prompt: 'Sacrifice a pawn to deflect the c5-bishop and win time for d4.',
        fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', solution: ['b4'], verify: 'sound',
        hint: 'Which pawn move attacks the bishop on c5?',
        success: 'b4 is the Evans Gambit. The engine judges it close to the main moves — the pawn buys real compensation.'
      },
      { kind: 'quiz', question: 'What does a positional sacrifice gain in return for material?', options: ['Nothing, it is a mistake', 'Long-term assets like development, centre or open lines', 'An immediate checkmate always', 'A draw'], answer: 1, explanation: 'The compensation is positional rather than an immediate tactic.' },
      { kind: 'quiz', question: 'How can you test whether a positional sacrifice is sound?', options: ['Count material only', 'Check if the compensation persists after the opponent\'s best defence', 'See whether the opponent castled', 'It is always sound'], answer: 1, explanation: 'Concrete calculation — or an engine — must confirm the pressure lasts.' }
    ]
  },
  {
    id: 'exchange-sacrifices', level: 'advanced', title: 'Exchange sacrifices', icon: '♖⇄♘',
    summary: 'Giving a rook for a minor piece to break the defence.',
    steps: [
      {
        kind: 'concept', title: 'Rook for a key minor piece', fen: '3R1nk1/p4ppp/7q/2p5/8/6PN/r4PP1/3Q2K1 w - - 0 33', squares: ['f8'],
        body: [
          'Giving a rook (5) for a bishop or knight (3) is an **exchange sacrifice**. It is worth it when the minor piece is a key defender or the resulting position is strategically superior.',
          'The black knight on f8 is the only piece guarding Black\'s back rank.'
        ]
      },
      {
        kind: 'demo', title: 'Rook for bishop, then mate', intro: 'Black gives a rook for the defending bishop. (lichess puzzle LbtZd)', fen: '3r2k1/p1br2p1/4Rn1p/1p6/2p5/2P2B1P/PP3PP1/R1B3K1 b - - 0 27', orientation: 'b',
        moves: [
          { san: 'Rd1+', note: 'The rook checks on the back rank.' },
          { san: 'Bxd1', note: 'The bishop has to take — the exchange is sacrificed.' },
          { san: 'Rxd1+', note: 'The second rook continues the attack.' },
          { san: 'Re1', note: 'White blocks…' },
          { san: 'Rxe1#', note: '…and the back rank collapses.' }
        ]
      },
      {
        kind: 'exercise', title: 'Break the back rank', prompt: 'Give the exchange to remove the defender, then mate.', goal: 'mate',
        fen: '3R1nk1/p4ppp/7q/2p5/8/6PN/r4PP1/3Q2K1 w - - 0 33', solution: ['Rxf8+', 'Kxf8', 'Qd8#'], verify: 'best',
        hint: 'The knight on f8 guards d8. Take it with check.',
        success: 'Rxf8+ removed the knight and Qd8 is mate. Rook for knight — and the game. (lichess puzzle gV2cE)'
      },
      { kind: 'quiz', question: 'What is "the exchange" in chess?', options: ['Any trade', 'The difference between a rook and a minor piece', 'Swapping queens', 'Promoting a pawn'], answer: 1, explanation: 'Winning the exchange = winning a rook for a bishop or knight.' },
      { kind: 'quiz', question: 'When is an exchange sacrifice typically justified?', options: ['Never', 'When the minor piece is a key defender or the resulting structure clearly favours you', 'Only in the opening', 'Only when you are already winning'], answer: 1, explanation: 'Material is temporary; structure and king safety last.' }
    ]
  },
  {
    id: 'prophylaxis', level: 'advanced', title: 'Prophylaxis', icon: '🔒',
    summary: 'Ask what your opponent wants — and stop it before it happens.',
    steps: [
      {
        kind: 'concept', title: 'Thinking for your opponent', fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w - - 2 7', arrows: ['c8g4'],
        body: [
          '**Prophylaxis** means preventing the opponent\'s plan before it gets going.',
          'In this Italian position, Black would like …Bg4, pinning your f3-knight to the queen. A small pawn move can rule it out for good.'
        ]
      },
      {
        kind: 'exercise', title: 'Stop the pin', prompt: 'Prevent …Bg4 for good.',
        fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w - - 2 7', solution: ['h3'], verify: 'sound',
        wrong: { Bg5: 'An active move, but it doesn\'t address Black\'s plan of …Bg4.' },
        hint: 'Control the g4-square with a pawn.',
        success: 'h3 takes g4 away from Black\'s bishop and knight. Quiet, but it removes a whole plan.'
      },
      {
        kind: 'demo', title: 'Prophylaxis on both sides', intro: 'Both players spend a move preventing the other\'s ideas.', fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w - - 2 7',
        moves: [
          { san: 'h3', note: 'No more …Bg4 or …Ng4.' },
          { san: 'a6', note: 'Black prepares a retreat square on a7 for the bishop.' },
          { san: 'Re1', note: 'White supports e4 and prepares d4.' },
          { san: 'Ba7', note: 'The bishop steps back in advance, so a later d4 or b4 will not come with tempo.' }
        ]
      },
      {
        kind: 'exercise', title: 'Trade into a won ending', prompt: 'Black\'s queen threatens your king. Neutralise the counterplay.',
        fen: '8/5p1k/1P2p2p/8/4q1p1/P7/2KQ4/8 w - - 8 56', solution: ['Qd3', 'Qxd3+', 'Kxd3'], verify: 'best',
        hint: 'Offer a queen trade on a square Black cannot refuse.',
        success: 'Without queens, Black\'s checks are gone and your b-pawn decides. (lichess puzzle ShZ6g)'
      },
      { kind: 'quiz', question: 'What is the first question of prophylactic thinking?', options: ['How can I attack?', 'What does my opponent want to do?', 'Can I trade queens?', 'Which piece is worst?'], answer: 1, explanation: 'Identify the opponent\'s plan, then stop it.' },
      { kind: 'quiz', question: 'Which of these is a typical prophylactic move?', options: ['h3 to stop …Bg4 or …Ng4', 'Giving check', 'Capturing a pawn', 'Promoting'], answer: 0, explanation: 'Small pawn moves that take squares away are classic prophylaxis.' }
    ]
  },
  {
    id: 'positional-advantages', level: 'advanced', title: 'Positional advantages', icon: '⚖',
    summary: 'Space, activity, structure, the bishop pair — and how to exploit them.',
    steps: [
      {
        kind: 'concept', title: 'Lasting advantages', fen: 'r1bq1rk1/pp2bppp/2n2n2/3p4/3N4/2N1B3/PP2BPPP/R2Q1RK1 b - - 0 10', squares: ['d5', 'd4'],
        body: [
          'Positional advantages last: better **pawn structure**, more **space**, more **active pieces**, the **bishop pair**, safer king.',
          'Black has an **isolated queen\'s pawn** on d5. It gives activity now but is a long-term target, and the square in front of it (d4) is a perfect blockade post.'
        ]
      },
      {
        kind: 'squares', title: 'Spot the weakness', prompt: 'Click Black\'s isolated pawn.',
        fen: 'r1bq1rk1/pp2bppp/2n2n2/3p4/3N4/2N1B3/PP2BPPP/R2Q1RK1 b - - 0 10', answer: ['d5'], check: { kind: 'isolated', color: 'b' },
        hint: 'An isolated pawn has no friendly pawns on either neighbouring file.',
        success: 'd5 is isolated: no black pawns on the c- or e-file can ever defend it.'
      },
      {
        kind: 'demo', title: 'Piece play around the IQP', intro: 'Typical regrouping: Black seeks activity, White targets d5.', fen: 'r1bq1rk1/pp2bppp/2n2n2/3p4/3N4/2N1B3/PP2BPPP/R2Q1RK1 b - - 0 10',
        moves: [
          { san: 'Re8', note: 'Black activates the rook on the half-open e-file — activity is the IQP\'s compensation.' },
          { san: 'Rc1', note: 'White takes the open c-file.' },
          { san: 'Bd6', note: 'Black aims the bishop toward White\'s kingside.' },
          { san: 'Ncb5', note: 'White hits the bishop and uses the b5-square, which no black pawn controls.' }
        ]
      },
      {
        kind: 'exercise', title: 'Pressure the weakness', prompt: 'White to move. Add another attacker on the isolated d5-pawn with your bishop.',
        fen: 'r1bq1rk1/pp2bppp/2n2n2/3p4/3N4/2N1B3/PP2BPPP/R2Q1RK1 w - - 0 10', solution: ['Bf3'], verify: 'sound',
        hint: 'Which bishop move attacks d5?',
        success: 'Bf3 piles up on d5: now the knight on c3, the bishop and later a rook can all target it.'
      },
      { kind: 'quiz', question: 'Which is a positional (long-term) advantage?', options: ['A one-move threat', 'The bishop pair in an open position', 'A check', 'Being on move'], answer: 1, explanation: 'Two bishops dominate open positions for the whole game.' },
      { kind: 'quiz', question: 'How do you usually fight an isolated pawn?', options: ['Ignore it', 'Blockade the square in front of it and attack it', 'Trade all your pawns', 'Push your own pawns past it'], answer: 1, explanation: 'Blockade first, then pile up on it.' }
    ]
  },
  {
    id: 'pawn-structures', level: 'advanced', title: 'Pawn structures', icon: '⛓',
    summary: 'Isolated, doubled, backward and passed pawns.',
    steps: [
      {
        kind: 'concept', title: 'The skeleton of the position', fen: '6k1/pp3ppp/8/3P4/8/8/PP3PPP/6K1 w - - 0 1', squares: ['d5'],
        body: [
          'Pawns cannot move backward, so pawn structure shapes the whole game.',
          '**Passed** pawns (no enemy pawns ahead on the same or adjacent files) are strengths. **Isolated**, **doubled** and **backward** pawns are common weaknesses.'
        ]
      },
      {
        kind: 'squares', title: 'Find the passed pawn', prompt: 'Click White\'s passed pawn.',
        fen: '6k1/pp3ppp/8/3P4/8/8/PP3PPP/6K1 w - - 0 1', answer: ['d5'], check: { kind: 'passed', color: 'w' },
        hint: 'Which white pawn has no black pawns in front of it on its own or neighbouring files?',
        success: 'd5 is passed — no black pawn on c, d or e can stop it.'
      },
      {
        kind: 'demo', title: 'A passer ties down the king', intro: 'Pushed alone, the pawn is caught — but the black king is dragged far from the kingside.', fen: '6k1/pp3ppp/8/3P4/8/8/PP3PPP/6K1 w - - 0 1',
        moves: [
          { san: 'd6', note: 'The pawn advances.' },
          { san: 'Kf8', note: 'Black\'s king must come over.' },
          { san: 'd7', note: '…' },
          { san: 'Ke7', note: 'The king blockades just in time.' },
          { san: 'd8=Q+', note: 'The pawn is given up…' },
          { san: 'Kxd8', note: '…but the black king is now far from the kingside, where White\'s king can invade.' }
        ]
      },
      {
        kind: 'exercise', title: 'Support the passer', prompt: 'Start the winning plan: bring your king toward the centre to escort the pawn.',
        fen: '6k1/pp3ppp/8/3P4/8/8/PP3PPP/6K1 w - - 0 1', solution: ['Kf1'], verify: 'winning',
        wrong: { d6: 'Pushing the pawn alone lets the black king blockade it, exactly as in the demo. Bring your king first.' },
        hint: 'Your king is on g1. Which square brings it closer to the centre?',
        success: 'With the extra passed pawn and an active king, White is winning.'
      },
      {
        kind: 'squares', title: 'Find the doubled pawns', prompt: 'Click one of Black\'s doubled pawns.',
        fen: '6k1/pp3ppp/2p5/2p5/8/8/PP3PPP/6K1 b - - 0 1', answer: ['c6', 'c5'], check: { kind: 'doubled', color: 'b' },
        hint: 'Two pawns of the same colour on the same file.',
        success: 'The c5 and c6 pawns are doubled: they cannot protect each other and are easy to blockade.'
      },
      { kind: 'quiz', question: 'Why are doubled pawns often weak?', options: ['They move faster', 'They cannot defend each other and block one another', 'They cannot be captured', 'They promote to knights'], answer: 1, explanation: 'The front pawn blocks the rear one.' },
      { kind: 'quiz', question: 'A pawn with no friendly pawns on neighbouring files is…', options: ['Passed', 'Isolated', 'Backward', 'Doubled'], answer: 1, explanation: 'Isolated pawns must be defended by pieces.' }
    ]
  },
  {
    id: 'weak-squares', level: 'advanced', title: 'Weak squares', icon: '⬚',
    summary: 'Holes that pawns can no longer defend.',
    steps: [
      {
        kind: 'concept', title: 'Holes', fen: 'r1bqkb1r/pp3ppp/2np1n2/4p3/4P3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 7', squares: ['d5'],
        body: [
          'A **weak square** (hole) is a square that can no longer be defended by a pawn, because the pawns that could cover it have moved past or disappeared.',
          'After …e5 Black has no c- or e-pawn that can ever cover d5. White would love to plant a piece there.'
        ]
      },
      {
        kind: 'squares', title: 'Find the hole', prompt: 'Click the weak square in Black\'s camp that White can occupy.',
        fen: 'r1bqkb1r/pp3ppp/2np1n2/4p3/4P3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 7', answer: ['d5'], check: { kind: 'weak', color: 'b' },
        hint: 'Which square in front of Black\'s d6-pawn can no black pawn attack?',
        success: 'd5 is a hole: Black\'s c- and e-pawns can never attack it, and White\'s e4-pawn supports a piece there.'
      },
      {
        kind: 'exercise', title: 'Fight for the hole', prompt: 'Jumping to d5 right now would drop your e4-pawn. First, go after the black piece that guards d5.',
        fen: 'r1bqkb1r/pp3ppp/2np1n2/4p3/4P3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 7', solution: ['Bg5'], alt: { 0: ['Bc4'] }, verify: 'sound',
        wrong: { Nd5: 'Too early: the c3-knight was protecting e4, so …Nxe4 wins a pawn.' },
        hint: 'The knight on f6 covers d5 (and attacks e4). Pin it or attack d5 with a bishop.',
        success: 'Your bishop now fights for d5: Bg5 threatens to remove the f6-knight; Bc4 adds a direct attacker on d5.'
      },
      {
        kind: 'demo', title: 'Remove the defender, then occupy', intro: 'The standard way to conquer d5.', fen: 'r1bqkb1r/pp3ppp/2np1n2/4p3/4P3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 7',
        moves: [
          { san: 'Bg5', note: 'Pins the f6-knight, the main guard of d5.' },
          { san: 'Be7', note: 'Black breaks the pin.' },
          { san: 'Bxf6', note: 'White gives the bishop for the knight…' },
          { san: 'Bxf6', note: '…and now no black knight can contest d5 or attack e4.' },
          { san: 'Nd5', note: 'The knight lands safely on the hole.' }
        ]
      },
      { kind: 'quiz', question: 'What makes a square "weak"?', options: ['It is light-coloured', 'No pawn can defend it any more', 'It is on the edge', 'A piece stands on it'], answer: 1, explanation: 'Pawns move only forward, so once they pass a square it is permanently weak.' },
      { kind: 'quiz', question: 'Which piece benefits most from a weak square in the enemy camp?', options: ['A knight', 'A rook on the back rank', 'The king in the middlegame', 'A pawn'], answer: 0, explanation: 'Knights need stable outposts, and a hole is exactly that.' }
    ]
  },
  {
    id: 'outposts', level: 'advanced', title: 'Outposts', icon: '♘',
    summary: 'Pawn-supported squares where your pieces can never be chased.',
    steps: [
      {
        kind: 'concept', title: 'Supported and unassailable', fen: 'r1bqkb1r/pp1n2pp/2p1pn2/3p1p2/3P1P2/2P1PN2/PP4PP/RNBQKB1R w KQkq - 0 8', squares: ['e5'],
        body: [
          'An **outpost** is a square in the opponent\'s half that is protected by your pawn and cannot be attacked by an enemy pawn.',
          'In this Stonewall structure, White\'s d4 and f4 pawns support e5, and Black\'s d- and f-pawns have already moved past it.'
        ]
      },
      {
        kind: 'squares', title: 'Find the outpost', prompt: 'Click White\'s outpost square.',
        fen: 'r1bqkb1r/pp1n2pp/2p1pn2/3p1p2/3P1P2/2P1PN2/PP4PP/RNBQKB1R w KQkq - 0 8', answer: ['e5'], check: { kind: 'outposts', color: 'w' },
        hint: 'Look for a square supported by two white pawns that no black pawn can attack.',
        success: 'e5 is a classic Stonewall outpost.'
      },
      {
        kind: 'squares', title: 'Outposts cut both ways', prompt: 'The Stonewall gives Black an outpost too. Click it.',
        fen: 'r1bqkb1r/pp1n2pp/2p1pn2/3p1p2/3P1P2/2P1PN2/PP4PP/RNBQKB1R w KQkq - 0 8', answer: ['e4'], check: { kind: 'outposts', color: 'b' },
        hint: 'Mirror the idea: which square is supported by Black\'s d5 and f5 pawns?',
        success: 'e4 is Black\'s outpost: White\'s d- and f-pawns have already passed it.'
      },
      {
        kind: 'exercise', title: 'Control the enemy outpost first', prompt: 'Jumping to e5 now lets Black answer …Nxe5 and …Ne4. Develop the piece that fights for e4.',
        fen: 'r1bqkb1r/pp1n2pp/2p1pn2/3p1p2/3P1P2/2P1PN2/PP4PP/RNBQKB1R w KQkq - 0 8', solution: ['Bd3'], verify: 'sound',
        wrong: { Ne5: 'Not yet: after …Nxe5 fxe5 Ne4 Black\'s knight lands on its own outpost and stands better than yours would have.' },
        hint: 'Which bishop move puts a piece on the e4-square\'s diagonal?',
        success: 'Bd3 develops and controls e4, so Black\'s knight cannot settle there easily. Now Ne5 becomes a real threat.'
      },
      {
        kind: 'demo', title: 'Prepare, then occupy', intro: 'With the bishop on d3 and the king castled, the knight goes to e5.', fen: 'r1bqkb1r/pp1n2pp/2p1pn2/3p1p2/3P1P2/2P1PN2/PP4PP/RNBQKB1R w KQkq - 0 8',
        moves: [
          { san: 'Bd3', note: 'Controls e4.' },
          { san: 'Bd6', note: 'Black develops.' },
          { san: 'O-O', note: 'White castles.' },
          { san: 'O-O', note: 'Black castles.' },
          { san: 'Ne5', note: 'Now the knight occupies the outpost, supported by d4 and f4.' }
        ]
      },
      { kind: 'quiz', question: 'Which two conditions make an outpost?', options: ['Supported by your pawn and not attackable by enemy pawns', 'On the edge and empty', 'Next to the enemy king', 'On a light square'], answer: 0, explanation: 'Support plus safety from pawns.' },
      { kind: 'quiz', question: 'If the opponent trades off your outpost knight, what usually happens?', options: ['You lose the outpost forever', 'A pawn recaptures and often gains a strong passed or protected pawn', 'The game is drawn', 'Your king becomes unsafe'], answer: 1, explanation: 'The supporting pawn recaptures and the square stays yours.' }
    ]
  },
  {
    id: 'advanced-endgames', level: 'advanced', title: 'Advanced endgame techniques', icon: '♕',
    summary: 'The Lucena bridge, the Philidor defence and pawn races.',
    steps: [
      {
        kind: 'concept', title: 'The Philidor defence', fen: '4k3/8/r7/4PK2/8/8/8/1R6 b - - 0 1', arrows: ['a6a1'],
        body: [
          'In rook + pawn vs rook, the defender keeps the rook on the **third rank** (here the 6th) to keep the enemy king out.',
          'When the pawn advances to that rank, the rook drops to the back and checks from behind. With correct play this is a draw.'
        ]
      },
      {
        kind: 'concept', title: 'The Lucena position', fen: '1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1',
        body: [
          'When the attacker\'s king stands in front of its pawn on the 7th rank, it wins by **building a bridge**: the rook goes to the 4th rank to shield the king from checks.',
          'First drive the enemy king away with a check, then bring the rook up.'
        ]
      },
      {
        kind: 'demo', title: 'Philidor in action', intro: 'The rook waits on the third rank, then checks from behind once the pawn advances.', fen: '4k3/8/r7/4PK2/8/8/8/1R6 b - - 0 1', orientation: 'b',
        moves: [
          { san: 'Rc6', note: 'Black waits along the 6th rank; White\'s king cannot reach f6 or d6.' },
          { san: 'e6', note: 'The pawn advances — now it no longer shelters the king.' },
          { san: 'Rc1', note: 'The rook drops back to check from behind.' },
          { san: 'Kf6', note: 'White\'s king comes forward…' },
          { san: 'Rf1+', note: '…and the checks begin. With correct play this is a draw.' }
        ]
      },
      {
        kind: 'exercise', title: 'Build the bridge', prompt: 'Start the Lucena winning method: check, then bring your rook to the 4th rank.',
        fen: '1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1', solution: ['Rd1+', 'Ke7', 'Rd4'], verify: 'winning',
        hint: 'Check on the d-file to cut the king off, then lift the rook to d4.',
        success: 'With the rook on d4, your king can walk out and block checks with the rook. That is the Lucena bridge.'
      },
      {
        kind: 'exercise', title: 'Pawn race', prompt: 'Both sides have dangerous pawns. Win the race.',
        fen: '8/8/2K5/1P3p2/1k2p1p1/6P1/6P1/8 w - - 1 59', solution: ['b6', 'e3', 'b7', 'e2', 'b8=Q+'], verify: 'best',
        hint: 'Count: your pawn needs three moves to queen. Can Black queen first?',
        success: 'You queen with check, one tempo ahead. (lichess puzzle 0opJy)'
      },
      { kind: 'quiz', question: 'In the Philidor defence, where does the defending rook stand first?', options: ['On the back rank', 'On the third rank from its own side', 'Behind the attacking pawn', 'Next to its king'], answer: 1, explanation: 'It keeps the enemy king from advancing until the pawn commits.' },
      { kind: 'quiz', question: 'What is "building a bridge" in the Lucena position?', options: ['Promoting to a rook', 'Using the rook on the 4th rank to block checks', 'Trading rooks', 'Advancing the king to the 8th rank'], answer: 1, explanation: 'The rook shields the king from checks along the file.' }
    ]
  },
  {
    id: 'tactical-combinations', level: 'advanced', title: 'Complex tactical combinations', icon: '✶',
    summary: 'Chaining several tactics into one forced sequence.',
    steps: [
      {
        kind: 'concept', title: 'Combining motifs', fen: '7k/1p4pp/p3rb2/3p4/8/PP4PP/2R4K/8 w - - 0 38',
        body: [
          'A **combination** is a forcing sequence that links several tactics — checks, deflections, decoys — to reach a winning result.',
          'Calculate forcing moves first. Here Black\'s back rank is weak, and every white move will be a check.'
        ]
      },
      {
        kind: 'demo', title: 'A chain of checks', intro: 'Every move is a check; Black only gets to block. (lichess puzzle 0qJOH)', fen: '6k1/2r2qpp/8/3pP3/3Pb2P/1R3RP1/1P3PK1/8 w - - 1 41',
        moves: [
          { san: 'Rb8+', note: 'Check on the back rank.' },
          { san: 'Rc8', note: 'Black blocks with the rook.' },
          { san: 'Rxc8+', note: 'Capture with check — the blocker is gone.' },
          { san: 'Qe8', note: 'Black blocks again, now with the queen.' },
          { san: 'Rxe8#', note: 'The last blocker falls. Mate.' }
        ]
      },
      {
        kind: 'exercise', title: 'Mate in three', prompt: 'Use the back rank: every move a check.', goal: 'mate',
        fen: '7k/1p4pp/p3rb2/3p4/8/PP4PP/2R4K/8 w - - 0 38', solution: ['Rc8+', 'Bd8', 'Rxd8+', 'Re8', 'Rxe8#'], verify: 'best',
        hint: 'Black can only block the checks. Keep capturing the blockers.',
        success: 'Rc8+ Bd8 Rxd8+ Re8 Rxe8# — the defenders were removed one by one. (lichess puzzle 1OKO0)'
      },
      {
        kind: 'exercise', title: 'Clearance and fork', prompt: 'Win material with a three-move combination.',
        fen: 'r1b2r2/pp1n2k1/2p3pp/4Np2/2BP4/8/PP4PP/2KRR3 w - - 1 19', solution: ['Nxd7', 'Bxd7', 'Re7+', 'Kf6', 'Rxd7'], verify: 'best',
        hint: 'Trade the knights, then a rook check hits the bishop that recaptured.',
        success: 'Nxd7 Bxd7 Re7+ forked king and bishop. (lichess puzzle 00Pc8)'
      },
      { kind: 'quiz', question: 'What should you calculate first when looking for a combination?', options: ['Quiet moves', 'Forcing moves: checks, captures, threats', 'Pawn moves', 'King moves'], answer: 1, explanation: 'Forcing moves limit the opponent\'s replies, making calculation possible.' },
      { kind: 'quiz', question: 'A combination usually involves…', options: ['One tactic only', 'Several linked tactical ideas', 'No sacrifices', 'Only endgames'], answer: 1, explanation: 'Linking motifs is what makes it a combination.' }
    ]
  }
]
