This folder is bundled into the Kingside build as <install dir>\resources\engine.

Fill it with:   npm run engine
(copies your winget Stockfish install, or use -Download / -Source; see scripts/fetch-stockfish.ps1)

Kingside picks the first stockfish*.exe in this folder. Stockfish is GPL-3.0: keep Copying.txt,
SOURCE.txt and stockfish-source.zip next to the binary when you distribute it.
