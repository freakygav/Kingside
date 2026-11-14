import type { Lesson } from './types'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export const BEGINNER: Lesson[] = [
  {
    id: 'piece-movement', level: 'beginner', title: 'How the pieces move', icon: '♞',
    summary: 'King, queen, rook, bishop, knight and pawn: where each one can go.',
    steps: [
      {
        kind: 'concept', title: 'Meet the pieces', fen: START,
        body: [
          'Each side starts with 16 pieces: 8 pawns, 2 rooks, 2 knights, 2 bishops, a queen and a king.',
          'The **rook** moves any distance in straight lines (up, down, left, right). The **bishop** moves any distance diagonally. The **queen** combines both.',
          'The **king** moves one square in any direction. The **pawn** moves forward and captures diagonally. The **knight** jumps in an L-shape.'
        ]
      },
      {
        kind: 'concept', title: "The knight's L-shape", fen: '8/8/8/8/3N4/8/8/K6k w - - 0 1',
        squares: ['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'],
        body: [
          'The knight moves two squares in one direction and then one square to the side, like a capital L.',
          'It is the only piece that can **jump over** other pieces. From d4 it reaches the eight highlighted squares.'
        ]
      },
      {
        kind: 'demo', title: 'Long-range pieces in action', intro: 'Step through the moves to watch the rook, bishop and king move.',
        fen: '4k3/8/8/8/8/8/8/R3KB2 w - - 0 1',
        moves: [
          { san: 'Ra6', note: 'The rook slides straight up the a-file as far as it likes.' },
          { san: 'Kd7', note: 'The black king steps one square diagonally.' },
          { san: 'Bb5+', note: 'The bishop travels diagonally from f1 to b5 and gives check along the b5–e8 diagonal.' },
          { san: 'Kc7', note: 'The king must step out of the bishop\'s line.' },
          { san: 'Kd2', note: 'The white king moves just one square.' }
        ]
      },
      {
        kind: 'exercise', title: 'Knight capture', prompt: 'Use your knight to capture the black rook.',
        fen: '4k3/8/8/1r6/8/2N5/8/7K w - - 0 1', solution: ['Nxb5'], verify: 'best',
        hint: 'Count two squares up and one to the left from c3.',
        success: 'The knight jumped from c3 to b5 in an L-shape and won a whole rook.'
      },
      {
        kind: 'exercise', title: 'Bishop capture', prompt: 'Your bishop can capture the black queen. Find it!',
        fen: '4k3/8/8/8/4q3/8/2B5/K7 w - - 0 1', solution: ['Bxe4'], verify: 'best',
        hint: 'Bishops move diagonally. Follow the diagonal from c2 up and to the right.',
        success: 'The bishop slid along the c2–e4 diagonal and captured the queen — the most valuable piece.'
      },
      { kind: 'quiz', question: 'Which piece can jump over other pieces?', options: ['Bishop', 'Knight', 'Rook', 'Queen'], answer: 1, explanation: 'Only the knight jumps. Every other piece is blocked by anything standing in its path.' },
      { kind: 'quiz', question: 'How does a pawn capture?', options: ['Straight forward', 'One square diagonally forward', 'In any direction', 'Backward'], answer: 1, explanation: 'Pawns move straight ahead but capture one square diagonally forward.' }
    ]
  },
  {
    id: 'basic-rules', level: 'beginner', title: 'Basic chess rules', icon: '♙',
    summary: 'Setting up the board, who moves first, pawn moves, and how games end.',
    steps: [
      {
        kind: 'concept', title: 'Setting up', fen: START,
        body: [
          'Place the board so each player has a **light square in the right-hand corner**.',
          'The queen goes on the square of her own colour (white queen on d1, black queen on d8). **White always moves first**, then the players alternate.',
          'The goal is to **checkmate** the opponent\'s king. You can also draw, for example by stalemate or agreement.'
        ]
      },
      {
        kind: 'concept', title: 'Pawn moves', fen: START, arrows: ['e2e4', 'd2d3'],
        body: [
          'A pawn moves one square forward. On its very first move it may move **two squares** instead.',
          'Pawns never move backward, and they capture diagonally (one square forward to the left or right).',
          'A pawn that reaches the last rank is **promoted** to another piece — usually a queen.'
        ]
      },
      {
        kind: 'demo', title: 'The first moves of a game', intro: 'A typical start. Notice how both sides bring pawns and pieces toward the centre.', fen: START,
        moves: [
          { san: 'e4', note: 'White moves the e-pawn two squares — allowed on its first move.' },
          { san: 'e5', note: 'Black answers symmetrically.' },
          { san: 'Nf3', note: 'The knight jumps over the pawns. It attacks Black\'s e5-pawn.' },
          { san: 'Nc6', note: 'Black defends the pawn with a knight.' },
          { san: 'Bb5', note: 'The bishop comes out. Both sides are developing their pieces.' }
        ]
      },
      {
        kind: 'exercise', title: 'Pawns capture diagonally', prompt: 'Your e-pawn is blocked. Use it to capture the knight instead.',
        fen: '4k3/8/8/3np3/4P3/8/8/4K3 w - - 0 1', solution: ['exd5'], verify: 'best',
        wrong: { Kd2: 'A king move is legal, but you leave the knight alone. Your pawn can capture it!' },
        hint: 'Pawns capture one square diagonally forward.',
        success: 'Exactly — the pawn captured diagonally from e4 to d5 and won a knight.'
      },
      { kind: 'quiz', question: 'Who makes the first move in a game of chess?', options: ['Black', 'White', 'Whoever wins a coin toss', 'The stronger player'], answer: 1, explanation: 'White always moves first.' },
      { kind: 'quiz', question: 'A player who is NOT in check has no legal moves. What happens?', options: ['They lose', 'They skip a turn', 'The game is a draw (stalemate)', 'They may move twice next turn'], answer: 2, explanation: 'That is stalemate, and the game is drawn.' }
    ]
  },
  {
    id: 'check-checkmate', level: 'beginner', title: 'Check and checkmate', icon: '♚',
    summary: 'What check means, the three ways out, and how checkmate ends the game.',
    steps: [
      {
        kind: 'concept', title: 'Check', fen: '4k3/8/8/8/8/8/8/4R1K1 b - - 0 1', arrows: ['e1e8'],
        body: [
          'A king that is attacked is **in check**. The rook on e1 is giving check to the black king.',
          'You must get out of check immediately. There are three ways: **move** the king, **block** the attack, or **capture** the attacking piece.'
        ]
      },
      {
        kind: 'concept', title: 'Checkmate', fen: 'R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', arrows: ['a8g8'],
        body: [
          'If a king is in check and **none** of the three escapes works, it is **checkmate** and the game is over.',
          'Here the rook checks along the back row. The king cannot move (its own pawns block it), nothing can block, and nothing can capture the rook.'
        ]
      },
      {
        kind: 'demo', title: "Scholar's mate", intro: 'A famous quick checkmate. Watch the queen and bishop team up on f7.', fen: START,
        moves: [
          { san: 'e4', note: 'White opens lines for the queen and bishop.' },
          { san: 'e5', note: 'Black does the same.' },
          { san: 'Bc4', note: 'The bishop aims at f7, which only the king defends.' },
          { san: 'Nc6', note: 'Black develops but ignores the threat.' },
          { san: 'Qh5', note: 'The queen also attacks f7. Two attackers, one defender!' },
          { san: 'Nf6', note: 'A mistake: Black attacks the queen but leaves f7 weak.' },
          { san: 'Qxf7#', note: 'Checkmate. The queen is protected by the bishop, so the king cannot take it.' }
        ]
      },
      {
        kind: 'exercise', title: 'Mate in one', prompt: 'Checkmate the black king in one move.', goal: 'mate',
        fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', solution: ['Ra8#'], verify: 'best',
        hint: 'The black king is trapped behind its own pawns. Attack the back row.',
        success: 'Back-row checkmate: the pawns on f7, g7 and h7 take away every escape square.'
      },
      {
        kind: 'exercise', title: 'Queen and king together', prompt: 'Find a checkmate with your queen.', goal: 'mate',
        fen: 'k7/8/1K6/8/8/8/7Q/8 w - - 0 1', solution: ['Qh8#'], verify: 'best',
        hint: 'Your king already covers a7 and b7. Check from far away along the 8th rank.',
        success: 'The queen checks along the back rank and your king covers the squares in front. That is checkmate.'
      },
      { kind: 'quiz', question: 'Your king is in check. Which of these is NOT a legal way out?', options: ['Move the king', 'Block the check', 'Capture the checking piece', 'Castle'], answer: 3, explanation: 'You may never castle out of check.' },
      { kind: 'quiz', question: 'What is checkmate?', options: ['Any check', 'Capturing the king', 'A check with no way to escape', 'When you have no pieces left'], answer: 2, explanation: 'Checkmate is a check that cannot be answered. Kings are never actually captured.' }
    ]
  },
  {
    id: 'castling', level: 'beginner', title: 'Castling', icon: '♜',
    summary: 'The special king-and-rook move that tucks your king into safety.',
    steps: [
      {
        kind: 'concept', title: 'The rules of castling', fen: 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1', arrows: ['e1g1', 'e1c1'],
        body: [
          'Castling moves the king **two squares** toward a rook, and the rook jumps to the square the king passed over.',
          'You may castle only if: neither the king nor that rook has moved, the squares between them are empty, the king is **not in check**, and the king does not pass through or land on an attacked square.'
        ]
      },
      {
        kind: 'demo', title: 'Both sides castle', intro: 'White castles kingside, Black castles queenside.', fen: 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 1',
        moves: [
          { san: 'O-O', note: 'Kingside castling: king e1→g1, rook h1→f1.' },
          { san: 'O-O-O', note: 'Queenside castling: king e8→c8, rook a8→d8. The rook is now active on the d-file.' }
        ]
      },
      {
        kind: 'exercise', title: 'Castle kingside', prompt: 'Your pieces are developed. Put your king in safety by castling kingside.',
        fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5', solution: ['O-O'], verify: 'sound',
        hint: 'Drag the king two squares toward the h1-rook.',
        success: 'Your king is safe behind three pawns, and the rook has come toward the centre.'
      },
      {
        kind: 'exercise', title: 'When kingside is not allowed', prompt: 'The black bishop controls f1, so you cannot castle kingside. Castle the other way.',
        fen: 'r3k2r/8/8/8/2b5/8/8/R3K2R w KQkq - 0 1', solution: ['O-O-O'], verify: 'legal', squares: ['f1'],
        hint: 'Move the king two squares toward the a1-rook.',
        success: 'Correct. The king may not cross f1 because it is attacked, but the queenside path (d1, c1) is safe.'
      },
      { kind: 'quiz', question: 'Can you castle while your king is in check?', options: ['Yes', 'No', 'Only kingside', 'Only queenside'], answer: 1, explanation: 'Castling is never allowed out of, through, or into check.' },
      { kind: 'quiz', question: 'Where does White\'s king land after castling kingside?', options: ['f1', 'g1', 'h1', 'e2'], answer: 1, explanation: 'King e1→g1 and the rook h1→f1.' }
    ]
  },
  {
    id: 'en-passant', level: 'beginner', title: 'En passant', icon: '♟',
    summary: 'The special pawn capture that only exists for one move.',
    steps: [
      {
        kind: 'concept', title: 'Capturing "in passing"', fen: 'rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', arrows: ['e5d6'], squares: ['d5', 'd6'],
        body: [
          'Black just moved the d-pawn **two squares**, from d7 to d5, landing right beside White\'s pawn on e5.',
          'If it had moved only one square, the e5-pawn could have captured it. **En passant** lets White capture it anyway, as if it had moved one square: the white pawn goes to d6 and the d5-pawn is removed.',
          'This capture is allowed **only on the very next move**.'
        ]
      },
      {
        kind: 'demo', title: 'En passant in a game', intro: 'Watch the white pawn capture "in passing".', fen: START,
        moves: [
          { san: 'e4', note: 'White advances.' },
          { san: 'Nf6', note: 'Black attacks the pawn.' },
          { san: 'e5', note: 'The pawn moves on to the 5th rank, chasing the knight.' },
          { san: 'd5', note: 'Black pushes two squares, next to White\'s pawn.' },
          { san: 'exd6', note: 'En passant! The pawn captures diagonally to d6 and the d5-pawn disappears.' }
        ]
      },
      {
        kind: 'exercise', title: 'Your turn', prompt: 'Black just played …e7-e5. Capture the e-pawn en passant.',
        fen: 'rnbqkbnr/pp1p1ppp/8/2pPp3/8/8/PPP1PPPP/RNBQKBNR w KQkq e6 0 3', solution: ['dxe6'], verify: 'legal',
        hint: 'Your d5-pawn captures diagonally onto e6, the square the black pawn skipped.',
        success: 'Correct: d5xe6 en passant. The black pawn on e5 is removed.'
      },
      { kind: 'quiz', question: 'When may you capture en passant?', options: ['Any time an enemy pawn stands next to yours', 'Only on the move right after the enemy pawn advanced two squares', 'Only with a knight', 'Only in the endgame'], answer: 1, explanation: 'The right expires if you do not use it immediately.' },
      { kind: 'quiz', question: 'Where does your pawn end up after capturing en passant?', options: ['On the captured pawn\'s square', 'On the square the enemy pawn skipped over', 'On the 8th rank', 'It stays where it was'], answer: 1, explanation: 'It lands on the square that was passed over, as if the enemy pawn had moved only one square.' }
    ]
  },
  {
    id: 'promotion', level: 'beginner', title: 'Pawn promotion', icon: '♛',
    summary: 'Turning a pawn into a queen — or sometimes a knight.',
    steps: [
      {
        kind: 'concept', title: 'Reaching the last rank', fen: '8/4P3/8/8/8/2k5/8/4K3 w - - 0 1', arrows: ['e7e8'],
        body: [
          'When a pawn reaches the far end of the board it **must** be promoted to a queen, rook, bishop or knight of the same colour.',
          'Almost always you choose a queen, but sometimes a knight is better (this is called **underpromotion**).'
        ]
      },
      {
        kind: 'demo', title: 'A new queen', intro: 'The pawn promotes and the new queen goes straight to work.', fen: '8/4P3/8/8/8/2k5/8/4K3 w - - 0 1',
        moves: [
          { san: 'e8=Q', note: 'The pawn becomes a queen.' },
          { san: 'Kb2', note: 'Black\'s king tries to get away.' },
          { san: 'Qe5+', note: 'The new queen gives check from far away.' }
        ]
      },
      {
        kind: 'exercise', title: 'Make a queen', prompt: 'Promote your pawn to a queen.',
        fen: '8/1P6/8/8/8/5k2/8/4K3 w - - 0 1', solution: ['b8=Q'], verify: 'best',
        wrong: { 'b8=R': 'A rook would also win, but a queen is much stronger and wins faster. Choose the queen.', 'b8=B': 'A bishop is far weaker than a queen here.', 'b8=N': 'A knight is far weaker than a queen here.' },
        hint: 'Move the pawn to b8 and pick the queen.',
        success: 'A new queen! With king and queen against a lone king, checkmate is just a matter of technique.'
      },
      {
        kind: 'exercise', title: 'The surprising knight', prompt: 'A new queen would only face Black\'s queen. Promote to the piece that wins the black queen instead.',
        fen: '8/2q1P1k1/8/8/8/8/7P/7K w - - 0 1', solution: ['e8=N+', 'Kf8', 'Nxc7'], verify: 'best',
        wrong: { 'e8=Q': 'Queen against queen: Black keeps checking your king and the game is heading for a draw. A knight can win Black\'s queen.' },
        hint: 'A knight on e8 attacks g7 and c7 at the same time.',
        success: 'Underpromotion! The knight checks the king and attacks the queen. After the king moves, Nxc7 wins the queen.'
      },
      { kind: 'quiz', question: 'Which piece can a pawn NOT promote to?', options: ['Queen', 'Knight', 'King', 'Rook'], answer: 2, explanation: 'You can choose queen, rook, bishop or knight — never a second king.' },
      { kind: 'quiz', question: 'Why would you ever promote to a knight?', options: ['Knights are stronger than queens', 'To give a check or fork that a queen could not', 'It is required on the a-file', 'To avoid stalemate is the only reason'], answer: 1, explanation: 'A knight moves differently, so it can create forks or checks a queen cannot (avoiding stalemate is another reason).' }
    ]
  },
  {
    id: 'center-control', level: 'beginner', title: 'Controlling the center', icon: '◎',
    summary: 'Why the squares d4, e4, d5 and e5 matter so much.',
    steps: [
      {
        kind: 'concept', title: 'The four centre squares', fen: START, squares: ['d4', 'e4', 'd5', 'e5'],
        body: [
          'Pieces in the centre reach more squares and can quickly switch to either side of the board.',
          'Use pawns to **occupy** the centre and pieces to **control** it (attack those squares).'
        ]
      },
      {
        kind: 'demo', title: 'Fighting for the centre', intro: 'Both sides contest d4 and e5.', fen: START,
        moves: [
          { san: 'e4', note: 'White occupies e4 and attacks d5.' },
          { san: 'e5', note: 'Black claims e5.' },
          { san: 'Nf3', note: 'The knight attacks e5 and controls d4.' },
          { san: 'Nc6', note: 'Black defends e5 and also eyes d4.' },
          { san: 'd4', note: 'White strikes at the centre with a second pawn.' },
          { san: 'exd4', note: 'Black captures.' },
          { san: 'Nxd4', note: 'White recaptures with a knight that now sits proudly in the centre.' }
        ]
      },
      {
        kind: 'exercise', title: 'A central developing move', prompt: 'Play a move that develops a piece AND fights for the centre.',
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', solution: ['Nf3'], alt: { 0: ['Nc3', 'd4', 'Bc4'] }, verify: 'sound',
        wrong: { a3: 'A rook-pawn move does nothing for the centre or your development.', h3: 'A rook-pawn move does nothing for the centre or your development.', Qh5: 'Bringing the queen out this early lets Black develop with tempo by attacking it.' },
        hint: 'Which knight move attacks the e5-pawn?',
        success: 'Good: your move develops a piece and puts pressure on the centre.'
      },
      { kind: 'quiz', question: 'Which squares make up the centre?', options: ['a1, h1, a8, h8', 'd4, e4, d5, e5', 'c3, f3, c6, f6', 'e1 and e8'], answer: 1, explanation: 'd4, e4, d5 and e5.' },
      { kind: 'quiz', question: 'Why is a knight better in the centre than on the edge?', options: ['It can capture kings there', 'It controls more squares', 'Knights cannot move from the edge', 'It becomes a bishop'], answer: 1, explanation: 'A centralised knight attacks up to 8 squares; in a corner only 2.' }
    ]
  },
  {
    id: 'developing-pieces', level: 'beginner', title: 'Developing your pieces', icon: '♝',
    summary: 'Getting knights and bishops off the back rank quickly.',
    steps: [
      {
        kind: 'concept', title: 'Bring out the minor pieces', fen: START, arrows: ['g1f3', 'b1c3', 'f1c4', 'c1f4'],
        body: [
          '**Development** means moving your pieces from their starting squares to useful posts.',
          'Usually knights come out before bishops, and you avoid moving the same piece twice in the opening unless there is a good reason.'
        ]
      },
      {
        kind: 'demo', title: 'Quick development', intro: 'Both sides develop smoothly and castle.', fen: START,
        moves: [
          { san: 'e4', note: 'Opens the bishop.' }, { san: 'e5', note: 'Same for Black.' },
          { san: 'Nf3', note: 'Knight out, attacking e5.' }, { san: 'Nc6', note: 'Knight out, defending.' },
          { san: 'Bc4', note: 'Bishop out to an active diagonal.' }, { san: 'Bc5', note: 'Black mirrors.' },
          { san: 'O-O', note: 'King safe, rook toward the centre.' }, { san: 'Nf6', note: 'Black develops the last knight.' },
          { san: 'd3', note: 'Supports e4 and opens the c1-bishop.' }
        ]
      },
      {
        kind: 'exercise', title: 'Develop!', prompt: 'Play a developing move.',
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', solution: ['Bb5'], alt: { 0: ['Bc4', 'Nc3', 'd4'] }, verify: 'sound',
        wrong: { Ng5: 'This moves the same knight twice and leaves your other pieces at home.', Qe2: 'The queen should usually wait. Develop knights and bishops first.', a4: 'Edge pawn moves do not develop anything.', h4: 'Edge pawn moves do not develop anything.' },
        hint: 'Your f1-bishop and b1-knight are still at home.',
        success: 'Well done — a new piece joins the game.'
      },
      { kind: 'quiz', question: 'What does "development" mean?', options: ['Promoting pawns', 'Moving pieces off their starting squares to good squares', 'Trading queens', 'Moving the king forward'], answer: 1, explanation: 'Getting your pieces into play.' },
      { kind: 'quiz', question: 'Which is usually a bad idea in the opening?', options: ['Castling', 'Developing knights', 'Moving the same piece many times', 'Controlling the centre'], answer: 2, explanation: 'Every extra move with one piece is a move your other pieces did not get.' }
    ]
  },
  {
    id: 'opening-principles', level: 'beginner', title: 'Basic opening principles', icon: '☰',
    summary: 'Centre, development, king safety — and why the early queen sortie backfires.',
    steps: [
      {
        kind: 'concept', title: 'Four rules for the opening', fen: START,
        body: [
          '1. Fight for the **centre**. 2. **Develop** knights and bishops. 3. **Castle** early. 4. Don\'t bring the **queen** out too soon.',
          'An early queen can be chased by your opponent\'s developing moves, so they gain time while you lose it.'
        ]
      },
      {
        kind: 'demo', title: 'The chased queen', intro: 'White brings the queen out early. Watch Black develop while attacking it.', fen: START,
        moves: [
          { san: 'e4', note: 'A good start.' }, { san: 'e5', note: 'Black claims the centre.' },
          { san: 'Qh5', note: 'Early queen: it attacks e5 and eyes f7.' }, { san: 'Nc6', note: 'Black defends e5 with a developing move.' },
          { san: 'Bc4', note: 'White threatens Qxf7#.' }, { san: 'g6', note: 'Black blocks the queen and gains time.' },
          { san: 'Qf3', note: 'The queen must move again and now threatens f7.' }, { san: 'Nf6', note: 'Black blocks the threat and develops — Black is ahead in development.' }
        ]
      },
      {
        kind: 'exercise', title: 'Meet the early queen', prompt: 'White\'s queen attacks your e5-pawn. Defend it with a developing move.',
        fen: 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2', orientation: 'b', solution: ['Nc6'], alt: { 0: ['d6'] }, verify: 'sound',
        wrong: {
          Nf6: 'The knight attacks the queen, but she takes on e5 with check (Qxe5+) and you are a pawn down for a little development.',
          g6: 'This kicks the queen, but leaves e5 hanging: Qxe5+ attacks your king and the rook on h8 at the same time.'
        },
        hint: 'Which knight can defend e5?',
        success: 'Nc6 defends e5 and develops a piece. Black is now ready to chase the queen with …g6 or …Nf6.'
      },
      { kind: 'quiz', question: 'Which is NOT one of the basic opening principles?', options: ['Control the centre', 'Develop pieces', 'Castle early', 'Move your queen first'], answer: 3, explanation: 'The queen usually comes out after the minor pieces.' },
      { kind: 'quiz', question: 'Why is an early queen move often bad?', options: ['Queens cannot move until move 10', 'The opponent can attack it while developing, gaining time', 'It is illegal', 'It blocks castling'], answer: 1, explanation: 'Each time it must retreat, your opponent develops for free.' }
    ]
  },
  {
    id: 'protecting-king', level: 'beginner', title: 'Protecting your king', icon: '🛡',
    summary: 'Castling, pawn shields, and the danger of a weak back rank.',
    steps: [
      {
        kind: 'concept', title: 'A safe king', fen: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b - - 4 6', squares: ['f2', 'g2', 'h2', 'f7', 'g7', 'h7'],
        body: [
          'Both kings have castled and sit behind three unmoved pawns — a **pawn shield**.',
          'Avoid pushing those pawns without a reason; each pawn move creates holes near your king.'
        ]
      },
      {
        kind: 'demo', title: "Fool's mate", intro: 'The fastest possible checkmate — caused by weakening the king.', fen: START,
        moves: [
          { san: 'f3', note: 'This opens the e1–h4 diagonal toward the king.' },
          { san: 'e5', note: 'Black opens the queen\'s path.' },
          { san: 'g4', note: 'A second weakening move.' },
          { san: 'Qh4#', note: 'Checkmate! The king has no shelter.' }
        ]
      },
      {
        kind: 'exercise', title: 'Make an escape square', prompt: 'Black threatens …Re1, which would be checkmate. Stop it.',
        fen: '4r1k1/2R2ppp/8/8/8/8/5PPP/6K1 w - - 0 1', solution: ['h3'], alt: { 0: ['g3', 'h4', 'g4', 'f3', 'f4', 'Kf1', 'Rc1'] }, verify: 'sound',
        wrong: { Rxf7: 'Grabbing a pawn ignores the threat: …Re1 is checkmate!', Rc8: 'After …Rxc8 you have simply lost your rook.' },
        hint: 'Give your king some air — a pawn move in front of it creates an escape square ("luft").',
        success: 'Now if Black plays …Re1+, your king simply steps out. That escape square is called "luft".'
      },
      { kind: 'quiz', question: 'What is a "back-rank weakness"?', options: ['Having too many rooks', 'A king trapped on its first rank by its own pawns', 'A missing queen', 'A pawn on the 8th rank'], answer: 1, explanation: 'A rook or queen check on that rank can be mate.' },
      { kind: 'quiz', question: 'What is the most common way to make your king safer in the opening?', options: ['Move it to the centre', 'Castle', 'Push all pawns in front of it', 'Trade your queen immediately'], answer: 1, explanation: 'Castling puts the king behind a pawn shield and activates a rook.' }
    ]
  }
]
