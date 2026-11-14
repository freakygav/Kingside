import type { Lesson } from './types'

/** Exercises marked "lichess #id" are positions from the lichess.org puzzle database (CC0). */
export const INTERMEDIATE: Lesson[] = [
  {
    id: 'forks', level: 'intermediate', title: 'Forks', icon: '⑂',
    summary: 'One piece attacking two targets at once.',
    steps: [
      {
        kind: 'concept', title: 'What is a fork?', fen: 'r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1', arrows: ['c7e8', 'c7a8'], orientation: 'w',
        body: [
          'A **fork** is a single piece attacking two (or more) enemy pieces at the same time. The opponent can usually save only one.',
          'Knights are the classic forking piece, but queens, pawns, bishops, rooks and even kings can fork. Forks with **check** are the most deadly, because the king must be dealt with first.'
        ]
      },
      {
        kind: 'demo', title: 'The royal fork', intro: 'The knight jumps in with check and wins the rook.', fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
        moves: [
          { san: 'Nc7+', note: 'Check! The knight attacks the king on e8 and the rook on a8.' },
          { san: 'Kd7', note: 'The king must move out of check.' },
          { san: 'Nxa8', note: 'White collects the rook.' }
        ]
      },
      {
        kind: 'exercise', title: 'Knight fork', prompt: 'Win the black queen with a knight fork.',
        fen: '2q1k3/8/8/1N6/8/8/8/4K3 w - - 0 1', solution: ['Nd6+', 'Ke7', 'Nxc8+'], verify: 'best',
        wrong: { 'Nc7+': 'Nc7+ checks the king, but it does not attack the queen on c8.', 'Na7': 'This attacks the queen, but she simply moves away.' },
        hint: 'Find a square from which the knight attacks both e8 and c8.',
        success: 'Nd6+ forked king and queen. The king had to move, and Nxc8 won the queen.'
      },
      {
        kind: 'exercise', title: 'Pawn fork', prompt: 'Even a humble pawn can fork. Win a piece.',
        fen: '4k3/8/8/2n1b3/8/2PP4/8/4K3 w - - 0 1', solution: ['d4'], verify: 'best',
        hint: 'A pawn on d4 would attack c5 and e5. Is d4 protected?',
        success: 'd4 attacks the knight and the bishop. The pawn is defended by c3, so Black loses a piece.'
      },
      { kind: 'quiz', question: 'Why are forks that give check especially strong?', options: ['Checks are worth extra points', 'The opponent must answer the check, so the other target falls', 'A check can never be blocked', 'They are always checkmate'], answer: 1, explanation: 'The king must be saved first, so the second target cannot be rescued.' },
      { kind: 'quiz', question: 'Which piece is most famous for forks?', options: ['King', 'Knight', 'Rook', 'Pawn'], answer: 1, explanation: 'Its L-shaped jump often hits two pieces that cannot attack it back.' }
    ]
  },
  {
    id: 'pins', level: 'intermediate', title: 'Pins', icon: '📌',
    summary: 'Freezing a piece in front of a more valuable one.',
    steps: [
      {
        kind: 'concept', title: 'Absolute and relative pins', fen: '4k3/8/2n5/1B6/8/8/8/4K3 w - - 0 1', arrows: ['b5e8'], squares: ['c6'],
        body: [
          'A **pin** happens when a piece cannot move because a more valuable piece stands behind it on the same line.',
          'Here the knight on c6 is **absolutely pinned**: moving it would expose the king, which is illegal. If a queen or rook stood behind instead, the pin would be **relative** — legal to break, but costly.'
        ]
      },
      {
        kind: 'demo', title: 'Attack the pinned piece', intro: 'A pinned piece cannot run away, so attack it again.', fen: 'r3k3/8/2n5/1B6/3P4/8/8/4K3 w - - 0 1',
        moves: [
          { san: 'd5', note: 'The pawn attacks the pinned knight. It cannot move.' },
          { san: 'Rc8', note: 'Black defends it, but a pawn attacking a knight still wins material.' },
          { san: 'dxc6', note: 'White wins the knight for a pawn.' }
        ]
      },
      {
        kind: 'exercise', title: 'Pin and win', prompt: 'Pin the black queen to her king.',
        fen: '4k3/8/8/4q3/8/8/5K2/R7 w - - 0 1', solution: ['Re1', 'Qxe1+', 'Kxe1'], verify: 'best',
        wrong: { 'Ra8+': 'A check, but after the king steps aside nothing is won.' },
        hint: 'Put your rook on the same file as the queen and the king.',
        success: 'Re1 pinned the queen: it could only take the rook, and your king recaptured. Queen for rook!'
      },
      { kind: 'quiz', question: 'A knight is pinned to its king. Can it legally move?', options: ['Yes, any time', 'No — that would expose the king to check', 'Only forward', 'Only to capture'], answer: 1, explanation: 'Moving it would leave your own king in check, which is illegal.' },
      { kind: 'quiz', question: 'Which pieces can create pins?', options: ['Knights and pawns', 'Bishops, rooks and queens', 'Only the king', 'Any piece'], answer: 1, explanation: 'Only long-range (line) pieces can pin.' }
    ]
  },
  {
    id: 'skewers', level: 'intermediate', title: 'Skewers', icon: '➶',
    summary: 'Attack the big piece; win the one behind it.',
    steps: [
      {
        kind: 'concept', title: 'A reversed pin', fen: '4q3/8/8/4k3/8/8/8/4R1K1 b - - 0 1', arrows: ['e1e5'], squares: ['e8'],
        body: [
          'A **skewer** is like a pin in reverse: the **more valuable** piece is in front. When it moves out of the attack, the piece behind it is captured.',
          'Here the king must move out of check, and the rook will take the queen on e8.'
        ]
      },
      {
        kind: 'demo', title: 'Bishop skewer', intro: 'Check first, then collect.', fen: '8/q7/8/8/3k4/8/7B/4K3 w - - 0 1',
        moves: [
          { san: 'Bg1+', note: 'The bishop checks the king along the g1–a7 diagonal. The queen stands behind the king.' },
          { san: 'Kd5', note: 'The king has to leave the diagonal.' },
          { san: 'Bxa7', note: 'The queen falls.' }
        ]
      },
      {
        kind: 'exercise', title: 'Rook skewer', prompt: 'Win the black queen with a skewer.',
        fen: '4q3/8/8/4k3/8/8/8/R5K1 w - - 0 1', solution: ['Re1+', 'Kd6', 'Rxe8'], verify: 'best',
        wrong: { 'Ra5+': 'Check, but nothing stands behind the king on that rank.' },
        hint: 'King and queen are on the same file.',
        success: 'Re1+ forced the king off the e-file and Rxe8 took the queen.'
      },
      { kind: 'quiz', question: 'In a skewer, which piece is in front?', options: ['The less valuable one', 'The more valuable one', 'Always a pawn', 'It does not matter'], answer: 1, explanation: 'The valuable piece must move, exposing the one behind.' },
      { kind: 'quiz', question: 'What is the difference between a pin and a skewer?', options: ['There is none', 'In a pin the valuable piece is behind; in a skewer it is in front', 'Skewers only use knights', 'Pins only happen on files'], answer: 1, explanation: 'Same geometry, reversed order.' }
    ]
  },
  {
    id: 'discovered-attacks', level: 'intermediate', title: 'Discovered attacks', icon: '◐',
    summary: 'Move one piece to unleash another.',
    steps: [
      {
        kind: 'concept', title: 'The hidden attacker', fen: '4k3/4q3/8/8/4B3/8/6PP/4R1K1 w - - 0 1', arrows: ['e1e7', 'e4c6'],
        body: [
          'A **discovered attack** happens when you move a piece out of the way and reveal an attack by the piece behind it.',
          'The moving piece can make its own threat — here the bishop can give check while the rook behind it attacks the queen. Two threats at once!'
        ]
      },
      {
        kind: 'demo', title: 'Discovered attack with check', intro: 'The bishop moves with check; the rook behind it wins the queen.', fen: '4k3/4q3/8/8/4B3/8/6PP/4R1K1 w - - 0 1',
        moves: [
          { san: 'Bc6+', note: 'Check from the bishop, and the e1-rook now attacks the queen.' },
          { san: 'Kf8', note: 'The queen cannot block on d7 — she is pinned to the king by the rook — so the king must move.' },
          { san: 'Rxe7', note: 'The rook takes the queen.' },
          { san: 'Kxe7', note: 'Black recaptures, but White has won a queen for a rook.' }
        ]
      },
      {
        kind: 'exercise', title: 'Discovered check', prompt: 'Move the knight to give a discovered check AND attack the queen.',
        fen: '3k4/8/8/8/3N3q/8/6PP/3R2K1 w - - 0 1', solution: ['Nf5+', 'Ke8', 'Nxh4'], alt: { 0: ['Nf3+'] }, verify: 'best',
        wrong: { 'Ne6+': 'Discovered check, but the knight on e6 does not attack the queen.', 'Nc6+': 'Discovered check, but the queen is not attacked.' },
        hint: 'Moving the knight off the d-file gives check from the rook. Which knight move also hits h4?',
        success: 'The rook gave check, so Black had no time to save the queen from the knight.'
      },
      { kind: 'quiz', question: 'In a discovered attack, which piece makes the hidden attack?', options: ['The piece that moves', 'The piece behind it', 'The king', 'A pawn'], answer: 1, explanation: 'The moving piece "discovers" the line for the piece behind.' },
      { kind: 'quiz', question: 'What is a "double check"?', options: ['Two checks in two moves', 'Both the moving piece and the discovered piece give check', 'A check from a queen', 'Check plus a fork'], answer: 1, explanation: 'Only a king move can answer a double check.' }
    ]
  },
  {
    id: 'double-attacks', level: 'intermediate', title: 'Double attacks', icon: '⚔',
    summary: 'Create two threats; your opponent can only parry one.',
    steps: [
      {
        kind: 'concept', title: 'Two threats, one move', fen: '6k1/5ppp/8/1n5b/8/8/5PPP/3Q2K1 w - - 0 1', squares: ['b5', 'h5'],
        body: [
          'A **double attack** creates two separate threats with one move. Forks are one kind; a check plus a threat, or an attack on two loose pieces, are others.',
          'Undefended pieces are the easiest targets — remember the rule "loose pieces drop off".'
        ]
      },
      {
        kind: 'demo', title: 'Queen hits two loose pieces', intro: 'Both black minor pieces are undefended.', fen: '6k1/5ppp/8/1n5b/8/8/5PPP/3Q2K1 w - - 0 1',
        moves: [
          { san: 'Qd5', note: 'The queen attacks the knight on b5 and the bishop on h5 along the 5th rank.' },
          { san: 'Bg6', note: 'Black saves the bishop…' },
          { san: 'Qxb5', note: '…and the knight is lost.' }
        ]
      },
      {
        kind: 'exercise', title: 'Check and attack', prompt: 'Win the black rook with a double attack.',
        fen: 'r5k1/8/8/8/8/8/8/3Q2K1 w - - 0 1', solution: ['Qd5+', 'Kh8', 'Qxa8+'], verify: 'best',
        wrong: { 'Qa4': 'This attacks the rook, but the rook simply moves away — there is no second threat.', 'Qd8+': 'A check, but the rook takes your queen: …Rxd8.' },
        hint: 'Find a queen check along a diagonal that also lines up with the a8-rook on another diagonal.',
        success: 'Qd5+ checked the king along the d5–g8 diagonal and attacked the rook along d5–a8. The king moved and the rook fell.'
      },
      { kind: 'quiz', question: 'Which pieces are the easiest targets for double attacks?', options: ['Defended pieces', 'Undefended (loose) pieces', 'Pawns on the 2nd rank', 'Kings'], answer: 1, explanation: 'If a piece is undefended, attacking it is a real threat.' },
      { kind: 'quiz', question: 'Is a fork a type of double attack?', options: ['Yes', 'No'], answer: 0, explanation: 'A fork is a double attack made by one piece on two targets.' }
    ]
  },
  {
    id: 'deflection', level: 'intermediate', title: 'Deflection', icon: '↯',
    summary: 'Force a defender away from its job.',
    steps: [
      {
        kind: 'concept', title: 'Overworked defenders', fen: '2n5/1KPk4/8/4P2p/7P/8/8/8 w - - 0 78', squares: ['d7', 'c8'],
        body: [
          'A **deflection** forces an enemy piece away from a square or piece it is defending.',
          'Here the black king defends the knight on c8, which blocks White\'s c-pawn. If the king can be lured away, the knight falls and the pawn promotes. (lichess puzzle K2I6o)'
        ]
      },
      {
        kind: 'demo', title: 'Deflecting the guard of g8', intro: 'The black king guards g8. A pawn check pushes it away. (lichess puzzle 22PsY)', fen: '5k2/8/1r2BKP1/8/5P2/8/8/1q6 w - - 0 62',
        moves: [
          { san: 'g7+', note: 'The pawn checks the king on f8.' },
          { san: 'Ke8', note: 'The king is forced off f8, the square that guarded g8.' },
          { san: 'g8=Q#', note: 'The pawn queens with mate; the bishop on e6 covers d7 and f7.' }
        ]
      },
      {
        kind: 'exercise', title: 'Deflect the king', prompt: 'Force the black king away from the knight.',
        fen: '2n5/1KPk4/8/4P2p/7P/8/8/8 w - - 0 78', solution: ['e6+', 'Kxe6', 'Kxc8'], verify: 'best',
        wrong: { 'Kb8': 'The king guards c8, so the knight is safe for now.' },
        hint: 'A pawn check can drag the king off the d7-square.',
        success: 'e6+ deflected the king. Kxc8 wins the knight and the c-pawn will queen.'
      },
      {
        kind: 'exercise', title: 'Deflect the rook', prompt: 'The rook on d8 is the king\'s only neighbour on the back rank. Win material.',
        fen: '2kr4/2pb4/8/3P4/R3Pppr/8/7N/5NK1 w - - 1 41', solution: ['Ra8+', 'Kb7', 'Rxd8'], verify: 'best',
        hint: 'Check on the back rank forces the king to move — onto a square that no longer protects d8.',
        success: 'Ra8+ drove the king to b7, away from d8, and the rook captured on d8. (lichess puzzle r5lMz)'
      },
      { kind: 'quiz', question: 'What does a deflection do?', options: ['Blocks a line', 'Forces a defender away from its duty', 'Promotes a pawn', 'Swaps queens'], answer: 1, explanation: 'Once the defender leaves, what it protected is vulnerable.' },
      { kind: 'quiz', question: 'Which defenders are easiest to deflect?', options: ['Pieces with one job', 'Overloaded pieces with several jobs', 'Pawns on the 2nd rank', 'Pieces far from the action'], answer: 1, explanation: 'A piece guarding two things cannot keep both duties.' }
    ]
  },
  {
    id: 'decoy', level: 'intermediate', title: 'Decoy tactics', icon: '🎣',
    summary: 'Lure an enemy piece onto a fatal square.',
    steps: [
      {
        kind: 'concept', title: 'Attraction', fen: '3Rrk2/5p1p/2N1p1pP/4p3/2p1P3/5n2/P1r5/3R1K2 w - - 0 32', squares: ['e8'],
        body: [
          'A **decoy** (or attraction) sacrifice lures an enemy piece — often the king — onto a square where a tactic works.',
          'If the black king stood on e8, a rook check on d8 would be mate (the knight on c6 covers e7 and d8).'
        ]
      },
      {
        kind: 'demo', title: 'Clearing the way for a pawn', intro: 'A rook sacrifice lures the king to c8 so the a-pawn can promote. (lichess puzzle TfozC)', fen: 'R1n5/P1k5/1p4p1/8/1P1b4/8/7K/8 w - - 1 47',
        moves: [
          { san: 'Rxc8+', note: 'The rook captures the knight that guarded a7 and a8.' },
          { san: 'Kxc8', note: 'The king is attracted to c8 by recapturing…' },
          { san: 'a8=Q+', note: '…and the pawn promotes with check.' }
        ]
      },
      {
        kind: 'exercise', title: 'Lure the king', prompt: 'Sacrifice to bring the king to e8, then mate.', goal: 'mate',
        fen: '3Rrk2/5p1p/2N1p1pP/4p3/2p1P3/5n2/P1r5/3R1K2 w - - 0 32', solution: ['Rxe8+', 'Kxe8', 'Rd8#'], verify: 'best',
        hint: 'Capture on e8 so the king has to take back.',
        success: 'Rxe8+ forced Kxe8 and Rd8 was mate. (lichess puzzle AZoNJ)'
      },
      {
        kind: 'exercise', title: 'Sacrifice on h7', prompt: 'Drag the king to h7 and mate on the h-file.', goal: 'mate',
        fen: 'r5rk/5p1n/4pPp1/pp1pP3/3q2P1/2N3RR/PP5P/7K w - - 0 27', solution: ['Rxh7+', 'Kxh7', 'Rh3#'], verify: 'best',
        hint: 'Your rooks are doubled. Take the knight on h7 with check.',
        success: 'Rxh7+ attracted the king to h7 and the second rook mated on h3. (lichess puzzle nijgH)'
      },
      { kind: 'quiz', question: 'What is the purpose of a decoy sacrifice?', options: ['To trade pieces', 'To pull an enemy piece onto a square where a tactic works', 'To promote a pawn', 'To gain a tempo in the opening'], answer: 1, explanation: 'Attraction puts the target exactly where you want it.' },
      { kind: 'quiz', question: 'Which piece is most often the target of attraction?', options: ['King', 'Pawn', 'Rook', 'Bishop'], answer: 0, explanation: 'Dragging the king onto a bad square sets up checkmates and forks.' }
    ]
  },
  {
    id: 'removing-defender', level: 'intermediate', title: 'Removing the defender', icon: '✂',
    summary: 'Capture the piece that holds everything together.',
    steps: [
      {
        kind: 'concept', title: 'Who is guarding what?', fen: '1r2kr2/pp3p1p/2b1p3/4N3/2P1n3/1N1B4/P3KP1P/6R1 w - - 5 22', arrows: ['c6e4'],
        body: [
          'Before attacking a piece, ask what is defending it. If you can **capture the defender**, the target becomes free.',
          'The black knight on e4 is attacked by White\'s bishop and defended only by the bishop on c6.'
        ]
      },
      {
        kind: 'demo', title: 'The defender disappears', intro: 'The e6-bishop protects the knight on d7. (lichess puzzle 6nrQq)', fen: 'r4rk1/pp1n1pb1/4bp1p/8/3NP3/2P5/P4PPP/2KR1B1R w - - 1 17',
        moves: [
          { san: 'Nxe6', note: 'White captures the bishop that guarded d7.' },
          { san: 'fxe6', note: 'Black recaptures…' },
          { san: 'Rxd7', note: '…and the knight on d7 is now undefended.' }
        ]
      },
      {
        kind: 'exercise', title: 'Take the defender', prompt: 'Win the knight on e4 by removing its only defender.',
        fen: '1r2kr2/pp3p1p/2b1p3/4N3/2P1n3/1N1B4/P3KP1P/6R1 w - - 5 22', solution: ['Nxc6', 'bxc6', 'Bxe4'], verify: 'best',
        wrong: { 'Bxe4': 'Black recaptures with the bishop: …Bxe4. Remove that bishop first.' },
        hint: 'Your e5-knight can capture the c6-bishop.',
        success: 'Nxc6 removed the defender, and Bxe4 won the knight. (lichess puzzle 00Bp0)'
      },
      { kind: 'quiz', question: 'What is the first question to ask before attacking a piece?', options: ['Is it a knight?', 'What is defending it?', 'Is it on a light square?', 'Has it moved?'], answer: 1, explanation: 'Remove or overload the defender, and the target falls.' },
      { kind: 'quiz', question: 'Removing the defender often involves…', options: ['A capture or exchange', 'Castling', 'A pawn promotion', 'Stalemate'], answer: 0, explanation: 'Usually you capture the defender, even giving up material to do so.' }
    ]
  },
  {
    id: 'back-rank-mate', level: 'intermediate', title: 'Back-rank checkmate', icon: '▁',
    summary: 'Punishing a king trapped behind its own pawns.',
    steps: [
      {
        kind: 'concept', title: 'The pattern', fen: 'R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', arrows: ['a8g8'],
        body: [
          'When the king sits on its first rank with its own pawns in front, a rook or queen check along that rank can be **mate**.',
          'Defenders often guard the back rank with a rook; deflecting or overloading that guard is a common way to break through.'
        ]
      },
      {
        kind: 'demo', title: 'Overloaded queen', intro: 'Black\'s queen guards the e8-rook and the back rank at once. (lichess puzzle 0YPDM)', fen: 'k3r3/pp3Q2/1p6/1q6/1P6/8/Pb2RPP1/5KNr w - - 2 33',
        moves: [
          { san: 'Qxe8+', note: 'The queen captures the rook with check.' },
          { san: 'Qxe8', note: 'Black must recapture with the queen…' },
          { san: 'Rxe8#', note: '…and the e2-rook mates on the back rank: a7 and b7 are blocked by Black\'s own pawns.' }
        ]
      },
      {
        kind: 'exercise', title: 'Mate in one', prompt: 'Black to move. Find the back-rank mate.', goal: 'mate', orientation: 'b',
        fen: 'r4r1k/1p1R2pn/p3Q3/8/8/1P6/P5PP/5R1K b - - 0 26', solution: ['Rxf1#'], verify: 'best',
        hint: 'White\'s king is trapped behind g2 and h2.',
        success: 'Rxf1 is mate — nothing can capture or block. (lichess puzzle 06XTF)'
      },
      {
        kind: 'exercise', title: 'Sacrifice first', prompt: 'Black to move. Remove the guard of the back rank, then mate.', goal: 'mate', orientation: 'b',
        fen: '4r1k1/2p2ppp/3pq3/1Q6/2r5/2P5/P4PPP/R3R1K1 b - - 4 23', solution: ['Qxe1+', 'Rxe1', 'Rxe1#'], verify: 'best',
        hint: 'The e1-rook is defended once, but attacked twice.',
        success: 'Qxe1+ Rxe1 Rxe1#. The queen sacrifice removed the last defender. (lichess puzzle 08FDm)'
      },
      { kind: 'quiz', question: 'What is the simplest prevention of back-rank mate?', options: ['Trade queens', 'Make "luft" by moving a pawn in front of the king', 'Move the king to the centre', 'Keep both rooks on the 7th'], answer: 1, explanation: 'An escape square means a back-rank check is no longer mate.' },
      { kind: 'quiz', question: 'A rook guards your back rank and also defends a knight. What is that rook?', options: ['Pinned', 'Overloaded', 'Trapped', 'Promoted'], answer: 1, explanation: 'Overloaded pieces with two jobs are prime deflection targets.' }
    ]
  },
  {
    id: 'basic-endgames', level: 'intermediate', title: 'Basic endgame principles', icon: '♔',
    summary: 'Active kings, passed pawns, and the rule of the square.',
    steps: [
      {
        kind: 'concept', title: 'Activate your king', fen: '8/5k2/8/p4K2/3p4/8/PP6/8 b - - 1 59',
        body: [
          'With fewer pieces on the board, the king is safe and becomes a fighting piece. **Centralise it.**',
          'A **passed pawn** has no enemy pawns in front of it or on neighbouring files. Push passed pawns — the opponent has to give up a piece or the king\'s position to stop them.'
        ]
      },
      {
        kind: 'concept', title: 'The rule of the square', fen: '7k/8/8/8/p7/8/3K4/8 b - - 0 1', squares: ['a4', 'b4', 'c4', 'd4', 'a1', 'b1', 'c1', 'd1', 'd3', 'd2'],
        body: [
          'Draw a square from the pawn to its promotion rank. If the defending king can step inside this square, it catches the pawn.',
          'Here the king on d2 is already inside the a4–d4–d1–a1 square, so it stops the pawn.'
        ]
      },
      {
        kind: 'demo', title: 'Catching the pawn', intro: 'The king enters the square in time.', fen: '7k/8/8/8/p7/8/3K4/8 b - - 0 1',
        moves: [
          { san: 'a3', note: 'The pawn runs.' },
          { san: 'Kc2', note: 'The king follows diagonally, staying inside the square.' },
          { san: 'a2', note: 'One step from queening…' },
          { san: 'Kb2', note: '…but the king stops it and will capture next.' }
        ]
      },
      {
        kind: 'exercise', title: 'Stop the pawn', prompt: 'Move your king so that it can still catch the a-pawn.',
        fen: '7k/8/8/8/p7/8/8/3K4 w - - 0 1', solution: ['Kc2'], alt: { 0: ['Kc1', 'Kd2'] }, verify: 'best',
        wrong: { Ke2: 'Going the other way lets the pawn run: …a3, …a2, …a1=Q and your king is a step too slow.', Ke1: 'Going the other way lets the pawn run: your king ends up a step too slow.' },
        hint: 'Move the king diagonally toward the pawn into its square.',
        success: 'Your king is now inside the square and will catch the pawn.'
      },
      {
        kind: 'exercise', title: 'Push the passer', prompt: 'Black to move. Your passed d-pawn is faster than everything White has.', orientation: 'b',
        fen: '8/5k2/8/p4K2/3p4/8/PP6/8 b - - 1 59', solution: ['d3', 'Kf4', 'd2'], verify: 'best',
        hint: 'White\'s king is too far away. Run!',
        success: 'The d-pawn will promote; White\'s king can\'t catch it. (lichess puzzle 1IPSc)'
      },
      { kind: 'quiz', question: 'What should your king do in most endgames?', options: ['Hide in the corner', 'Become active and head to the centre', 'Stay on the back rank', 'Follow the opponent\'s king'], answer: 1, explanation: 'With few pieces left, the king is a strong attacking and defending piece.' },
      { kind: 'quiz', question: 'What is a passed pawn?', options: ['A pawn that has moved twice', 'A pawn with no enemy pawns ahead of it on its own or neighbouring files', 'Any pawn on the 7th rank', 'A pawn that captured en passant'], answer: 1, explanation: 'Nothing pawn-shaped can stop it.' }
    ]
  },
  {
    id: 'rook-endgames', level: 'intermediate', title: 'Rook endgames', icon: '♖',
    summary: 'Active rooks, rooks behind passed pawns, and back-rank tricks.',
    steps: [
      {
        kind: 'concept', title: 'Activity first', fen: '1r4k1/8/8/P7/8/8/5PPP/R5K1 w - - 0 1', arrows: ['a1a5'],
        body: [
          'Rook endgames are the most common endgames. The golden rule: **rooks belong behind passed pawns** — yours or the opponent\'s.',
          'An active rook that attacks pawns or cuts off the enemy king is often worth more than a pawn.'
        ]
      },
      {
        kind: 'demo', title: 'Back-rank mate in a rook ending', intro: 'Even with few pieces, the back rank matters.', fen: '5k2/2R3pp/4Kp2/5P2/4P3/8/8/3r4 w - - 4 53',
        moves: [
          { san: 'Rc8+', note: 'Check on the back rank.' },
          { san: 'Rd8', note: 'Black must block.' },
          { san: 'Rxd8#', note: 'Mate — the white king covers e7 and f7. (lichess puzzle 0RAjl)' }
        ]
      },
      {
        kind: 'exercise', title: 'Skewer in a rook ending', prompt: 'Win Black\'s rook.',
        fen: '3r4/4p3/6p1/1p1kPp1p/5P1P/1P1p4/6P1/3R2K1 w - - 1 41', solution: ['Rxd3+', 'Ke4', 'Rxd8'], verify: 'best',
        hint: 'Capture with check; the king must leave the d-file.',
        success: 'Rxd3+ was a skewer: the king stepped aside and the rook on d8 fell. (lichess puzzle 0FvQ7)'
      },
      { kind: 'quiz', question: 'Where does a rook belong relative to a passed pawn?', options: ['In front of it', 'Behind it', 'Next to it', 'On the opposite wing'], answer: 1, explanation: 'Behind the pawn, the rook gains scope as the pawn advances.' },
      { kind: 'quiz', question: 'Which is usually more important in a rook ending?', options: ['Rook activity', 'Keeping every pawn at all costs', 'Keeping the king on the back rank', 'Avoiding all checks'], answer: 0, explanation: 'Passive rooks lose; active rooks often save or win.' }
    ]
  },
  {
    id: 'king-pawn-endgames', level: 'intermediate', title: 'King and pawn endgames', icon: '♙',
    summary: 'Opposition, key squares and counting tempi.',
    steps: [
      {
        kind: 'concept', title: 'The opposition', fen: '8/8/4k3/8/4K3/8/4P3/8 b - - 0 1', squares: ['e4', 'e6'],
        body: [
          'When two kings face each other with one square between them, the side that **does not** have to move "has the opposition".',
          'Here Black is to move and must give way, so White\'s king can advance. With king in front of the pawn and the opposition, White wins.'
        ]
      },
      {
        kind: 'demo', title: 'Outflanking', intro: 'The defending king must step aside; White\'s king walks forward.', fen: '8/8/4k3/8/4K3/8/4P3/8 b - - 0 1',
        moves: [
          { san: 'Kd6', note: 'Black steps to one side.' },
          { san: 'Kf5', note: 'White goes the other way, gaining ground.' },
          { san: 'Ke7', note: 'Black tries to block.' },
          { san: 'Ke5', note: 'White takes the opposition again.' },
          { san: 'Kf7', note: 'Black must give way again…' },
          { san: 'Kd6', note: '…and White\'s king reaches the key square in front of the pawn.' }
        ]
      },
      {
        kind: 'exercise', title: 'Win the pawn', prompt: 'Black\'s king must give way. Approach so you win the g5-pawn.',
        fen: '8/8/8/6p1/5KPk/8/8/8 w - - 0 81', solution: ['Kf5', 'Kh3', 'Kxg5'], verify: 'best',
        hint: 'Attack the pawn on g5 from the side where it is defended only once.',
        success: 'Kf5 attacks g5; the black king cannot hold it. (lichess puzzle 03mv2)'
      },
      { kind: 'quiz', question: 'Who "has the opposition" when kings face each other with one square between?', options: ['The side to move', 'The side NOT to move', 'Always White', 'The side with more pawns'], answer: 1, explanation: 'The side to move has to give way.' },
      { kind: 'quiz', question: 'In king and pawn endings, where should the attacking king usually be?', options: ['Behind its pawn', 'In front of its pawn', 'On the edge', 'Next to the enemy pawns'], answer: 1, explanation: 'A king in front of its pawn controls the key squares.' }
    ]
  }
]
