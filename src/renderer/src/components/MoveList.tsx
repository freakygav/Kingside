import { useEffect, useRef } from 'react'
import type { MoveClass } from '@shared/review'
import { ClassIcon } from './ClassIcon'

interface Props {
  moves: { san: string }[]
  /** Number of plies currently shown on the board (0 = start position). */
  shownPly: number
  /** First ply is White's move unless the game started with Black to move. */
  whiteFirst?: boolean
  onSelect: (ply: number) => void
  classes?: (MoveClass | null)[]
}

export function MoveList({ moves, shownPly, onSelect, classes }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector('.mv.current') as HTMLElement | null
    if (el) el.scrollIntoView({ block: 'nearest' })
    else if (shownPly === moves.length && ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [shownPly, moves.length])

  const rows = []
  for (let i = 0; i < moves.length; i += 2) {
    rows.push(
      <div className="mv-row" key={i}>
        <span className="mv-no">{i / 2 + 1}.</span>
        {[i, i + 1].map((ply) =>
          ply < moves.length ? (
            <button
              key={ply}
              className={`mv${shownPly === ply + 1 ? ' current' : ''}`}
              onClick={() => onSelect(ply + 1)}
              data-ply={ply + 1}
            >
              {classes?.[ply] && <ClassIcon cls={classes[ply]!} size={15} />}
              {moves[ply].san}
            </button>
          ) : (
            <span key={ply} className="mv empty" />
          )
        )}
      </div>
    )
  }
  return (
    <div className="move-list" ref={ref} data-testid="move-list">
      {moves.length === 0 ? <div className="mv-empty">No moves yet</div> : rows}
    </div>
  )
}

interface NavProps {
  ply: number
  max: number
  onGo: (ply: number) => void
  onFlip?: () => void
}

export function NavControls({ ply, max, onGo, onFlip }: NavProps) {
  return (
    <div className="nav-controls">
      {onFlip && (
        <button className="icon-btn" onClick={onFlip} title="Flip board (F)">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 4v13l-3-3M17 20V7l3 3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      <button className="icon-btn" onClick={() => onGo(0)} disabled={ply === 0} title="First move (Home)">⏮</button>
      <button className="icon-btn" onClick={() => onGo(Math.max(0, ply - 1))} disabled={ply === 0} title="Previous move (←)">◀</button>
      <button className="icon-btn" onClick={() => onGo(Math.min(max, ply + 1))} disabled={ply >= max} title="Next move (→)">▶</button>
      <button className="icon-btn" onClick={() => onGo(max)} disabled={ply >= max} title="Latest move (End)">⏭</button>
    </div>
  )
}
