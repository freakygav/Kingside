import { useEffect, useMemo, useRef } from 'react'
import { COACHES, getCoach } from '@shared/coach/coaches'
import { buildCoachReport } from '@shared/coach/report'
import { getLesson } from '@shared/lessons'
import type { OpeningMatch } from '@shared/openings'
import { PUZZLE_CATEGORIES } from '@shared/puzzles'
import { CLASS_LABEL, type PositionAnalysis, type ReviewResult } from '@shared/review'
import type { GameRecord } from '../game/session'
import type { Color } from '@shared/types'
import { RichText, useProfile } from '../profile'
import { ClassIcon } from './ClassIcon'

interface Props {
  record: GameRecord
  /** Side being reviewed (defaults to the side you played). */
  perspective?: Color
  review: ReviewResult | null
  positions: PositionAnalysis[] | null
  bookPlies: number
  opening: OpeningMatch | null
  progress: { done: number; total: number }
  onJump: (ply: number) => void
  onOpenLesson: (id: string) => void
  onOpenPuzzles: (category: string) => void
  onAnalyze: (fen: string) => void
}

/** A coach's written review of a finished game, built from the verified engine analysis. */
export function CoachReview({ record, perspective, review, positions, bookPlies, opening, progress, onJump, onOpenLesson, onOpenPuzzles, onAnalyze }: Props) {
  const { profile, send } = useProfile()
  const coach = getCoach(profile?.coach.selectedId ?? 'beginner')
  const sentFor = useRef<string | null>(null)

  const report = useMemo(() => {
    if (!review || !positions || positions.length !== record.moves.length + 1) return null
    const side = perspective ?? record.playerColor
    const r = record.result
    const result = !r || r.reason === 'abort' ? 'unfinished' : r.winner === null ? 'draw' : r.winner === side ? 'win' : 'loss'
    const history = (profile?.games ?? []).filter((g) => g.id !== record.id && g.reviewed).slice(0, 10).map((g) => g.mistakeTags)
    return buildCoachReport({ moves: record.moves, positions, review, playerColor: side, result, opening, bookPlies, history }, coach)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, positions, record, coach.id, opening, bookPlies, perspective])

  // Record the review once per game (XP + mistake tags for the improvement plan).
  useEffect(() => {
    if (!report || !review || sentFor.current === record.id) return
    if (!profile?.games.some((g) => g.id === record.id)) return
    sentFor.current = record.id
    void send({ type: 'gameReviewed', gameId: record.id, accuracy: review.accuracy[record.playerColor], mistakeTags: report.tags })
  }, [report, review, record, profile, send])

  return (
    <div className="panel-body review-body coach-review" data-testid="coach-review">
      <div className="coach-pick">
        {COACHES.map((c) => (
          <button key={c.id} className={`coach-avatar pick${c.id === coach.id ? ' on' : ''}`} style={{ background: c.accent }} title={`${c.name} — ${c.title} (${c.elo})`} onClick={() => void send({ type: 'coachPrefs', prefs: { selectedId: c.id } })}>
            {c.initials}
          </button>
        ))}
        <span className="muted small">{coach.name}, {coach.title} ({coach.elo})</span>
      </div>
      {!report ? (
        <div className="progress">
          <div className="progress-label">{coach.name} is waiting for the engine analysis… {progress.done}/{progress.total}</div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
        </div>
      ) : (
        <>
          <section className="cr-section">
            <h3>Overall</h3>
            {report.summary.map((p, i) => <p key={i}>{p}</p>)}
          </section>
          <section className="cr-section">
            <h3>By phase</h3>
            <div className="phase-grid">
              {report.phases.map((ph) => (
                <div key={ph.phase} className={`phase-card g-${ph.grade.replace(' ', '-').toLowerCase()}`}>
                  <div className="phase-top"><b>{ph.title}</b><span className="grade">{ph.grade}</span></div>
                  <p className="small">{ph.text}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="cr-section">
            <h3>Tactics</h3>
            {report.tactics.map((p, i) => <p key={i}>{p}</p>)}
          </section>
          <section className="cr-section">
            <h3>Key moments</h3>
            {report.moments.length === 0 && <p className="muted">No standout moments — a steady game.</p>}
            {report.moments.map((m) => (
              <div key={m.ply} className={`moment ${m.kind}`} data-testid="coach-moment">
                <button className="moment-head" onClick={() => onJump(m.ply + 1)}>
                  {m.judgement.cls && <ClassIcon cls={m.judgement.cls} size={18} />}
                  <b>{m.title}</b>
                  <span className="muted small">{m.kind === 'best' ? 'Best moment' : m.kind === 'missed' ? 'Missed opportunity' : m.judgement.cls ? CLASS_LABEL[m.judgement.cls] : ''}</span>
                </button>
                {m.judgement.paragraphs.slice(1).map((p, i) => <p key={i}><RichText text={p} /></p>)}
                {m.judgement.lines?.map((l, i) => <div key={i} className="line"><span className="line-label">{l.label}</span> {l.text}</div>)}
                <button className="link-btn" onClick={() => onAnalyze(record.fens[m.ply])}>Discuss this position with {coach.name}</button>
              </div>
            ))}
          </section>
          <section className="cr-section">
            <h3>Your improvement plan</h3>
            {report.plan.map((p) => (
              <div key={p.tag} className="plan-item" data-testid="plan-item">
                <b>{p.label}</b>
                <p>{p.text}</p>
                <div className="row-btns">
                  {p.lessons.map((id) => {
                    const l = getLesson(id)
                    return l ? <button key={id} className="ghost-btn small" onClick={() => onOpenLesson(id)}>📘 {l.title}</button> : null
                  })}
                  {p.puzzles.map((c) => {
                    const cat = PUZZLE_CATEGORIES.find((x) => x.id === c)
                    return cat ? <button key={c} className="ghost-btn small" onClick={() => onOpenPuzzles(c)}>🧩 {cat.name} puzzles</button> : null
                  })}
                </div>
              </div>
            ))}
          </section>
          <p className="muted small">Based on Stockfish's analysis of every position in this game{profile?.games.some((g) => g.reviewed && g.id !== record.id) ? ' and the mistakes found in your earlier reviewed games' : ''}.</p>
        </>
      )}
    </div>
  )
}
