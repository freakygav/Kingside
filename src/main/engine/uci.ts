import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { dirname } from 'node:path'
import type { AnalysisLine, SearchResult } from '@shared/types'

export interface UciOption {
  name: string
  type: string
  default?: string
  min?: number
  max?: number
}

/** Parse one `info ...` line. Returns null for lines without a score + pv (currmove spam etc.). */
export function parseInfo(line: string): AnalysisLine | null {
  if (!line.startsWith('info ')) return null
  const t = line.split(/\s+/)
  let depth = 0
  let multipv = 1
  let cp: number | undefined
  let mate: number | undefined
  let pv: string[] = []
  let bound = false
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth':
        depth = Number(t[++i])
        break
      case 'multipv':
        multipv = Number(t[++i])
        break
      case 'score':
        if (t[i + 1] === 'cp') cp = Number(t[i + 2])
        else if (t[i + 1] === 'mate') mate = Number(t[i + 2])
        i += 2
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          bound = true
          i++
        }
        break
      case 'pv':
        pv = t.slice(i + 1)
        i = t.length
        break
    }
  }
  if (bound || pv.length === 0 || (cp === undefined && mate === undefined)) return null
  return { depth, multipv, cp, mate, pv }
}

export function parseOption(line: string): UciOption | null {
  const m = /^option name (.+?) type (\S+)(.*)$/.exec(line)
  if (!m) return null
  const rest = m[3]
  const def = /\bdefault (.*?)(?= min | max | var |$)/.exec(rest)?.[1]
  const min = /\bmin (-?\d+)/.exec(rest)?.[1]
  const max = /\bmax (-?\d+)/.exec(rest)?.[1]
  return {
    name: m[1],
    type: m[2],
    default: def,
    min: min !== undefined ? Number(min) : undefined,
    max: max !== undefined ? Number(max) : undefined
  }
}

/**
 * Minimal UCI client over stdio. One search at a time; callers serialise through `search`.
 * Emits 'exit' (code, signal) if the process dies.
 */
export class UciEngine extends EventEmitter {
  name = 'Unknown engine'
  readonly options = new Map<string, UciOption>()
  private buf = ''
  private lineListeners = new Set<(line: string) => void>()
  private alive = true
  private searching: Promise<SearchResult> | null = null
  private current = new Map<string, string>()

  private constructor(private proc: ChildProcessWithoutNullStreams, readonly path: string) {
    super()
    proc.stdout.setEncoding('utf8')
    proc.stdout.on('data', (chunk: string) => {
      this.buf += chunk
      let idx: number
      while ((idx = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, idx).replace(/\r$/, '')
        this.buf = this.buf.slice(idx + 1)
        for (const l of [...this.lineListeners]) l(line)
      }
    })
    proc.stderr.on('data', () => {})
    proc.on('exit', (code, signal) => {
      this.alive = false
      this.emit('exit', code, signal)
    })
    proc.on('error', (err) => {
      this.alive = false
      this.emit('exit', null, String(err))
    })
    proc.stdin.on('error', () => {
      this.alive = false
    })
  }

  get isAlive(): boolean {
    return this.alive
  }

  /** Spawn and complete the UCI handshake. Rejects with a readable message on failure. */
  static async start(path: string, timeoutMs = 10_000): Promise<UciEngine> {
    let proc: ChildProcessWithoutNullStreams
    try {
      proc = spawn(path, [], { cwd: dirname(path), windowsHide: true, stdio: 'pipe' })
    } catch (e) {
      throw new Error(`Could not start engine: ${(e as Error).message}`)
    }
    const engine = new UciEngine(proc, path)
    const spawnError = new Promise<never>((_, reject) => {
      proc.once('error', (err) => reject(new Error(`Could not start engine: ${err.message}`)))
      proc.once('exit', (code) => reject(new Error(`Engine exited during startup (code ${code ?? 'unknown'})`)))
    })
    try {
      engine.send('uci')
      await Promise.race([
        engine.waitFor((l) => {
          if (l.startsWith('id name ')) engine.name = l.slice(8).trim()
          const opt = parseOption(l)
          if (opt) engine.options.set(opt.name, opt)
          return l === 'uciok'
        }, timeoutMs, 'Engine did not answer the UCI handshake (is this a UCI chess engine?)'),
        spawnError
      ])
      await Promise.race([engine.isReady(timeoutMs), spawnError])
    } catch (e) {
      engine.quit()
      throw e
    }
    spawnError.catch(() => {})
    return engine
  }

  send(cmd: string): void {
    if (!this.alive) throw new Error('Engine process is not running')
    this.proc.stdin.write(cmd + '\n')
  }

  waitFor(pred: (line: string) => boolean, timeoutMs: number, timeoutMsg = 'Engine timed out'): Promise<string> {
    return new Promise((resolve, reject) => {
      const onExit = () => {
        cleanup()
        reject(new Error('Engine process exited unexpectedly'))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(timeoutMsg))
      }, timeoutMs)
      const listener = (line: string) => {
        if (pred(line)) {
          cleanup()
          resolve(line)
        }
      }
      const cleanup = () => {
        clearTimeout(timer)
        this.lineListeners.delete(listener)
        this.off('exit', onExit)
      }
      this.lineListeners.add(listener)
      this.once('exit', onExit)
    })
  }

  async isReady(timeoutMs = 10_000): Promise<void> {
    this.send('isready')
    await this.waitFor((l) => l === 'readyok', timeoutMs, 'Engine did not respond to isready')
  }

  hasOption(name: string): boolean {
    return this.options.has(name)
  }

  /** Set an option only if it changed. Unknown options are rejected so misconfiguration is visible. */
  setOption(name: string, value: string): void {
    if (!this.options.has(name)) throw new Error(`Engine "${this.name}" has no option "${name}"`)
    if (this.current.get(name) === value) return
    this.send(`setoption name ${name} value ${value}`)
    this.current.set(name, value)
  }

  newGame(): void {
    this.send('ucinewgame')
  }

  /**
   * Run `go` on a FEN and collect the final line per multipv. Resolves on `bestmove`.
   * `hardTimeoutMs` guards against an engine that never answers.
   */
  async search(fen: string, go: string, hardTimeoutMs: number): Promise<SearchResult> {
    if (this.searching) {
      this.stop()
      await this.searching.catch(() => {})
    }
    const run = (async () => {
      await this.isReady()
      const lines = new Map<number, AnalysisLine>()
      const collect = (line: string) => {
        const info = parseInfo(line)
        if (info) {
          const prev = lines.get(info.multipv)
          if (!prev || info.depth >= prev.depth) lines.set(info.multipv, info)
        }
      }
      this.lineListeners.add(collect)
      try {
        this.send(`position fen ${fen}`)
        this.send(`go ${go}`)
        const bm = await this.waitFor((l) => l.startsWith('bestmove'), hardTimeoutMs, 'Engine search timed out')
        const best = bm.split(/\s+/)[1]
        const sorted = [...lines.values()].sort((a, b) => a.multipv - b.multipv)
        return { bestmove: best && best !== '(none)' ? best : null, lines: sorted }
      } finally {
        this.lineListeners.delete(collect)
      }
    })()
    this.searching = run
    try {
      return await run
    } finally {
      if (this.searching === run) this.searching = null
    }
  }

  stop(): void {
    if (this.alive) this.send('stop')
  }

  quit(): void {
    if (!this.alive) return
    try {
      this.proc.stdin.write('quit\n')
    } catch {
      /* ignore */
    }
    const p = this.proc
    setTimeout(() => {
      if (p.exitCode === null) p.kill()
    }, 1000).unref()
  }
}
