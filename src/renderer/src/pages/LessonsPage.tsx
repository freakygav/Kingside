import { useEffect, useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { analyzeMove } from '@shared/coach/motifs'
import { legalDests, parseUci } from '@shared/chessUtil'
import { gradedSteps, isLevelUnlocked, LESSONS, LEVEL_LABEL, lessonsByLevel, squareAnswer, UNLOCK_REQUIREMENT, type Lesson, type LessonLevel, type LessonStep, type MoveExercise, type SquareExercise } from '@shared/lessons'
import { ACHIEVEMENTS, learningStreak, levelFromXp, type LessonProgress } from '@shared/progress'
import type { BoardTheme, Color } from '@shared/types'
import { Board, type Arrow, type BoardMovable, type Promo } from '../components/Board'
import { RichText, useProfile } from '../profile'
import { sounds } from '../game/sound'

const LEVELS: LessonLevel[] = ['beginner', 'intermediate', 'advanced']

interface Props {
  theme: BoardTheme
  showCoords: boolean
  /** Lesson to open immediately (from a coach recommendation). */
  target: string | null
  onTargetHandled: () => void
}

export function LessonsPage({ theme, showCoords, target, onTargetHandled }: Props) {
  const { profile, send } = useProfile()
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    if (target) {
      setActive(target)
      onTargetHandled()
    }
  }, [target, onTargetHandled])

  if (!profile) return <main className="page"><div className="page-loading">Loading progress…</div></main>
  const completed = new Set(Object.entries(profile.lessons).filter(([, l]) => l.status === 'completed').map(([id]) => id))
  const unlocked = (lv: LessonLevel) => isLevelUnlocked(lv, completed, profile.lessonUnlocks)
  const lesson = active ? LESSONS.find((l) => l.id === active) : null

  if (lesson) return <LessonPlayer key={lesson.id} lesson={lesson} progress={profile.lessons[lesson.id]} theme={theme} showCoords={showCoords} onExit={() => setActive(null)} onOpen={setActive} />

  // Recommended next lesson: most recently touched unfinished one, else first unfinished unlocked one.
  const inProgress = Object.entries(profile.lessons).filter(([, l]) => l.status === 'in-progress').sort((a, b) => b[1].updatedAt - a[1].updatedAt)
  const nextFresh = LESSONS.find((l) => !completed.has(l.id) && unlocked(l.level))
  const recommended = inProgress[0] ? LESSONS.find((l) => l.id === inProgress[0][0]) : nextFresh
  const currentLevel = [...LEVELS].reverse().find((lv) => unlocked(lv) && lessonsByLevel(lv).some((l) => !completed.has(l.id))) ?? 'advanced'
  const lvl = levelFromXp(profile.xp)
  const streak = learningStreak(profile.activityDays, Date.now())
  const earned = ACHIEVEMENTS.filter((a) => profile.achievements[a.id]).sort((a, b) => profile.achievements[b.id] - profile.achievements[a.id])

  return (
    <main className="page" data-testid="lessons-page">
      <div className="page-head">
        <h1>Lessons</h1>
        <p className="muted">Interactive lessons from the rules to advanced endgames. Every position is legal and every solution is checked with Stockfish.</p>
      </div>
      <div className="dash-grid">
        <div className="stat-card">
          <span className="stat-label">Lessons completed</span>
          <span className="stat-value">{completed.size}<small>/{LESSONS.length}</small></span>
          <span className="meter"><i style={{ width: `${(completed.size / LESSONS.length) * 100}%` }} /></span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Current learning level</span>
          <span className="stat-value">{LEVEL_LABEL[currentLevel]}</span>
          <span className="muted small">{lessonsByLevel(currentLevel).filter((l) => completed.has(l.id)).length}/{lessonsByLevel(currentLevel).length} done in this track</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total XP</span>
          <span className="stat-value">{profile.xp}</span>
          <span className="muted small">Level {lvl.level} · {lvl.span - lvl.into} XP to next</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Learning streak</span>
          <span className="stat-value">{streak}<small> day{streak === 1 ? '' : 's'}</small></span>
          <span className="muted small">{streak ? 'Train today to keep it going' : 'Complete any lesson or puzzle to start one'}</span>
        </div>
        <div className="stat-card recommend">
          <span className="stat-label">Recommended next</span>
          {recommended ? (
            <>
              <span className="rec-title">{recommended.icon} {recommended.title}</span>
              <button className="primary-btn" onClick={() => setActive(recommended.id)} data-testid="lesson-recommended">
                {profile.lessons[recommended.id]?.status === 'in-progress' ? 'Resume' : 'Start'}
              </button>
            </>
          ) : (
            <span className="rec-title">All lessons completed — revisit any of them!</span>
          )}
        </div>
      </div>
      {earned.length > 0 && (
        <div className="milestones">
          {earned.slice(0, 6).map((a) => <span key={a.id} className="ach-chip" title={a.description}>🏆 {a.name}</span>)}
        </div>
      )}

      {LEVELS.map((lv) => {
        const open = unlocked(lv)
        const list = lessonsByLevel(lv)
        return (
          <section key={lv} className="lesson-track">
            <div className="track-head">
              <h2>{LEVEL_LABEL[lv]} <DifficultyDots level={lv} /></h2>
              <span className="muted small">{list.filter((l) => completed.has(l.id)).length}/{list.length} completed</span>
              {!open && lv !== 'beginner' && (
                <span className="locked-note">
                  🔒 Complete {UNLOCK_REQUIREMENT[lv]} {lv === 'intermediate' ? 'beginner' : 'intermediate'} lessons to unlock —
                  <button className="link-btn" onClick={() => void send({ type: 'unlockLevel', level: lv })}> or skip ahead</button>
                </span>
              )}
            </div>
            <div className="lesson-grid">
              {list.map((l) => (
                <LessonCard key={l.id} lesson={l} progress={profile.lessons[l.id]} locked={!open} onOpen={() => setActive(l.id)} />
              ))}
            </div>
          </section>
        )
      })}
    </main>
  )
}

function DifficultyDots({ level }: { level: LessonLevel }) {
  const n = level === 'beginner' ? 1 : level === 'intermediate' ? 2 : 3
  return <span className={`diff-dots lv-${level}`} title={LEVEL_LABEL[level]}>{[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</span>
}

function LessonCard({ lesson, progress, locked, onOpen }: { lesson: Lesson; progress?: LessonProgress; locked: boolean; onOpen: () => void }) {
  const status = progress?.status
  return (
    <button className={`lesson-card${locked ? ' locked' : ''}${status === 'completed' ? ' done' : ''}`} disabled={locked} onClick={onOpen} data-lesson={lesson.id}>
      <span className="lesson-icon">{lesson.icon}</span>
      <span className="lesson-body">
        <span className="lesson-title">{lesson.title}</span>
        <span className="lesson-sum">{lesson.summary}</span>
      </span>
      <span className="lesson-status">
        {locked ? '🔒' : status === 'completed' ? <span className="lbadge ok">✓ {progress!.bestAccuracy}%</span> : status === 'in-progress' ? <span className="lbadge prog">Step {progress!.step + 1}/{lesson.steps.length}</span> : <span className="lbadge new">New</span>}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------------------------

interface StepState {
  done: boolean
  correct: boolean
  attempts: number
}

function LessonPlayer({ lesson, progress, theme, showCoords, onExit, onOpen }: { lesson: Lesson; progress?: LessonProgress; theme: BoardTheme; showCoords: boolean; onExit: () => void; onOpen: (id: string) => void }) {
  const { send } = useProfile()
  const resumeAt = progress?.status === 'in-progress' ? Math.min(progress.step, lesson.steps.length - 1) : 0
  const [idx, setIdx] = useState(resumeAt)
  const [states, setStates] = useState<Record<number, StepState>>(() => {
    const init: Record<number, StepState> = {}
    if (progress?.status === 'in-progress') for (const [k, r] of Object.entries(progress.results)) init[Number(k)] = { done: true, correct: r.correct, attempts: r.attempts }
    for (let i = 0; i < resumeAt; i++) init[i] = init[i] ?? { done: true, correct: true, attempts: 0 }
    return init
  })
  const [finished, setFinished] = useState<{ accuracy: number; xp: number } | null>(null)
  const step = lesson.steps[idx]
  const graded = gradedSteps(lesson)
  const st = states[idx]
  const canNext = step.kind === 'concept' || step.kind === 'demo' || !!st?.done

  const record = (s: StepState) => {
    setStates((x) => ({ ...x, [idx]: s }))
    if (s.done) void send({ type: 'lessonStep', lessonId: lesson.id, step: idx + 1, result: { key: String(idx), correct: s.correct, attempts: s.attempts } })
  }

  const next = async () => {
    if (idx < lesson.steps.length - 1) {
      setIdx(idx + 1)
      if (step.kind === 'concept' || step.kind === 'demo') void send({ type: 'lessonStep', lessonId: lesson.id, step: idx + 1 })
      return
    }
    const correct = graded.filter((i) => states[i]?.correct).length
    const accuracy = graded.length ? Math.round((correct / graded.length) * 100) : 100
    const out = await send({ type: 'lessonComplete', lessonId: lesson.id, level: lesson.level, accuracy })
    sounds.end()
    setFinished({ accuracy, xp: out?.xpGained ?? 0 })
  }

  if (finished) {
    const i = LESSONS.findIndex((l) => l.id === lesson.id)
    const following = LESSONS[i + 1]
    return (
      <main className="page lesson-done" data-testid="lesson-complete">
        <div className="done-card">
          <div className="done-icon">{lesson.icon}</div>
          <h1>Lesson complete!</h1>
          <p className="muted">{lesson.title}</p>
          <div className="done-stats">
            <div><b>{finished.accuracy}%</b><span>accuracy</span></div>
            <div><b>+{finished.xp}</b><span>XP</span></div>
          </div>
          <div className="row-btns">
            {following && <button className="primary-btn" onClick={() => onOpen(following.id)}>Next: {following.title}</button>}
            <button className="ghost-btn" onClick={onExit}>Back to lessons</button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="stage lesson-stage" data-testid="lesson-player">
      <section className="board-col">
        <StepBoard key={idx} step={step} theme={theme} showCoords={showCoords} state={st} onResult={record} />
      </section>
      <aside className="side-panel">
        <div className="panel-head">
          <button className="ghost-btn small" onClick={onExit}>← Lessons</button>
          <span className={`level-tag lv-${lesson.level}`}>{LEVEL_LABEL[lesson.level]}</span>
        </div>
        <div className="panel-body">
          <h2 className="panel-title">{lesson.icon} {lesson.title}</h2>
          <div className="step-dots">
            {lesson.steps.map((s, i) => (
              <button key={i} className={`step-dot ${s.kind}${i === idx ? ' current' : ''}${states[i]?.done ? (states[i].correct ? ' ok' : ' miss') : ''}`} disabled={i > idx} onClick={() => i <= idx && setIdx(i)} title={stepLabel(s)} />
            ))}
          </div>
          <StepPanel key={idx} step={step} state={st} onResult={record} />
          <div className="row-btns step-nav">
            <button className="ghost-btn" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Back</button>
            <button className="primary-btn" disabled={!canNext} onClick={() => void next()} data-testid="lesson-next">
              {idx === lesson.steps.length - 1 ? 'Finish lesson' : 'Next'}
            </button>
          </div>
        </div>
      </aside>
    </main>
  )
}

function stepLabel(s: LessonStep): string {
  return s.kind === 'concept' ? 'Explanation' : s.kind === 'demo' ? 'Demonstration' : s.kind === 'exercise' ? 'Your move' : s.kind === 'squares' ? 'Find the square' : 'Knowledge check'
}

function toArrows(list?: string[]): Arrow[] {
  return (list ?? []).map((a) => ({ from: a.slice(0, 2) as Square, to: a.slice(2, 4) as Square, color: 'alt' as const }))
}

// Shared mutable channel between the board half and the panel half of an exercise.
type ExerciseBus = { feedback: { ok: boolean; text: string } | null; hint: boolean; revealed: boolean; ply: number }
const busListeners = new Set<() => void>()
const bus: ExerciseBus = { feedback: null, hint: false, revealed: false, ply: 0 }
function setBus(p: Partial<ExerciseBus>) {
  Object.assign(bus, p)
  for (const l of busListeners) l()
}
function useBus(): ExerciseBus {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    busListeners.add(l)
    return () => {
      busListeners.delete(l)
    }
  }, [])
  return bus
}

function StepBoard({ step, theme, showCoords, state, onResult }: { step: LessonStep; theme: BoardTheme; showCoords: boolean; state?: StepState; onResult: (s: StepState) => void }) {
  useEffect(() => setBus({ feedback: null, hint: false, revealed: false, ply: 0 }), [])
  if (step.kind === 'concept') return <Board fen={step.fen} orientation={step.orientation ?? 'w'} movable={null} theme={theme} showCoords={showCoords} extraArrows={toArrows(step.arrows)} highlights={(step.squares ?? []).map((s) => ({ square: s, kind: 'focus' as const }))} />
  if (step.kind === 'demo') return <DemoBoard step={step} theme={theme} showCoords={showCoords} />
  if (step.kind === 'exercise') return <ExerciseBoard step={step} theme={theme} showCoords={showCoords} state={state} onResult={onResult} />
  if (step.kind === 'squares') return <SquaresBoard step={step} theme={theme} showCoords={showCoords} state={state} onResult={onResult} />
  return step.fen ? <Board fen={step.fen} orientation={step.orientation ?? 'w'} movable={null} theme={theme} showCoords={showCoords} /> : <QuizArt />
}

function QuizArt() {
  return <div className="quiz-art"><span>?</span><p>Knowledge check</p></div>
}

// Demo state is shared between board and panel via a tiny store as well.
const demo = { ply: 0 }
const demoListeners = new Set<() => void>()
function setDemo(p: number) {
  demo.ply = p
  for (const l of demoListeners) l()
}
function useDemo() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    demoListeners.add(l)
    return () => {
      demoListeners.delete(l)
    }
  }, [])
  return demo
}

function DemoBoard({ step, theme, showCoords }: { step: Extract<LessonStep, { kind: 'demo' }>; theme: BoardTheme; showCoords: boolean }) {
  useEffect(() => setDemo(0), [step])
  const d = useDemo()
  const { fen, last } = useMemo(() => {
    const c = new Chess(step.fen)
    let lm: { from: Square; to: Square } | null = null
    for (const m of step.moves.slice(0, d.ply)) {
      const mv = c.move(m.san)
      lm = { from: mv.from, to: mv.to }
    }
    return { fen: c.fen(), last: lm }
  }, [step, d.ply])
  return <Board fen={fen} orientation={step.orientation ?? 'w'} movable={null} theme={theme} showCoords={showCoords} lastMove={last} extraArrows={d.ply === 0 ? toArrows(step.arrows) : []} />
}

function ExerciseBoard({ step, theme, showCoords, state, onResult }: { step: MoveExercise; theme: BoardTheme; showCoords: boolean; state?: StepState; onResult: (s: StepState) => void }) {
  const b = useBus()
  const userColor: Color = new Chess(step.fen).turn()
  const [chess, setChess] = useState(() => new Chess(step.fen))
  const [last, setLast] = useState<{ from: Square; to: Square } | null>(null)
  const [, setVer] = useState(0)
  const [busy, setBusy] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const ply = b.ply
  const solved = ply >= step.solution.length || !!state?.done

  // Reveal: play the remaining solution.
  useEffect(() => {
    if (!b.revealed) return
    const c = new Chess(step.fen)
    let lm = null
    for (const san of step.solution) {
      const m = c.move(san)
      lm = { from: m.from, to: m.to }
    }
    setChess(c)
    setLast(lm)
    setBus({ ply: step.solution.length })
  }, [b.revealed, step])

  const movable: BoardMovable | null = useMemo(() => {
    if (solved || busy || chess.turn() !== userColor) return null
    const map = legalDests(chess)
    return { color: userColor, mode: 'move', dests: (f: Square) => map.get(f) ?? [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chess, solved, busy, ply])

  const onMove = (from: Square, to: Square, promotion?: Promo) => {
    const probe = new Chess(chess.fen())
    let mv
    try {
      mv = probe.move({ from, to, promotion })
    } catch {
      return
    }
    const expected = step.solution[ply]
    const alts = step.alt?.[ply] ?? []
    const isLast = ply === step.solution.length - 1
    const ok = mv.san === expected || alts.includes(mv.san) || (step.goal === 'mate' && isLast && probe.isCheckmate())
    if (!ok) {
      setAttempts((a) => a + 1)
      sounds.illegal()
      setBus({ feedback: { ok: false, text: wrongText(step, chess.fen(), mv.san, mv.from + mv.to + (mv.promotion ?? '')) } })
      return
    }
    sounds.move()
    setChess(probe)
    setLast({ from: mv.from, to: mv.to })
    const nextPly = ply + 1
    if (nextPly >= step.solution.length || (step.goal === 'mate' && probe.isCheckmate())) {
      setBus({ ply: step.solution.length, feedback: { ok: true, text: step.success } })
      onResult({ done: true, correct: attempts === 0 && !b.hint, attempts: attempts + 1 })
      return
    }
    setBus({ ply: nextPly, feedback: { ok: true, text: `Good move! ${mv.san}.` } })
    setBusy(true)
    setTimeout(() => {
      const reply = new Chess(probe.fen())
      const r = reply.move(step.solution[nextPly])
      setChess(reply)
      setLast({ from: r.from, to: r.to })
      setBusy(false)
      setVer((v) => v + 1)
      setBus({ ply: nextPly + 1, feedback: { ok: true, text: `${r.san} — your move again.` } })
    }, 550)
  }

  const hintSquares = b.hint && !solved ? [{ square: hintFrom(chess.fen(), step.solution[ply]), kind: 'hint' as const }] : []
  return (
    <Board
      fen={chess.fen()}
      orientation={step.orientation ?? userColor}
      movable={movable}
      onMove={onMove}
      lastMove={last}
      theme={theme}
      showCoords={showCoords}
      extraArrows={ply === 0 && !b.feedback ? toArrows(step.arrows) : []}
      highlights={[...(ply === 0 ? (step.squares ?? []).map((s) => ({ square: s, kind: 'focus' as const })) : []), ...hintSquares]}
    />
  )
}

function hintFrom(fen: string, san: string | undefined): string {
  if (!san) return 'a1'
  const c = new Chess(fen)
  try {
    return c.move(san).from
  } catch {
    return 'a1'
  }
}

/** Why a lesson move is wrong: authored explanation first, otherwise facts about the move. */
function wrongText(step: MoveExercise, fen: string, san: string, uci: string): string {
  if (step.wrong?.[san]) return step.wrong[san]
  const f = analyzeMove(fen, uci)
  const hang = f?.motifs.find((m) => m.kind === 'hangsPiece')
  const after = new Chess(fen)
  after.move(parseUci(uci)!)
  if (step.goal === 'mate' && !after.isCheckmate()) return `${san} is not checkmate — the king can still escape or the check can be answered. Try again.`
  if (hang) return `${san} ${hang.text}, and it doesn't solve the task. Try again.`
  return `${san} is legal, but it isn't the idea of this exercise. Try again${step.hint ? ' — use the hint if you need it' : ''}.`
}

function SquaresBoard({ step, theme, showCoords, state, onResult }: { step: SquareExercise; theme: BoardTheme; showCoords: boolean; state?: StepState; onResult: (s: StepState) => void }) {
  const b = useBus()
  const [picked, setPicked] = useState<{ sq: string; ok: boolean }[]>([])
  const [attempts, setAttempts] = useState(0)
  const answer = useMemo(() => new Set(squareAnswer(step.fen, step.check)), [step])
  const onClick = (sq: Square) => {
    if (state?.done) return
    const ok = answer.has(sq)
    setPicked((p) => [...p, { sq, ok }])
    if (ok) {
      sounds.move()
      setBus({ feedback: { ok: true, text: step.success } })
      onResult({ done: true, correct: attempts === 0 && !b.hint, attempts: attempts + 1 })
    } else {
      setAttempts((a) => a + 1)
      sounds.illegal()
      setBus({ feedback: { ok: false, text: `${sq} is not it. ${step.hint}` } })
    }
  }
  const shown = state?.done && picked.length === 0 ? [...answer].map((sq) => ({ sq, ok: true })) : picked
  return (
    <Board fen={step.fen} orientation={step.orientation ?? 'w'} movable={null} theme={theme} showCoords={showCoords} onSquareClick={onClick}
      highlights={shown.map((p) => ({ square: p.sq, kind: p.ok ? 'good' as const : 'bad' as const }))} />
  )
}

function StepPanel({ step, state, onResult }: { step: LessonStep; state?: StepState; onResult: (s: StepState) => void }) {
  const b = useBus()
  const d = useDemo()
  const [choice, setChoice] = useState<number | null>(state?.done && step.kind === 'quiz' ? (state.correct ? step.answer : -1) : null)

  if (step.kind === 'concept')
    return (
      <div className="step-card">
        <div className="step-kind">Explanation</div>
        <h3>{step.title}</h3>
        {step.body.map((p, i) => <p key={i}><RichText text={p} /></p>)}
      </div>
    )
  if (step.kind === 'demo') {
    const cur = d.ply > 0 ? step.moves[d.ply - 1] : null
    return (
      <div className="step-card">
        <div className="step-kind">Demonstration</div>
        <h3>{step.title}</h3>
        <p>{step.intro}</p>
        <div className="demo-moves">
          {step.moves.map((m, i) => (
            <button key={i} className={`demo-move${i < d.ply ? ' played' : ''}${i === d.ply - 1 ? ' current' : ''}`} onClick={() => setDemo(i + 1)}>{m.san}</button>
          ))}
        </div>
        <div className="demo-note">{cur ? <><b>{cur.san}</b> — {cur.note}</> : 'Press ▶ to step through the moves.'}</div>
        <div className="row-btns">
          <button className="icon-btn" onClick={() => setDemo(0)} disabled={d.ply === 0}>⏮</button>
          <button className="icon-btn" onClick={() => setDemo(Math.max(0, d.ply - 1))} disabled={d.ply === 0}>◀</button>
          <button className="icon-btn" onClick={() => setDemo(Math.min(step.moves.length, d.ply + 1))} disabled={d.ply >= step.moves.length} data-testid="demo-next">▶</button>
        </div>
      </div>
    )
  }
  if (step.kind === 'exercise' || step.kind === 'squares') {
    const side = step.kind === 'exercise' ? (new Chess(step.fen).turn() === 'w' ? 'White' : 'Black') : null
    return (
      <div className="step-card">
        <div className="step-kind">{step.kind === 'exercise' ? `Your move${side ? ` · ${side} to play` : ''}` : 'Find the square'}</div>
        <h3>{step.title}</h3>
        <p>{step.prompt}</p>
        {b.feedback && <div className={`feedback ${b.feedback.ok ? 'ok' : 'bad'}`} data-testid="lesson-feedback">{b.feedback.ok ? '✓ ' : '✗ '}{b.feedback.text}</div>}
        {!state?.done && (
          <div className="row-btns">
            <button className="ghost-btn small" onClick={() => setBus({ hint: true, feedback: { ok: true, text: `Hint: ${step.hint}` } })}>💡 Hint</button>
            {step.kind === 'exercise' && (
              <button className="ghost-btn small" onClick={() => { setBus({ revealed: true, feedback: { ok: false, text: `Solution: ${step.solution.join(' ')}. ${step.success}` } }); onResult({ done: true, correct: false, attempts: 0 }) }}>
                Show solution
              </button>
            )}
          </div>
        )}
        {state?.done && !b.feedback && <div className="feedback ok">✓ Completed</div>}
      </div>
    )
  }
  // quiz
  return (
    <div className="step-card">
      <div className="step-kind">Knowledge check</div>
      <h3>{step.question}</h3>
      <div className="quiz-options">
        {step.options.map((o, i) => (
          <button
            key={i}
            className={`quiz-opt${choice !== null && i === step.answer ? ' right' : ''}${choice === i && i !== step.answer ? ' wrong' : ''}`}
            disabled={choice !== null}
            onClick={() => {
              setChoice(i)
              onResult({ done: true, correct: i === step.answer, attempts: 1 })
              if (i === step.answer) sounds.move()
              else sounds.illegal()
            }}
          >
            {o}
          </button>
        ))}
      </div>
      {choice !== null && <div className={`feedback ${choice === step.answer ? 'ok' : 'bad'}`}>{choice === step.answer ? '✓ Correct. ' : '✗ Not quite. '}{step.explanation}</div>}
    </div>
  )
}
