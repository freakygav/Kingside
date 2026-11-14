// Builds src/renderer/src/data/openings.json from the lichess chess-openings TSV files in
// data/openings (CC0-1.0, https://github.com/lichess-org/chess-openings).
// Each entry maps a position key (FEN fields 1-4) to [eco, name, pgn].
// Run with: npm run openings
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Chess } from 'chess.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'data', 'openings')
const outFile = join(root, 'src', 'renderer', 'src', 'data', 'openings.json')

const files = readdirSync(srcDir).filter((f) => /^[a-e]\.tsv$/.test(f)).sort()
if (files.length !== 5) {
  console.error(`Expected a.tsv..e.tsv in ${srcDir}, found: ${files.join(', ') || 'none'}`)
  process.exit(1)
}

const db = {}
let rows = 0
let bad = 0
for (const f of files) {
  const lines = readFileSync(join(srcDir, f), 'utf8').split(/\r?\n/)
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const [eco, name, pgn] = line.split('\t')
    rows++
    const chess = new Chess()
    try {
      chess.loadPgn(pgn)
    } catch {
      bad++
      continue
    }
    const key = chess.fen().split(' ').slice(0, 4).join(' ')
    const existing = db[key]
    // Same position under several names: keep the one reached by the shortest sequence.
    if (!existing || pgn.length < existing[2].length) db[key] = [eco, name, pgn]
  }
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(db))
console.log(`openings.json: ${Object.keys(db).length} positions from ${rows} rows (${bad} unparsable)`)
