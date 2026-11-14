# Kingside — developer guide

A Windows desktop chess training platform. Play Stockfish at a chosen strength on a 10-minute clock and review your
games. Learn through 34 interactive lessons, train on rated puzzles, and get explanations from six coaches pitched at
different playing strengths. Every explanation is built from real Stockfish analysis of the position.

Built with **Electron 45 + React 19 + TypeScript** (electron-vite), **chess.js** for the rules, and a native
**Stockfish** process over UCI. Packaged with **electron-builder** into an NSIS installer and a portable `.exe`.

**Why this stack:** Electron gives a reliable route to a polished Windows `.exe` with web-grade UI (custom board,
SVG arrows, animation), and Node's `child_process` drives a native Stockfish binary at full speed. A WASM engine would
be slower, and a native GUI toolkit would make the board UI much more work.

---

## Training platform (Lessons · Puzzles · Coaches · Profile)

Navigation is a left sidebar: Play, Review, Lessons, Puzzles, Coaches, Profile. It collapses to icons below 1300 px.
A game keeps running (clocks included) while you visit other sections, and the sidebar shows a "live" badge on Play.

**Lessons** (`src/shared/lessons/*`)
- 34 lessons in three tracks: 10 beginner, 12 intermediate, 12 advanced. They are listed in `tests/lessons.test.ts`.
- Each lesson has an explanation with an annotated board, a step-through demonstration, interactive move exercises
  (drag or click), and a knowledge check (at least 2 questions). Some lessons also have "click the square" exercises
  for outposts, weak squares, and isolated, passed or doubled pawns.
- Wrong moves are explained, either with an authored explanation or with facts about the move (for example "leaves the
  knight undefended"), and you can retry. Hints and "show solution" are available.
- **Verified content:** every position passes a full legality check. Every demo and solution line replays legally,
  mate exercises end in mate, and square answers are computed by the position analyser. Every graded move is checked
  by Stockfish against its claim (`best`, `sound`, `winning` or rules-only `legal`). Every authored "wrong move"
  explanation must describe a move the engine also rates worse.
- Progress: resume where you left off, accuracy per lesson (first-try correctness of graded steps), XP, and
  progressive unlocking. Intermediate opens after 5 beginner lessons and advanced after 6 intermediate lessons, or
  you can choose "skip ahead". The dashboard shows lessons completed, current learning level, XP, learning streak and
  the recommended next lesson.

**Puzzles** (`src/shared/puzzles.ts`, `scripts/build-puzzles.mjs`)
- 3,349 puzzles from the **lichess.org open puzzle database (CC0)**. `npm run puzzles` streams the 310 MB dump
  through Node's built-in zstd, keeps up to 30 puzzles per category × rating band, and replays every puzzle with
  chess.js: all moves must be legal, and mate puzzles must end in mate in exactly the stated number of moves. The
  set is bundled, so it works fully offline.
- 16 categories plus "Mixed": mate in 1/2/3, best move, winning material, combinations, forks, pins, skewers,
  discovered attacks, deflection, attraction, defensive moves, saving a losing position, endgames and advanced
  combinations. There are 11 rating bands (400–600 … 2500+), plus "match my rating". A few combinations are rare in
  the lichess data, such as "saving a losing position" above 1400 or mate-in-1 at 2500+. The selector shows real
  counts and disables empty bands instead of padding them.
- The opponent's moves are played automatically, and multi-move solutions are supported. Any mating final move is
  accepted, as on lichess.
- A wrong move gets an engine-backed explanation of the refutation and you can retry. Hints come in three levels:
  the tactical idea, then the piece to move, then the destination square.
- Elo-style rating: start 1000, with K = 40/28/18 by experience. A solve without help scores 1, a solve with hints
  scores ½, and a wrong move or revealed solution scores 0. Each puzzle is rated once. Stats include accuracy,
  streaks, average solve time, rating history, puzzles per day, accuracy by theme and history.

**Coaches** (`src/shared/coach/*`)
- Six teaching profiles: Pip 400–800, Rowan 800–1200, Ines 1200–1600, Theo 1600–2000, Saskia 2000–2400 and
  Aurelio 2400+. They are **not** separate engines. All of them read the same full-strength Stockfish analysis. The
  level controls vocabulary, whether numbers are shown, how many candidate moves appear (1–5), how long the shown
  variations are (0–12 plies), and which concepts are discussed: overloaded pieces, imbalances and engine depth
  appear only at higher levels.
- Explanations are assembled from facts computed on the actual board, never invented: hanging and overloaded pieces,
  pins, forks, skewers, discovered attacks, back-rank patterns, mate threats, material swing along the engine line,
  pawn structure, outposts and weak squares, king safety, development, opposition and the rule of the square.
- The workspace has a free-play board, eval bar, live engine lines and position info (side to move, phase, material,
  opening). You can load the current or last game, any previous game (pick any move), or an imported FEN. FENs pass a
  full legality check, because Stockfish exits on impossible positions. You can ask with quick buttons or typed
  questions. Recognised topics are candidate moves, what to think about, the last move, a specific move ("Is Bxf7+
  good?"), tactics, evaluation, piece safety, opening and endgame. The coach says plainly what it recognises; it is
  not a chatbot.
- **Coach watching** (Play screen) judges each of your moves after you make it, never before, so it doesn't play for
  you. Feedback can be shown for every move, only mistakes, only blunders, or at the end of the game, quietly in the
  side panel.
- **Coach review** (Review → Coach review) gives an overall summary, a grade for each phase, a tactical summary, key
  moments (biggest mistakes, best moves, missed chances) explained from the engine lines, and an improvement plan.
  The plan combines this game with mistakes from your earlier reviewed games and links straight to lessons and
  puzzle categories.

**Profile & progression** (`src/shared/progress.ts`, `src/main/profileStore.ts`)
- One JSON document, `%APPDATA%\Kingside\profile.json`, stored next to the existing `settings.json` with
  `schemaVersion` and a migration function. Writes are atomic, and a corrupt file is kept as a backup rather than
  overwritten. All rules (XP, ratings, streaks, achievements) are one pure, tested `applyEvent()` reducer.
- It tracks the estimated playing Elo (an Elo update against the bot levels, clearly labelled as an estimate),
  puzzle rating, games won, lost and drawn, lessons, puzzle accuracy, XP and level, learning streak, strongest and
  weakest areas (from puzzle themes and coach-review mistake tags), recent activity, and charts over time.
- XP is awarded for lessons, puzzles, puzzle streaks, games, training games and reviews. There are 15 achievements,
  including First Lesson, First Puzzle, 10/100 Puzzles, Tactical Thinker, Endgame Student, 7-Day Streak and 100
  Lessons Completed (revisits count). They are announced with small toasts, never modal pop-ups.

---

## Board Appearance (🎨 in the sidebar, or Settings → Board → Customize…)

- **Separate settings:** the background around the board, the square colours and the piece set are independent.
  Changing one never changes the others. All boards (Play, Review, Lessons, Puzzles, Coaches, Game Import) read the
  same CSS variables and piece set, so they always match. Square colours update without re-rendering any board.
- **24 built-in backgrounds:** 8 solid colours, 7 gradients and 9 textures (carbon fibre, dark marble, brushed metal,
  leather, wood, dark stone, hexagons, subtle grid, dark fabric). They are original CSS and inline-SVG patterns, so
  there are no image assets to license. The gallery is searchable, with real thumbnails.
- **Custom images (PNG, JPG/JPEG, WEBP, up to 40 MB):** the file's real signature is checked, it is decoded and
  validated in the renderer, and it is downscaled to at most 2560 px and re-encoded. You preview it, then "Use
  image" copies it into `%APPDATA%\Kingside\backgrounds`. The app never references the original file. Images are
  served through a private `kingside-bg://` scheme. If an image goes missing or is corrupted, the default background
  is shown with a notice. Adjustable: fit (cover, contain, tile or stretch), position, scale, opacity, blur and
  brightness.
- **Square colours:** 6 light and 7 dark swatches, 8 board presets, and free colour pickers.
- **Piece sets** (all 12 pieces each): Classic (Cburnett, GPLv2+), Tournament (Merida, GPLv2+), Modern (Chessnut,
  Apache-2.0), Minimal (original), Wooden (recoloured Cburnett), Fantasy and Spatial (MIT). No chess.com assets are
  used, and no non-commercial licences.
- The live preview is a playable sample board with arrows, last-move and check highlights. Buttons: Apply changes,
  Reset to default, Save preset. There are 8 built-in presets, and custom presets can be created, renamed, applied
  and deleted.
- Everything is stored in the existing `settings.json` (`appearance`, `appearancePresets`). The old board-theme
  setting is migrated automatically.

## Game Import & external analysis (📥 Game Import)

- **Chess.com:** uses the public Published-Data API
  (`/pub/player/{user}`, `/games/archives` and `/games/{YYYY}/{MM}`). You can validate a username, browse the monthly
  archives, pick games, or import a whole month or every archive (with progress and a Stop button). Requests are
  serialised and cached with ETag / If-Modified-Since. Cached months still load offline.
- **Lichess:** uses the public API (`/api/user`, `/api/games/user`, NDJSON with `pgnInJson`). Filters cover date
  range, time control and maximum count, plus a result filter and "load older" paging. Requests are one at a time,
  and 429 rate limits are reported with the wait time.
- No passwords and no private data are involved. Variants (Chess960 and others), games without a PGN, unknown
  usernames, closed accounts, network errors and rate limits are all explained instead of being skipped silently.
- **PGN:** drag-and-drop, Browse… or paste, with multiple games per file. The parser handles all standard headers,
  comments, nested variations, NAGs, `0-0` / `O-O`, promotions with or without `=`, `e.p.`, `[SetUp]` / `[FEN]`
  starts, and line comments. Invalid games are listed with the exact move. You can import their valid part (marked
  unfinished) or leave them out. The original PGN text is always kept, so comments and variations survive.
- **Library** (`%APPDATA%\Kingside\library`): `index.json` holds metadata, and `games/<id>.json` holds each PGN with
  its cached analysis. This uses the same atomic-JSON persistence as settings and profile. Stable ids (Chess.com or
  Lichess game ids, otherwise a hash of players, date and moves) prevent duplicates, even when the same game arrives
  through a different route. It has search, filters (source, result, opponent, dates, opening, time control), open,
  analyse, delete (single or bulk), export (single or bulk, annotated with `[%eval]` and NAGs when analysed), and a
  link to the original game.
- **Analysis** reuses the existing review screen and classifier (no second system). It runs Stockfish on every
  position and gives evaluations, best moves, lines, classifications, accuracy, ACPL, a clickable eval graph and
  coach review, with real names and ratings. Analysis depth is configurable, and you can cancel and resume. Results
  are cached per game, so re-opening is instant and works offline. "Explore from here" tests variations without
  touching the game; Replay plays it through.
- **Statistics:** last 7/30/90 days, all time or a custom range. Results, score as White and as Black, openings
  (most played, best and worst), average opponent rating, game length, analysed accuracy and ACPL, and mistake
  categories from coach analysis. Only real data is used, and missing fields are shown as "—".
- **Compare:** two games, an opponent, openings, or White vs Black. Accuracy is clearly labelled as Kingside's own
  estimate, not an official Chess.com or Lichess score.

---

## Features

**Play**
- Legal chess via chess.js: castling, en passant, promotion (piece picker), check, checkmate, stalemate, insufficient
  material, threefold repetition and the 50-move rule. Repetition and 50-move draws end the game automatically.
- Drag-and-drop **and** click-to-move. Legal-move dots and capture rings, last-move and check highlighting, move animation.
- 10+0 clock for both sides with correct switching. A move made after flag fall is rejected. Flag fall loses, except
  that it is a draw when the opponent cannot possibly mate (FIDE 6.9).
- 11 difficulty levels (~400 → full strength), presented as **approximate** Elo with an in-app explanation.
- Human-like bot pacing: a log-normal "think time" that depends on game phase, forced moves and recaptures. It is
  capped at 8 s, at 1/25 of the bot's remaining time, and at "remaining − 0.75 s", so it can never flag because of
  cosmetic delay. The bot's clock runs while it thinks, like a human's.
- **Premoves**: queue a move during the bot's turn. It plays instantly if legal when your turn arrives and is dropped
  silently if not. Cancel it with Esc, the "cancel" link, or a left-click on an empty square.
- **Annotations**: right-click a square to mark it red, right-drag to draw an arrow (knight moves draw L-shaped
  arrows). Left-click the board to clear. Annotations never move pieces and never cancel premoves.
- Move list beside the board, kept in sync. Click any move, or use ← → Home End, to inspect earlier positions.
  **History view is read-only**: the board is dimmed, pieces can't be moved, and a "Back to live" banner appears.
  Moves can only be made from the live position.
- Resign (two-click confirm), abort before your first move, and draw offers. The bot accepts a draw only after
  move 20 and only if its own last eval is ≤ +0.25.
- Interrupted games: the game is saved after every move and on close. On the next launch you can **Resume** (clocks
  were frozen while the app was closed), **Review** it, or **Discard** it.

**Review**
- Every position is analysed by a separate full-strength Stockfish process (MultiPV 2, configurable time per
  position). A progress bar shows while it runs, and the UI stays responsive.
- Classifications: Brilliant, Great, Best, Excellent, Good, Book, Forced, Inaccuracy, Mistake, Miss, Blunder.
  The app shows per-player counts and an approximate accuracy.
- Eval bar, clickable eval graph, a move card with eval before → after and expected points lost, the engine's best
  move (green arrow on the board) and its continuation, plus the engine's reply line after your move.
- Opening name and ECO code with the defining move sequence, recognised **by position** so transpositions work. Book
  moves are labelled. If the game leaves the database immediately, the app says so instead of inventing a name.
- Copy PGN.

### How classification works (also shown in the app)
1. Score → expected score with the logistic curve lichess publishes: `E = 1 / (1 + e^(−0.00368208·cp))`. Mate counts as 1 or 0.
2. Cost of a move = E(best move) − E(position after the move), from the mover's view.
3. Bands follow the expected-points cut-offs chess.com documents publicly: best 0, excellent ≤ .02, good ≤ .05,
   inaccuracy ≤ .10, mistake ≤ .20, blunder > .20. Unlike chess.com, the curve here does not depend on rating.
4. Heuristic labels:
   - **Brilliant**: a best or near-best move that sacrifices a minor piece or more, and leaves you at least about equal
     when the alternatives weren't already crushing. "Sacrifices" means the piece is left en prise, or material stays
     down along the engine line.
   - **Great**: the only good move (the second-best costs ≥ 0.15).
   - **Miss**: the opponent's last move handed you a winning position (≥ 0.70) and you gave it back.
   - **Book**: the position is in the opening database. **Forced**: it was the only legal move.

These labels are engine opinions at limited depth plus simple rules. They are a guide, not objective truth.

### About the Elo numbers
- Levels from 1320 up use Stockfish's `UCI_LimitStrength` / `UCI_Elo` (range 1320–3190 in Stockfish 19). Stockfish
  calibrates that scale against engine rating lists at a fixed time control. It is **not** a FIDE or online-site
  rating, and engines make different mistakes than humans.
- Levels below 1320 (400 / 700 / 1000) are Kingside's own weakening: depth 1–4, 5–10 candidate lines, a softmax pick
  over centipawn loss, and occasional random "oversights". Their Elo labels are rough guesses.
- If an engine reports a different UCI_Elo range, levels are clamped and a warning is shown. Engines without
  `UCI_Elo` can still play the custom levels and full strength. The Elo-limited levels are disabled.

---

## Research notes (UI inspiration)

I read chess.com's public help pages on game-review move classification, arrows and highlights, and premoves. Key
conventions borrowed as *mechanics*, not assets:
- Player cards above and below the board with a large clock that lights up for the side to move.
- Move list with navigation controls in a right-hand panel.
- Red right-click squares and right-drag arrows, cleared by a left click.
- Premoves highlighted until executed.
- Review with an eval bar, an eval graph, classification icons and a short coach-style explanation.
- Classification by expected-points loss, with special "Brilliant / Great / Miss" rules.

Kingside's branding, logo, colours, icons and sounds are original. The piece set is the openly licensed "Cburnett" set,
the sounds are synthesised in code, and no chess.com assets, names or proprietary artwork are used.

---

## Stockfish: how it's obtained, located and licensed

**Bundled by default.** `npm run engine` (`scripts/fetch-stockfish.ps1`) stages an engine in `resources/engine/`,
and `npm run dist` packs that folder into `<install dir>\resources\engine\`. The script tries these sources in order:
1. `-Source C:\path\to\stockfish.exe`: any Stockfish you already have.
2. An existing **winget** install (`winget install Stockfish.Stockfish`). This is the default.
3. `-Download`: the latest official Windows x86-64 release from github.com/official-stockfish.

Alongside the binary it copies `Copying.txt` (GPL-3.0), `AUTHORS`, the matching **source tree as
`stockfish-source.zip`**, and writes `SOURCE.txt` with the upstream release tag. That meets GPL-3.0's requirement to
ship license text and corresponding source with a binary distribution. `npm run dist` refuses to package if the
binary, `Copying.txt` or `SOURCE.txt` is missing. To ship deliberately without an engine, set `KINGSIDE_NO_ENGINE=1`
with an empty `resources/engine` folder; users then supply their own.

Kingside's own code is MIT. Stockfish is a separate program that Kingside talks to over UCI via stdin/stdout. It is not
linked into Kingside.

**Runtime lookup order** (`src/main/engine/locate.ts`). The first candidate that completes a real UCI handshake wins:
1. Path chosen in **Settings → Engine → Choose engine…**
2. `KINGSIDE_STOCKFISH` environment variable
3. Bundled `resources\engine\stockfish*.exe`
4. `stockfish.exe` on `PATH`
5. winget install under `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Stockfish.Stockfish_*`

If nothing works, the Play button is replaced by an **Engine needed** panel. It gives install instructions, has
Choose / Re-scan buttons, and lists every location tried. A user-chosen path that fails is reported as such and not
silently swapped for another engine.

The bot always uses 1 thread and 16 MB hash so its strength stays consistent. Review uses the threads and hash set in
Settings.

---

## Setup, run, test, build

Requirements: Windows 10/11 x64 and Node.js 22+ (developed on Node 24). PowerShell is used for the engine script.

```bat
cd kingside
npm install
npx install-electron        REM only if npm skipped Electron's binary download
npm run engine              REM stage Stockfish for bundling (winget install, or add -Download)
npm run dev                 REM run with hot reload
```

| Command | What it does |
|---|---|
| `npm test` | Vitest suite: rules, clock, bot timing, premoves, strength config, review classifier, openings, UCI parsing, a game-session simulation, and live Stockfish integration (skipped if no engine is found) |
| `npm run typecheck` | TypeScript for main, renderer and tests |
| `npm run selftest` | Builds, launches the real app and drives it with native mouse and keyboard input. Writes `selftest-output/results.json` and screenshots. The window stays on top for about a minute |
| `npm run dist` | Checks the staged engine, builds, then writes `release\Kingside-Setup-1.0.0.exe` (installer) and `release\Kingside-Portable-1.0.0.exe` |
| `npm run dist:dir` | Unpacked build only (`release\win-unpacked\Kingside.exe`), faster for testing |
| `npm run openings` | Rebuild `openings.json` from `data/openings/*.tsv` |
| `npm run icons` | Re-render `build/icon.ico/png` from `build/icon.svg` |

Settings are stored in `%APPDATA%\Kingside\settings.json`. Interrupted games are kept in the app's local storage.

---

## Verification checklist

Automated (`npm test` + `npm run selftest`):

| Area | Covered by |
|---|---|
| Legal moves, castling (both sides, through check, after rook moves), en passant timing, promotion, mate/stalemate/insufficient/threefold/50-move | `tests/rules.test.ts` |
| Clock switching, flag fall, no move after flag, increment, snapshot/restore, formatting | `tests/clock.test.ts` |
| Bot delay never exceeds caps; varies; forced moves faster | `tests/clock.test.ts` |
| Premove geometry, castling premoves, execute-if-legal, drop-if-illegal, promotion choice | `tests/premove-strength.test.ts`, `tests/session.test.ts` |
| Difficulty → UCI options for every level, Elo clamping, unsupported engines, weak-move distribution, settings sanitising | `tests/premove-strength.test.ts` |
| Every level against real Stockfish returns legal moves; MultiPV; mate-in-1 found; unknown option and non-engine rejected | `tests/uci.test.ts` |
| Missing engine, broken user-selected engine, invalid FEN/level/time, crash → automatic restart | `tests/manager.test.ts` |
| Game flow: clocks, bot reply, premoves, flag loss, flag vs insufficient = draw, stale reply after resign ignored, engine failure → paused clocks → retry, checkmate, save/resume | `tests/session.test.ts` |
| History navigation is view-only | `tests/session.test.ts` (`interactionMode`) + self-test |
| Classification bands, Best/Forced/Book/Miss/Great/Brilliant, failed analysis → unclassified, review assembly | `tests/review.test.ts` |
| Opening names, transpositions, book-ply count, no invented names | `tests/review.test.ts` |
| Real UI: drag move, clock switch, premove executed, right-click mark, right-drag arrow, left-click clears, click-click move, history blocks moves, back-to-live, resign, review runs and classifies every move, opening shown | `npm run selftest` |

Training, appearance and import features are covered by `tests/progress.test.ts`, `tests/lessons.test.ts` (every
lesson position and solution checked by Stockfish), `tests/coach.test.ts`, `tests/appearance.test.ts`,
`tests/import.test.ts`, and the live API checks in `tests/importers.live.test.ts` (`KINGSIDE_LIVE=1`). The self-test
also drives all of the following in the real window:

- Lessons, puzzles (hints and rating), and the coaches (FEN import, explanations that differ by level).
- All 24 backgrounds, a real image upload with resizing, the preset lifecycle, and appearance persistence after a
  restart, including the missing-image fallback.
- PGN, Chess.com and Lichess imports with duplicate detection, followed by analysis with cancel and restart, graph
  navigation, explore mode, coach review, the analysis cache, annotated export, delete, statistics, comparison, and
  library persistence.

Manual (quick to check by hand):
- [ ] Promote a pawn: the picker shows Q/N/R/B on the promotion file, Esc or clicking outside cancels.
- [ ] Let your clock run out: the game ends "on time". The clock turns red under 30 s and shows tenths under 20 s.
- [ ] Close the app mid-game and reopen it: the "Unfinished game" card offers Resume / Review / Discard.
- [ ] Settings → Choose engine… with a non-engine `.exe`: you get a readable error and the current engine stays.
- [ ] Rename `resources\engine` in an unpacked build: the Engine needed panel appears with instructions.
- [ ] Flip the board (F) and play as Black: coordinates, arrows and premoves follow the orientation.

---

## Project layout

```
src/main/            Electron main: window, IPC, settings, engine locator/manager/UCI client, dev self-test
src/preload/         contextBridge API (window.kingside)
src/shared/          Pure logic shared and unit-tested: clock, bot timing, strength levels, premoves, review classifier, openings
src/renderer/        React UI: Board, PlayerBar/Clock, MoveList, NewGame, Review, Settings/About; game session + review runner
data/openings/       lichess chess-openings TSVs (CC0)
resources/engine/    staged Stockfish (gitignored; filled by npm run engine)
scripts/             engine fetch, opening compiler, icon renderer, engine check, self-test runner
tests/               Vitest suites
```

See `THIRD_PARTY_NOTICES.md` for all third-party licenses.
