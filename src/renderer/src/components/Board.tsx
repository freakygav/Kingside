import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Square } from 'chess.js'
import { fileOf, rankOf, squareAt } from '@shared/chessUtil'
import type { MoveClass } from '@shared/review'
import type { BoardTheme, Color } from '@shared/types'
import { pieceUrl } from '../pieces'
import { ClassIcon } from './ClassIcon'

export interface Arrow {
  from: Square
  to: Square
  color?: 'user' | 'best' | 'alt'
}

export interface BoardMovable {
  color: Color
  /** "move" = real move in the live position, "premove" = queue for the opponent's turn. */
  mode: 'move' | 'premove'
  dests: (from: Square) => Square[]
}

export type Promo = 'q' | 'r' | 'b' | 'n'

interface Props {
  fen: string
  orientation: Color
  movable: BoardMovable | null
  onMove?: (from: Square, to: Square, promotion?: Promo) => void
  onCancelPremove?: () => void
  lastMove?: { from: Square; to: Square } | null
  premove?: { from: Square; to: Square } | null
  checkSquare?: Square | null
  showLegal?: boolean
  showCoords?: boolean
  /** Legacy prop, kept for callers; colours now come from the appearance settings. */
  theme?: BoardTheme
  /** Non-user arrows, e.g. the engine's best move in review. */
  extraArrows?: Arrow[]
  badge?: { square: Square; cls: MoveClass } | null
  /** User annotations are cleared whenever this changes. */
  annotationKey?: string | number
  dimmed?: boolean
  /** Programmatic square highlights (lessons, hints, coach). */
  highlights?: { square: string; kind: 'good' | 'bad' | 'focus' | 'hint' }[]
  /** Appearance override (live preview); otherwise the app-wide CSS variables and piece set apply. */
  colors?: { light: string; dark: string }
  pieceSet?: string
  /** Clicking a square (for "find the square" exercises). Called in addition to normal handling. */
  onSquareClick?: (square: Square) => void
}

function parsePlacement(fen: string): Map<Square, string> {
  const map = new Map<Square, string>()
  const rows = fen.split(' ')[0].split('/')
  rows.forEach((row, i) => {
    let file = 0
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch)
      else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b'
        map.set(squareAt(file, 7 - i), color + ch.toUpperCase())
        file++
      }
    }
  })
  return map
}

const PROMO_PIECES: Promo[] = ['q', 'n', 'r', 'b']

export function Board(props: Props) {
  const { fen, orientation, movable, onMove, lastMove, premove, checkSquare, theme } = props
  const showLegal = props.showLegal ?? true
  const rootRef = useRef<HTMLDivElement>(null)
  const floatRef = useRef<HTMLDivElement>(null)
  const pieces = useMemo(() => parsePlacement(fen), [fen])

  const [selected, setSelected] = useState<Square | null>(null)
  const [dragFrom, setDragFrom] = useState<Square | null>(null)
  const [hover, setHover] = useState<Square | null>(null)
  const [marks, setMarks] = useState<Square[]>([])
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [drawing, setDrawing] = useState<{ from: Square; to: Square } | null>(null)
  const [promo, setPromo] = useState<{ from: Square; to: Square; color: Color } | null>(null)

  const ptr = useRef<{ id: number; from: Square; x: number; y: number; wasSelected: boolean; dragging: boolean } | null>(null)
  const lastPointer = useRef({ x: 0, y: 0 })
  const skipAnim = useRef<string | null>(null)

  // Geometry helpers ---------------------------------------------------------
  const colRow = useCallback(
    (sq: Square) => {
      const f = fileOf(sq)
      const r = rankOf(sq)
      return orientation === 'w' ? { col: f, row: 7 - r } : { col: 7 - f, row: r }
    },
    [orientation]
  )

  const squareFromPoint = useCallback(
    (x: number, y: number): Square | null => {
      const el = rootRef.current
      if (!el) return null
      const rect = el.getBoundingClientRect()
      const col = Math.floor(((x - rect.left) / rect.width) * 8)
      const row = Math.floor(((y - rect.top) / rect.height) * 8)
      if (col < 0 || col > 7 || row < 0 || row > 7) return null
      return orientation === 'w' ? squareAt(col, 7 - row) : squareAt(7 - col, row)
    },
    [orientation]
  )

  // State resets -------------------------------------------------------------
  useEffect(() => {
    setMarks([])
    setArrows([])
  }, [props.annotationKey])

  useEffect(() => {
    // Keep a selection across the opponent's move only if it is still one of our pieces.
    setSelected((s) => (s && movable && pieces.get(s)?.[0] === movable.color ? s : null))
    setPromo((p) => (p && movable ? p : null))
    if (!movable && ptr.current) {
      ptr.current = null
      setDragFrom(null)
    }
  }, [fen, movable, pieces])

  useEffect(() => {
    skipAnim.current = null
  }, [fen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
        setPromo(null)
        props.onCancelPremove?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onCancelPremove])

  useLayoutEffect(() => {
    if (dragFrom && floatRef.current) positionFloat(lastPointer.current.x, lastPointer.current.y)
  }, [dragFrom])

  function positionFloat(x: number, y: number) {
    const el = rootRef.current
    const fl = floatRef.current
    if (!el || !fl) return
    const rect = el.getBoundingClientRect()
    const size = rect.width / 8
    fl.style.transform = `translate(${x - rect.left - size / 2}px, ${y - rect.top - size / 2}px)`
  }

  const dests = useMemo(() => (movable && selected ? movable.dests(selected) : []), [movable, selected])

  // Moves ----------------------------------------------------------------------
  function commit(from: Square, to: Square, viaDrag: boolean) {
    const code = pieces.get(from)
    setSelected(null)
    if (!code || !movable) return
    const isPawn = code[1] === 'P'
    const lastRank = code[0] === 'w' ? '8' : '1'
    if (isPawn && to[1] === lastRank) {
      setPromo({ from, to, color: code[0] as Color })
      return
    }
    if (viaDrag) skipAnim.current = from + to
    onMove?.(from, to)
  }

  function ownPiece(sq: Square): boolean {
    return !!movable && pieces.get(sq)?.[0] === movable.color
  }

  function onPointerDown(e: React.PointerEvent) {
    if (promo) return
    const sq = squareFromPoint(e.clientX, e.clientY)
    if (!sq) return
    lastPointer.current = { x: e.clientX, y: e.clientY }

    if (e.button === 2) {
      // Right button: cancel an in-progress drag, otherwise start an annotation.
      if (ptr.current) {
        ptr.current = null
        setDragFrom(null)
        setSelected(null)
        return
      }
      setDrawing({ from: sq, to: sq })
      rootRef.current?.setPointerCapture(e.pointerId)
      return
    }
    if (e.button !== 0) return
    props.onSquareClick?.(sq)

    // Any left click clears drawn annotations.
    if (marks.length || arrows.length) {
      setMarks([])
      setArrows([])
    }

    // Clicking another of your own pieces re-selects (even if a premove could target that square).
    if (selected && sq !== selected && dests.includes(sq) && !ownPiece(sq)) {
      commit(selected, sq, false)
      return
    }
    if (ownPiece(sq)) {
      ptr.current = { id: e.pointerId, from: sq, x: e.clientX, y: e.clientY, wasSelected: selected === sq, dragging: false }
      setSelected(sq)
      rootRef.current?.setPointerCapture(e.pointerId)
      return
    }
    setSelected(null)
    if (premove) props.onCancelPremove?.()
  }

  function onPointerMove(e: React.PointerEvent) {
    lastPointer.current = { x: e.clientX, y: e.clientY }
    if (drawing) {
      const sq = squareFromPoint(e.clientX, e.clientY)
      if (sq && sq !== drawing.to) setDrawing({ from: drawing.from, to: sq })
      return
    }
    const p = ptr.current
    if (!p || p.id !== e.pointerId) return
    if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) {
      p.dragging = true
      setDragFrom(p.from)
    }
    if (p.dragging) {
      positionFloat(e.clientX, e.clientY)
      const sq = squareFromPoint(e.clientX, e.clientY)
      if (sq !== hover) setHover(sq)
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (e.button === 2 && drawing) {
      const from = drawing.from
      const to = squareFromPoint(e.clientX, e.clientY) ?? drawing.to
      setDrawing(null)
      if (from === to) {
        setMarks((m) => (m.includes(from) ? m.filter((s) => s !== from) : [...m, from]))
      } else {
        setArrows((a) => {
          const i = a.findIndex((x) => x.from === from && x.to === to)
          return i >= 0 ? a.filter((_, j) => j !== i) : [...a, { from, to, color: 'user' }]
        })
      }
      return
    }
    const p = ptr.current
    if (!p || p.id !== e.pointerId || e.button !== 0) return
    ptr.current = null
    if (p.dragging) {
      setDragFrom(null)
      setHover(null)
      const target = squareFromPoint(e.clientX, e.clientY)
      if (target && target !== p.from && movable?.dests(p.from).includes(target)) commit(p.from, target, true)
      else if (target !== p.from) setSelected(null)
    } else if (p.wasSelected) {
      setSelected(null)
    }
  }

  function onPointerCancel() {
    ptr.current = null
    setDragFrom(null)
    setHover(null)
    setDrawing(null)
  }

  // Rendering ------------------------------------------------------------------
  const pos = (sq: Square) => {
    const { col, row } = colRow(sq)
    return { left: `${col * 12.5}%`, top: `${row * 12.5}%` }
  }

  const squares = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = orientation === 'w' ? squareAt(col, 7 - row) : squareAt(7 - col, row)
      const light = (fileOf(sq) + rankOf(sq)) % 2 === 1
      squares.push(
        <div key={sq} className={`sq ${light ? 'light' : 'dark'}`} style={{ left: `${col * 12.5}%`, top: `${row * 12.5}%` }}>
          {props.showCoords !== false && col === 0 && <span className="coord rank">{sq[1]}</span>}
          {props.showCoords !== false && row === 7 && <span className="coord file">{sq[0]}</span>}
        </div>
      )
    }
  }

  const hl: { sq: Square; cls: string }[] = []
  if (lastMove) hl.push({ sq: lastMove.from, cls: 'hl-last' }, { sq: lastMove.to, cls: 'hl-last' })
  if (premove) hl.push({ sq: premove.from, cls: 'hl-premove' }, { sq: premove.to, cls: 'hl-premove' })
  if (selected) hl.push({ sq: selected, cls: movable?.mode === 'premove' ? 'hl-select-pre' : 'hl-select' })
  if (checkSquare) hl.push({ sq: checkSquare, cls: 'hl-check' })
  for (const h of props.highlights ?? []) hl.push({ sq: h.square as Square, cls: `hl-${h.kind}` })
  for (const m of marks) hl.push({ sq: m, cls: 'hl-mark' })
  if (dragFrom && hover) hl.push({ sq: hover, cls: 'hl-hover' })

  const animKey = lastMove ? lastMove.from + lastMove.to : null
  const allArrows = [...(props.extraArrows ?? []), ...arrows]
  if (drawing && drawing.from !== drawing.to) allArrows.push({ ...drawing, color: 'user' })

  return (
    <div
      ref={rootRef}
      className={`board${props.dimmed ? ' dimmed' : ''}${dragFrom ? ' dragging' : ''}`}
      style={props.colors ? ({ ['--sq-light' as string]: props.colors.light, ['--sq-dark' as string]: props.colors.dark } as React.CSSProperties) : undefined}
      data-theme={theme}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="board"
    >
      {squares}
      {hl.map((h, i) => (
        <div key={`${h.cls}-${h.sq}-${i}`} className={`hl ${h.cls}`} style={pos(h.sq)} data-square={h.sq} />
      ))}
      {showLegal &&
        dests.map((d) => (
          <div key={`d-${d}`} className={`hint ${pieces.has(d) ? 'capture' : 'dot'}${movable?.mode === 'premove' ? ' pre' : ''}`} style={pos(d)} />
        ))}
      {[...pieces.entries()].map(([sq, code]) => {
        const anim = animKey && lastMove!.to === sq && skipAnim.current !== animKey
        let style: React.CSSProperties = { ...pos(sq), backgroundImage: `url("${pieceUrl(code, props.pieceSet)}")` }
        if (anim) {
          const a = colRow(lastMove!.from)
          const b = colRow(sq)
          style = { ...style, ['--dx' as string]: `${(a.col - b.col) * 100}%`, ['--dy' as string]: `${(a.row - b.row) * 100}%` }
        }
        return (
          <div
            key={`${sq}${code}`}
            className={`piece${anim ? ' anim' : ''}${dragFrom === sq ? ' ghost' : ''}`}
            style={style}
            data-square={sq}
            data-piece={code}
          />
        )
      })}
      <svg className="arrows" viewBox="0 0 8 8" preserveAspectRatio="none">
        {allArrows.map((a, i) => (
          <ArrowShape key={`${a.from}${a.to}${i}`} arrow={a} colRow={colRow} />
        ))}
      </svg>
      {props.badge && (
        <div className="badge" style={pos(props.badge.square)}>
          <ClassIcon cls={props.badge.cls} size={26} />
        </div>
      )}
      {dragFrom && pieces.get(dragFrom) && (
        <div ref={floatRef} className="piece floating" style={{ backgroundImage: `url("${pieceUrl(pieces.get(dragFrom)!, props.pieceSet)}")` }} />
      )}
      {promo && (
        <div
          className="promo-overlay"
          onPointerDown={(e) => {
            e.stopPropagation()
            if (e.target === e.currentTarget) setPromo(null)
          }}
        >
          {PROMO_PIECES.map((p, i) => {
            const { col, row } = colRow(promo.to)
            const dir = row === 0 ? 1 : -1
            return (
              <button
                key={p}
                className="promo-choice"
                style={{ left: `${col * 12.5}%`, top: `${(row + dir * i) * 12.5}%`, backgroundImage: `url("${pieceUrl(promo.color + p.toUpperCase(), props.pieceSet)}")` }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  const { from, to } = promo
                  setPromo(null)
                  onMove?.(from, to, p)
                }}
                aria-label={`Promote to ${p}`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function ArrowShape({ arrow, colRow }: { arrow: Arrow; colRow: (sq: Square) => { col: number; row: number } }) {
  const a = colRow(arrow.from)
  const b = colRow(arrow.to)
  const x1 = a.col + 0.5
  const y1 = a.row + 0.5
  const x2 = b.col + 0.5
  const y2 = b.row + 0.5
  const dc = Math.abs(b.col - a.col)
  const dr = Math.abs(b.row - a.row)
  const knight = (dc === 1 && dr === 2) || (dc === 2 && dr === 1)
  const pts: [number, number][] = [[x1, y1]]
  if (knight) pts.push(dr > dc ? [x1, y2] : [x2, y1])
  pts.push([x2, y2])

  // Shorten the last segment so the head ends near the target centre.
  const [px, py] = pts[pts.length - 2]
  const len = Math.hypot(x2 - px, y2 - py)
  const ux = (x2 - px) / len
  const uy = (y2 - py) / len
  const head = 0.42
  const tipX = x2 - ux * 0.08
  const tipY = y2 - uy * 0.08
  const baseX = tipX - ux * head
  const baseY = tipY - uy * head
  const body = [...pts.slice(0, -1), [baseX, baseY]]
  // Start slightly away from the origin centre.
  const [sx, sy] = body[0]
  const [nx, ny] = body[1]
  const sl = Math.hypot(nx - sx, ny - sy)
  body[0] = [sx + ((nx - sx) / sl) * 0.18, sy + ((ny - sy) / sl) * 0.18]
  const w = 0.24
  const cls = `arrow arrow-${arrow.color ?? 'user'}`
  return (
    <g className={cls}>
      <polyline points={body.map((p) => p.join(',')).join(' ')} fill="none" strokeWidth={0.17} strokeLinejoin="round" />
      <polygon
        points={`${tipX},${tipY} ${baseX - uy * w},${baseY + ux * w} ${baseX + uy * w},${baseY - ux * w}`}
        stroke="none"
      />
    </g>
  )
}
