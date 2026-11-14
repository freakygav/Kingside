// Fails the packaging step if no engine is staged for bundling, so a build never ships
// "with Stockfish" by accident without it (or without its GPL files).
// Set KINGSIDE_NO_ENGINE=1 to deliberately build without a bundled engine.
import { existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'engine')
if (process.env.KINGSIDE_NO_ENGINE === '1') {
  console.log('check-engine: building WITHOUT a bundled engine (users must install Stockfish themselves).')
  process.exit(0)
}
const files = existsSync(dir) ? readdirSync(dir) : []
const exe = files.find((f) => /^stockfish.*\.exe$/i.test(f))
const missing = []
if (!exe) missing.push('stockfish*.exe')
if (!files.includes('Copying.txt')) missing.push('Copying.txt (GPL-3.0 text)')
if (!files.includes('SOURCE.txt')) missing.push('SOURCE.txt')
if (missing.length) {
  console.error(`check-engine: resources/engine is missing: ${missing.join(', ')}`)
  console.error('Run `npm run engine` first, or set KINGSIDE_NO_ENGINE=1 to build without bundling Stockfish.')
  process.exit(1)
}
console.log(`check-engine: bundling ${exe}${files.includes('stockfish-source.zip') ? ' + source zip' : ''}`)
