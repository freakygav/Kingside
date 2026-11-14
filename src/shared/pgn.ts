import { Chess } from 'chess.js'

/**
 * PGN import/export. The original PGN text of every game is always kept, so comments and side
 * variations are preserved even though only the main line is played on the board.
 */

export interface ParsedGame {
  /** Index of the game inside the source text (0-based). */
  index: number
  headers: Record<string, string>
  startFen: string
  /** Main-line moves. */
  sans: string[]
  ucis: string[]
  /** Final position (after the last valid move). */
  fen: string
  result: '1-0' | '0-1' | '1/2-1/2' | '*'
  /** Original text of this game, untouched. */
  raw: string
  comments: number
  variations: number
  /** Present when the movetext could not be fully read. `sans` holds the valid prefix. */
  error?: { message: string; moveNumber: number; token: string }
}

const RESULTS = ['1-0', '0-1', '1/2-1/2', '*']
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Split a PGN file into game chunks: header block(s) followed by movetext ending in a result. */
export function splitGames(text: string): string[] {
  const src = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '')
  const games: string[] = []
  let cur: string[] = []
  let inMoves = false
  let braceDepth = 0
  const flush = () => {
    const g = cur.join('\n').trim()
    if (g) games.push(g)
    cur = []
    inMoves = false
    braceDepth = 0
  }
  for (const line of src.split('\n')) {
    const t = line.trim()
    if (braceDepth === 0 && t.startsWith('[') && /^\[\w+\s+"/.test(t)) {
      if (inMoves) flush()
      cur.push(line)
      continue
    }
    if (t === '' && !inMoves) {
      if (cur.length) cur.push(line)
      continue
    }
    if (t.startsWith('%')) continue // escape lines
    inMoves = inMoves || t.length > 0
    cur.push(line)
    for (const ch of line) {
      if (ch === '{') braceDepth++
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1)
    }
    // A result token at the end of the movetext closes the game (outside comments).
    if (braceDepth === 0) {
      const stripped = line.replace(/\{[^}]*\}/g, ' ').replace(/;.*$/, '').trim()
      const last = stripped.split(/\s+/).pop() ?? ''
      if (RESULTS.includes(last)) flush()
    }
  }
  flush()
  return games
}

function parseHeaders(chunk: string): { headers: Record<string, string>; movetext: string } {
  const headers: Record<string, string> = {}
  const lines = chunk.split('\n')
  let i = 0
  for (; i < lines.length; i++) {
    const m = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/.exec(lines[i])
    if (m) headers[m[1]] = m[2].replace(/\\(.)/g, '$1')
    else if (lines[i].trim() !== '') break
  }
  return { headers, movetext: lines.slice(i).join('\n') }
}

interface Token {
  kind: 'move' | 'result'
  text: string
}

/** Tokenise movetext, skipping comments, NAGs, move numbers and (nested) variations. */
function tokenize(movetext: string): { tokens: Token[]; comments: number; variations: number } {
  const tokens: Token[] = []
  let comments = 0
  let variations = 0
  let depth = 0
  let i = 0
  const s = movetext
  while (i < s.length) {
    const ch = s[i]
    if (ch === '{') {
      const end = s.indexOf('}', i)
      comments++
      i = end < 0 ? s.length : end + 1
      continue
    }
    if (ch === ';') {
      const end = s.indexOf('\n', i)
      comments++
      i = end < 0 ? s.length : end + 1
      continue
    }
    if (ch === '(') {
      if (depth === 0) variations++
      depth++
      i++
      continue
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1)
      i++
      continue
    }
    if (/\s/.test(ch)) {
      i++
      continue
    }
    let j = i
    while (j < s.length && !/[\s{}();]/.test(s[j])) j++
    const word = s.slice(i, j)
    i = j
    if (depth > 0) continue
    if (RESULTS.includes(word)) {
      tokens.push({ kind: 'result', text: word })
      continue
    }
    if (/^\$\d+$/.test(word)) continue // NAG
    if (/^e\.p\.?$/i.test(word)) continue // en passant marker written as its own token
    // Strip move numbers glued to moves ("12.Nf3", "12...Nf3") and annotation glyphs.
    const cleaned = word.replace(/^\d+\.(\.\.)?/, '').replace(/^\.+/, '').replace(/[!?]+$/, '')
    if (!cleaned || /^\d+\.*$/.test(cleaned)) continue
    tokens.push({ kind: 'move', text: cleaned })
  }
  return { tokens, comments, variations }
}

/** Normalise notations chess.js may not accept: 0-0, e8Q, "e.p.", piece letters in other cases. */
function normalizeSan(t: string): string {
  return t
    .replace(/^0-0-0/, 'O-O-O')
    .replace(/^0-0/, 'O-O')
    .replace(/e\.p\.$/, '')
    .replace(/^([a-h][18])([QRBN])([+#]?)$/, '$1=$2$3')
    .replace(/^([a-h]x[a-h][18])([QRBN])([+#]?)$/, '$1=$2$3')
    .replace(/[+#]+$/, (m) => m[0])
}

export function parseGame(chunk: string, index = 0): ParsedGame {
  const { headers, movetext } = parseHeaders(chunk)
  let startFen = START
  if (headers.FEN && (headers.SetUp === undefined || headers.SetUp === '1')) startFen = headers.FEN.trim()
  const out: ParsedGame = { index, headers, startFen, sans: [], ucis: [], fen: startFen, result: '*', raw: chunk, comments: 0, variations: 0 }
  let chess: Chess
  try {
    chess = new Chess(startFen)
  } catch (e) {
    out.error = { message: `Invalid FEN header: ${(e as Error).message}`, moveNumber: 0, token: headers.FEN ?? '' }
    return out
  }
  const { tokens, comments, variations } = tokenize(movetext)
  out.comments = comments
  out.variations = variations
  for (const tok of tokens) {
    if (tok.kind === 'result') {
      out.result = tok.text as ParsedGame['result']
      break
    }
    const san = normalizeSan(tok.text)
    try {
      const m = chess.move(san, { strict: false })
      out.sans.push(m.san)
      out.ucis.push(m.from + m.to + (m.promotion ?? ''))
    } catch {
      const moveNumber = Math.floor(out.sans.length / 2) + (Number(startFen.split(' ')[5]) || 1)
      const side = chess.turn() === 'w' ? `${moveNumber}.` : `${moveNumber}...`
      out.error = { message: `Illegal or unreadable move "${tok.text}" at ${side}`, moveNumber, token: tok.text }
      break
    }
  }
  out.fen = chess.fen()
  if (out.result === '*' && headers.Result && RESULTS.includes(headers.Result)) out.result = headers.Result as ParsedGame['result']
  return out
}

export function parsePgn(text: string): ParsedGame[] {
  return splitGames(text).map((g, i) => parseGame(g, i))
}

// ---------------------------------------------------------------------------------------------
// Export

const NAG: Record<string, string> = { brilliant: '$3', great: '$1', inaccuracy: '$6', mistake: '$2', blunder: '$4', miss: '$2' }

export interface ExportAnnotation {
  /** White-POV centipawns after the move (mates as +/-100000-ish). */
  evalAfter?: number
  cls?: string | null
  bestSan?: string | null
}

function fmtEval(cp: number): string {
  if (Math.abs(cp) >= 50_000) {
    const n = Math.max(1, Math.round((100_000 - Math.abs(cp)) / 100))
    return `#${cp > 0 ? '' : '-'}${n}`
  }
  return (cp / 100).toFixed(2)
}

const escapeHeader = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/**
 * Write a PGN. Header order follows the Seven Tag Roster. With annotations, moves get
 * [%eval] comments, classification NAGs and the engine's alternative for errors.
 */
export function writePgn(headers: Record<string, string>, startFen: string, sans: string[], result: string, notes?: (ExportAnnotation | null)[]): string {
  const roster = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result']
  const h: Record<string, string> = { Event: '?', Site: '?', Date: '????.??.??', Round: '?', White: '?', Black: '?', ...headers, Result: result }
  if (startFen !== START) {
    h.SetUp = '1'
    h.FEN = startFen
  }
  const lines = [...roster.map((k) => `[${k} "${escapeHeader(h[k])}"]`), ...Object.entries(h).filter(([k]) => !roster.includes(k)).map(([k, v]) => `[${k} "${escapeHeader(v)}"]`)]
  const parts: string[] = []
  const fenParts = startFen.split(' ')
  let moveNo = Number(fenParts[5]) || 1
  let white = fenParts[1] === 'w'
  sans.forEach((san, i) => {
    if (white) parts.push(`${moveNo}.`)
    else if (i === 0) parts.push(`${moveNo}...`)
    parts.push(san)
    const n = notes?.[i]
    if (n) {
      if (n.cls && NAG[n.cls]) parts.push(NAG[n.cls])
      const bits: string[] = []
      if (n.evalAfter !== undefined) bits.push(`[%eval ${fmtEval(n.evalAfter)}]`)
      if (n.cls && n.bestSan && ['inaccuracy', 'mistake', 'blunder', 'miss'].includes(n.cls)) bits.push(`${n.cls[0].toUpperCase()}${n.cls.slice(1)}. Best was ${n.bestSan}.`)
      if (bits.length) parts.push(`{ ${bits.join(' ')} }`)
    }
    if (!white) moveNo++
    white = !white
  })
  parts.push(result)
  // Wrap movetext at ~80 columns.
  const wrapped: string[] = []
  let line = ''
  for (const p of parts) {
    if ((line + ' ' + p).trim().length > 80) {
      wrapped.push(line.trim())
      line = p
    } else line += ' ' + p
  }
  if (line.trim()) wrapped.push(line.trim())
  return `${lines.join('\n')}\n\n${wrapped.join('\n')}\n`
}
