// Builds the bundled puzzle set from the lichess.org puzzle database (CC0-1.0).
//   npm run puzzles            (streams https://database.lichess.org/lichess_db_puzzle.csv.zst)
//   npm run puzzles -- --per-bucket 40 --file path\to\lichess_db_puzzle.csv.zst
// The dump is streamed and decompressed on the fly (Node's built-in zstd); nothing big is written
// to disk. A balanced sample is kept for every (category x rating band) bucket, and every kept
// puzzle is replayed with chess.js: all moves must be legal and mate puzzles must end in mate in
// exactly the advertised number of moves.
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createZstdDecompress } from 'node:zlib'
import { Chess } from 'chess.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const PER_BUCKET = Number(arg('--per-bucket', 30))
const FILE = arg('--file', null)
const URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst'

// Keep in sync with src/shared/puzzles.ts (the runtime uses the same predicates).
const CATS = {
  mateIn1: (t) => t.has('mateIn1'),
  mateIn2: (t) => t.has('mateIn2'),
  mateIn3: (t) => t.has('mateIn3'),
  bestMove: (t) => !t.has('mate'),
  material: (t) => !t.has('mate') && (t.has('crushing') || t.has('advantage')),
  combination: (t) => t.has('long') || t.has('veryLong'),
  fork: (t) => t.has('fork'),
  pin: (t) => t.has('pin'),
  skewer: (t) => t.has('skewer'),
  discoveredAttack: (t) => t.has('discoveredAttack'),
  deflection: (t) => t.has('deflection'),
  attraction: (t) => t.has('attraction'),
  defensiveMove: (t) => t.has('defensiveMove'),
  equality: (t) => t.has('equality'),
  endgame: (t) => t.has('endgame'),
  advanced: (t) => t.has('veryLong') || (t.has('sacrifice') && t.has('long'))
}
const BANDS = [600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500, Infinity]
const bandOf = (r) => BANDS.findIndex((b) => r < b)
const counts = {}
for (const c of Object.keys(CATS)) counts[c] = new Array(BANDS.length).fill(0)
const totalSlots = Object.keys(CATS).length * BANDS.length * PER_BUCKET
let filled = 0

function verify(fen, moves, themes) {
  const c = new Chess(fen)
  for (const u of moves) {
    try {
      c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    } catch {
      return false
    }
  }
  const m = [...themes].find((t) => /^mateIn\d$/.test(t))
  if (m || themes.has('mate')) {
    if (!c.isCheckmate()) return false
    if (m && (moves.length - 1 + 1) / 2 !== Number(m.slice(6))) return false
  }
  return true
}

const kept = []
let rows = 0
let rejected = 0

async function* lines() {
  let input
  if (FILE) input = createReadStream(FILE)
  else {
    const res = await fetch(URL, { headers: { 'User-Agent': 'kingside-build (puzzle sampler)' } })
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
    console.log(`Streaming ${URL} (${(Number(res.headers.get('content-length')) / 1e6).toFixed(0)} MB compressed)…`)
    input = Readable.fromWeb(res.body)
  }
  const rl = createInterface({ input: input.pipe(createZstdDecompress()), crlfDelay: Infinity })
  for await (const line of rl) yield line
}

const started = Date.now()
for await (const line of lines()) {
  if (rows++ === 0 && line.startsWith('PuzzleId')) continue
  const f = line.split(',')
  if (f.length < 9) continue
  const [id, fen, movesStr, ratingStr, rdStr, popStr, playsStr, themesStr] = f
  const rating = Number(ratingStr)
  if (Number(rdStr) > 90 || Number(popStr) < 85 || Number(playsStr) < 300) continue
  const themes = new Set(themesStr.split(' '))
  const band = bandOf(rating)
  const cats = Object.keys(CATS).filter((c) => CATS[c](themes) && counts[c][band] < PER_BUCKET)
  if (cats.length === 0) continue
  const moves = movesStr.split(' ')
  if (!verify(fen, moves, themes)) {
    rejected++
    continue
  }
  for (const c of Object.keys(CATS)) {
    if (CATS[c](themes) && counts[c][band] < PER_BUCKET) {
      counts[c][band]++
      filled++
    }
  }
  kept.push([id, fen, movesStr, rating, themesStr])
  if (filled >= totalSlots) break
  if (rows % 500_000 === 0) console.log(`  ${rows.toLocaleString()} rows scanned, ${kept.length} kept, ${filled}/${totalSlots} slots`)
}

const outFile = join(root, 'src', 'renderer', 'src', 'data', 'puzzles.json')
mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(kept))
const summary = Object.entries(counts).map(([c, arr]) => `| ${c} | ${arr.join(' | ')} |`).join('\n')
const doc = `# Bundled puzzles

- Source: lichess.org open puzzle database, ${URL}
- License: CC0-1.0 (public domain dedication). Attribution is not required, but the puzzles are
  © the lichess.org community; each puzzle id links to https://lichess.org/training/<id>.
- Built: ${new Date().toISOString()} by \`npm run puzzles\` (scripts/build-puzzles.mjs)
- Filters: rating deviation ≤ 90, popularity ≥ 85, ≥ 300 plays. Every puzzle replayed with chess.js:
  all moves legal; mate puzzles end in checkmate in exactly the advertised number of moves.
- ${kept.length} puzzles kept from ${rows.toLocaleString()} rows scanned (${rejected} failed verification).
- Up to ${PER_BUCKET} puzzles per category and rating band (a puzzle can fill several categories).

| category | ${BANDS.map((b, i) => (i === 0 ? '<600' : b === Infinity ? '2500+' : `<${b}`)).join(' | ')} |
|---|${BANDS.map(() => '---').join('|')}|
${summary}
`
mkdirSync(join(root, 'data', 'puzzles'), { recursive: true })
writeFileSync(join(root, 'data', 'puzzles', 'SOURCE.md'), doc)
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(0)} s: ${kept.length} puzzles, ${rejected} rejected, ${rows.toLocaleString()} rows.`)
console.log(summary)
