import { useEffect, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { COACHES, getCoach } from '@shared/coach/coaches'
import { judgeMove, type MoveJudgement } from '@shared/coach/explain'
import { CLASS_LABEL, expectedForMover, type MoveClass } from '@shared/review'
import type { CoachFeedback } from '@shared/progress'
import { analyzeFen } from '../game/analysisCache'
import type { GameSession } from '../game/session'
import { RichText, useProfile } from '../profile'
import { ClassIcon } from './ClassIcon'

export interface WatchItem {
  ply: number
  san: string
  judgement: MoveJudgement
}

const SHOW: Record<CoachFeedback, (c: MoveClass | null) => boolean> = {
  every: () => true,
  mistakes: (c) => c === 'inaccuracy' || c === 'mistake' || c === 'blunder' || c === 'miss' || c === 'brilliant' || c === 'great',
  blunders: (c) => c === 'blunder' || c === 'miss',
  end: () => false
}

/**
 * "Coach watching" during a live game. After each of the player's moves it analyses the position
 * before and after (in the background, on the analysis engine) and judges the move. Feedback appears
 * quietly in this panel according to the chosen level; nothing pops up over the board.
 * It never comments before you move, so it doesn't play for you.
 */
export function CoachWatch({ session, version, items, setItems }: { session: GameSession; version: number; items: WatchItem[]; setItems: (f: (x: WatchItem[]) => WatchItem[]) => void }) {
  const { profile, send } = useProfile()
  const prefs = profile?.coach ?? { selectedId: 'beginner', feedback: 'mistakes' as CoachFeedback, training: false }
  const coach = getCoach(prefs.selectedId)
  const done = useRef(new Set<number>())
  const running = useRef(false)
  const gameRef = useRef(session.gameId)
  const coachRef = useRef(coach)
  coachRef.current = coach
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // One persistent worker per game: new moves are picked up as they appear, and a later move never
  // cancels the judgement of an earlier one.
  useEffect(() => {
    if (!prefs.training || running.current) return
    running.current = true
    setBusy(true)
    const game = session.gameId
    void (async () => {
      for (;;) {
        if (gameRef.current !== game) break
        const next = session.moves.findIndex((m, i) => m.color === session.playerColor && !done.current.has(i))
        if (next < 0) break
        const i = next
        const m = session.moves[i]
        const fens = session.fens
        done.current.add(i)
        try {
          const before = await analyzeFen(fens[i], 2, 450)
          const after = await analyzeFen(fens[i + 1], 1, 450)
          // The bot's previous move, to detect missed chances it handed you.
          let prevLoss = 0
          let prevMoverEp: number | null = null
          if (i > 0) {
            const pb = await analyzeFen(fens[i - 1], 1, 300)
            const botBest = expectedForMover({ fen: fens[i - 1], lines: pb })
            const botAfter = 1 - expectedForMover({ fen: fens[i], lines: before })
            prevLoss = Math.max(0, botBest - botAfter)
            prevMoverEp = 1 - botBest
          }
          const j = judgeMove(fens[i], m.uci, before, after, { perspective: session.playerColor, prevLoss, prevMoverEp }, coachRef.current)
          if (gameRef.current === game) setItems((x) => [...x, { ply: i, san: m.san, judgement: j }].sort((a, b) => a.ply - b.ply))
        } catch {
          /* engine unavailable: skip silently, the game must not be disturbed */
        }
      }
      running.current = false
      setBusy(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, prefs.training])

  useEffect(() => {
    // New game: reset what has been judged.
    if (gameRef.current !== session.gameId) {
      gameRef.current = session.gameId
      done.current.clear()
      running.current = false
      setItems(() => [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.gameId, version])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [items.length])

  const over = session.status === 'over'
  const visible = items.filter((it) => (over && prefs.feedback === 'end') || SHOW[prefs.feedback](it.judgement.cls))
  const counts = items.reduce<Record<string, number>>((acc, it) => {
    if (it.judgement.cls) acc[it.judgement.cls] = (acc[it.judgement.cls] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="coach-watch" data-testid="coach-watch">
      <div className="cw-head">
        <label className="set-row toggle cw-toggle">
          <span>Coach watching</span>
          <input type="checkbox" checked={prefs.training} onChange={(e) => void send({ type: 'coachPrefs', prefs: { training: e.target.checked } })} data-testid="coach-watch-toggle" />
          <i className="switch" />
        </label>
        {prefs.training && (
          <div className="cw-controls">
            <select value={prefs.selectedId} onChange={(e) => void send({ type: 'coachPrefs', prefs: { selectedId: e.target.value } })}>
              {COACHES.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.elo})</option>)}
            </select>
            <select value={prefs.feedback} onChange={(e) => void send({ type: 'coachPrefs', prefs: { feedback: e.target.value as CoachFeedback } })} data-testid="coach-feedback">
              <option value="every">Every move</option>
              <option value="mistakes">Only mistakes</option>
              <option value="blunders">Only blunders</option>
              <option value="end">End of game</option>
            </select>
          </div>
        )}
      </div>
      {prefs.training && (
        <div className="cw-list" ref={listRef}>
          {visible.length === 0 && (
            <div className="muted small">
              {prefs.feedback === 'end' && !over ? `${coach.name} is quietly taking notes. Feedback comes when the game ends.` : busy ? `${coach.name} is looking at your move…` : `${coach.name} will comment here after your moves.`}
            </div>
          )}
          {visible.map((it) => (
            <div key={it.ply} className="cw-item">
              <div className="cw-item-head">
                {it.judgement.cls && <ClassIcon cls={it.judgement.cls} size={16} />}
                <b>{Math.floor(it.ply / 2) + 1}{it.ply % 2 === 0 ? '.' : '...'} {it.san}</b>
                {it.judgement.cls && <span className="muted small">{CLASS_LABEL[it.judgement.cls]}</span>}
              </div>
              {it.judgement.paragraphs.slice(1, 4).map((p, i) => <p key={i}><RichText text={p} /></p>)}
            </div>
          ))}
          {over && items.length > 0 && (
            <div className="cw-summary">
              <b>{coach.name}'s summary:</b>{' '}
              {Object.keys(counts).length ? Object.entries(counts).map(([k, n]) => `${n} ${CLASS_LABEL[k as MoveClass].toLowerCase()}`).join(', ') : 'no moves judged'}.
              {' '}Open Game Review → Coach review for the full breakdown.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Whether a game position is still the live one (used to avoid stale comments). */
export function isSamePosition(a: string, b: string): boolean {
  return new Chess(a).fen().split(' ').slice(0, 4).join(' ') === new Chess(b).fen().split(' ').slice(0, 4).join(' ')
}
