// Runs the end-to-end self-test against the built app (run `npm run build` first).
// Uses a throwaway profile; writes results.json + screenshots to ./selftest-output.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'selftest-output')
const profile = mkdtempSync(join(tmpdir(), 'kingside-selftest-'))
const electron = createRequire(import.meta.url)('electron')

const child = spawn(electron, ['.'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, KINGSIDE_SELFTEST: out, KINGSIDE_USERDATA: profile }
})
child.stdout.on('data', (d) => process.stdout.write(String(d).split('\n').filter((l) => /PASS|FAIL|SELFTEST/.test(l)).map((l) => l + '\n').join('')))
const timer = setTimeout(() => {
  console.error('Self-test timed out')
  child.kill()
}, 300_000)
child.on('exit', () => {
  clearTimeout(timer)
  try {
    const results = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8'))
    const failed = results.filter((r) => !r.ok)
    console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${out}`)
    process.exit(failed.length ? 1 : 0)
  } catch {
    console.error('No results.json written')
    process.exit(1)
  }
})
