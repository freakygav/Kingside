import { existsSync, readdirSync, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { EngineSource } from '@shared/types'

export interface Candidate {
  path: string
  source: EngineSource
}

function exeIn(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => /^stockfish.*\.exe$/i.test(f) || (process.platform !== 'win32' && /^stockfish/i.test(f)))
      .map((f) => join(dir, f))
      .filter((p) => statSync(p).isFile())
  } catch {
    return []
  }
}

/**
 * Engine search order (first one that completes a UCI handshake wins):
 *   1. The path the user chose in Settings.
 *   2. KINGSIDE_STOCKFISH environment variable.
 *   3. The copy bundled with the app (resources/engine, filled by `npm run engine`).
 *   4. stockfish(.exe) on PATH.
 *   5. A winget install (winget install Stockfish.Stockfish).
 */
export function engineCandidates(opts: { settingsPath: string | null; bundledDir: string }): Candidate[] {
  const out: Candidate[] = []
  const push = (path: string, source: EngineSource) => {
    if (!out.some((c) => c.path.toLowerCase() === path.toLowerCase())) out.push({ path, source })
  }
  if (opts.settingsPath) push(opts.settingsPath, 'settings')
  if (process.env.KINGSIDE_STOCKFISH) push(process.env.KINGSIDE_STOCKFISH, 'env')
  for (const p of exeIn(opts.bundledDir)) push(p, 'bundled')
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    for (const name of process.platform === 'win32' ? ['stockfish.exe'] : ['stockfish']) {
      const p = join(dir, name)
      if (existsSync(p)) push(p, 'path')
    }
  }
  const local = process.env.LOCALAPPDATA
  if (local) {
    const pkgs = join(local, 'Microsoft', 'WinGet', 'Packages')
    try {
      for (const d of readdirSync(pkgs)) {
        if (!/^Stockfish\.Stockfish/i.test(d)) continue
        const base = join(pkgs, d)
        for (const p of exeIn(base)) push(p, 'winget')
        for (const sub of readdirSync(base)) for (const p of exeIn(join(base, sub))) push(p, 'winget')
      }
    } catch {
      /* no winget packages */
    }
  }
  return out
}
