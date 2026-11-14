# Bundled puzzles

- Source: lichess.org open puzzle database, https://database.lichess.org/lichess_db_puzzle.csv.zst
- License: CC0-1.0 (public domain dedication). Attribution is not required, but the puzzles are
  © the lichess.org community; each puzzle id links to https://lichess.org/training/<id>.
- Built: 2026-11-14T00:54:42.459Z by `npm run puzzles` (scripts/build-puzzles.mjs)
- Filters: rating deviation ≤ 90, popularity ≥ 85, ≥ 300 plays. Every puzzle replayed with chess.js:
  all moves legal; mate puzzles end in checkmate in exactly the advertised number of moves.
- 3349 puzzles kept from 6,193,531 rows scanned (1 failed verification).
- Up to 30 puzzles per category and rating band (a puzzle can fill several categories).

| category | <600 | <800 | <1000 | <1200 | <1400 | <1600 | <1800 | <2000 | <2200 | <2500 | 2500+ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| mateIn1 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 24 | 0 |
| mateIn2 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| mateIn3 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| bestMove | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| material | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| combination | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| fork | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| pin | 23 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| skewer | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| discoveredAttack | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| deflection | 8 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| attraction | 9 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| defensiveMove | 7 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| equality | 0 | 14 | 30 | 30 | 16 | 0 | 0 | 1 | 0 | 0 | 0 |
| endgame | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
| advanced | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 | 30 |
