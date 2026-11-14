# Third-party notices

Kingside is an independent project. It is not affiliated with or endorsed by Stockfish, lichess.org or chess.com.

## Stockfish (chess engine), GPL-3.0

- Upstream: https://github.com/official-stockfish/Stockfish
- Shipped as a separate executable in `resources/engine/`. Kingside runs it as a child process and talks to it over the
  UCI text protocol. It is not linked into Kingside.
- License: GNU General Public License v3 (`resources/engine/Copying.txt`).
- Corresponding source: `resources/engine/stockfish-source.zip` (copied from the install the binary came from), plus the
  matching upstream release tag listed in `resources/engine/SOURCE.txt`.
- You may replace the engine with any other Stockfish build via Settings → Engine.

## Opening names: lichess-org/chess-openings, CC0-1.0

- Upstream: https://github.com/lichess-org/chess-openings
- Public-domain dedication (CC0 1.0). The TSV files are in `data/openings/` and compiled into
  `src/renderer/src/data/openings.json` by `npm run openings`.

## Puzzles and some lesson positions: lichess.org puzzle database, CC0-1.0

- Upstream: https://database.lichess.org/#puzzles (`lichess_db_puzzle.csv.zst`)
- Public-domain dedication (CC0 1.0). A verified sample is bundled in `src/renderer/src/data/puzzles.json`
  (see `data/puzzles/SOURCE.md` for the build date, filters and counts). Lesson exercises taken from the
  database name their lichess puzzle id. Kingside links each puzzle to `https://lichess.org/training/<id>`.

## Chess pieces: "Cburnett" set

- Author: Colin M.L. Burnett. Obtained from the lichess-org/lila repository (`public/piece/cburnett`).
- License: GPLv2+ (also published on Wikimedia Commons under GFDL / CC BY-SA 3.0 / GPL). Used unmodified.

## Additional piece sets (from lichess-org/lila `public/piece/`, licences per lila's COPYING.md)

- **Merida** ("Tournament"): Armando Hernandez Marroquin, GPLv2+.
- **Chessnut** ("Modern"): Alexis Luengas, Apache License 2.0.
- **Fantasy** and **Spatial**: Maurizio Monge, MIT.
- **Wooden**: the Cburnett set recoloured by `scripts/make-piece-sets.mjs`, so it is a derivative under GPLv2+.
- **Minimal**: original geometric set drawn for Kingside (MIT, same as the app).

## Game data APIs

- Chess.com Published-Data API (https://www.chess.com/news/view/published-data-api) and the Lichess API
  (https://lichess.org/api) are used at runtime, only to fetch public games the user asks for. No data is bundled.

## chess.js, BSD-2-Clause

- Upstream: https://github.com/jhlywa/chess.js. Copyright (c) Jeff Hlywa. Used for move generation and rules.

## Electron, React

- Electron (MIT) and Chromium (BSD-style and others; see `LICENSES.chromium.html` in the install folder).
- React and React DOM (MIT).

## Method references (no code or assets copied)

- Expected-score curve and per-move accuracy formula: lichess.org's published accuracy method.
- Classification cut-offs: the expected-points bands described in chess.com's public help article on move
  classification. Kingside's implementation and heuristics are its own.
