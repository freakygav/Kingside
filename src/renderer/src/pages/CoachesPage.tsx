import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { formatLine, legalDests, parseUci, uciLineToSan } from '@shared/chessUtil'
import { COACHES, getCoach, type Coach } from '@shared/coach/coaches'
import { explainTopic, formatScore, judgeMove, parseQuestion, positionFacts, type CoachArrow, type CoachMessage, type CoachTopic } from '@shared/coach/explain'
import { normalizeFen, positionProblem } from '@shared/position'
import { winProbability } from '@shared/review'
import { lineCp } from '@shared/strength'
import type { AnalysisLine, BoardTheme, Color } from '@shared/types'
import { Board, type Arrow, type BoardMovable, type Promo } from '../components/Board'
import { Modal } from '../components/Modals'
import { analyzeFen } from '../game/analysisCache'
import { openingFor } from '../game/reviewRunner'
import type { GameRecord } from '../game/session'
import { RichText, useProfile } from '../profile'

interface Props {
  theme: BoardTheme
  showCoords: boolean
  showLegal: boolean
  /** The current (or most recent) game, for "load from current game". */
  currentGame: GameRecord | null
  gameInProgress: boolean
  /** A position handed over from another page (puzzles, review). */
  target: string | null
  onTargetHandled: () => void
}

export function CoachesPage(props: Props) {
  const { profile, send } = useProfile()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (props.target) setOpen(true)
  }, [props.target])
  const selected = getCoach(profile?.coach.selectedId ?? 'beginner')
  if (open) return <Workspace {...props} coach={selected} onBack={() => setOpen(false)} />
  return (
    <main className="page" data-testid="coaches-page">
      <div className="page-head">
        <h1>Coaches</h1>
        <p className="muted">
          Six teaching styles for different playing strengths. Every coach reads the same full-strength Stockfish analysis of the real position —
          the coach level changes how things are explained, never the evaluation.
        </p>
      </div>
      <div className="coach-grid">
        {COACHES.map((c) => (
          <div key={c.id} className={`coach-card${selected.id === c.id ? ' selected' : ''}`} data-coach={c.id}>
            <div className="coach-top">
              <span className="coach-avatar" style={{ background: c.accent }}>{c.initials}</span>
              <div>
                <div className="coach-name">{c.name} <span className="muted">· {c.title}</span></div>
                <div className="coach-elo">Elo {c.elo} · <span className={`diff-pill t${c.tier}`}>{c.difficulty}</span></div>
              </div>
            </div>
            <div className="coach-style"><b>Style:</b> {c.style}</div>
            <p className="coach-desc">{c.description}</p>
            <div className="coach-focus">{c.focus.map((f) => <span key={f} className="ach-chip">{f}</span>)}</div>
            <button
              className={selected.id === c.id ? 'primary-btn' : 'ghost-btn'}
              onClick={async () => {
                await send({ type: 'coachPrefs', prefs: { selectedId: c.id } })
                setOpen(true)
              }}
              data-testid={`select-coach-${c.id}`}
            >
              {selected.id === c.id ? 'Open workspace' : 'Select coach'}
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}

interface ChatItem {
  who: 'user' | 'coach'
  text?: string
  msg?: CoachMessage
  fen: string
}

const START = new Chess().fen()

function Workspace({ coach, onBack, theme, showCoords, showLegal, currentGame, gameInProgress, target, onTargetHandled }: Props & { coach: Coach; onBack: () => void }) {
  const { profile, send } = useProfile()
  const [rootFen, setRootFen] = useState(START)
  const [line, setLine] = useState<{ san: string; uci: string; fen: string }[]>([])
  const [ply, setPly] = useState(0)
  const [orientation, setOrientation] = useState<Color>('w')
  const [lines, setLines] = useState<AnalysisLine[] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [engineErr, setEngineErr] = useState<string | null>(null)
  const [chat, setChat] = useState<ChatItem[]>([])
  const [overlay, setOverlay] = useState<{ arrows: CoachArrow[]; squares: CoachMessage['squares'] } | null>(null)
  const [question, setQuestion] = useState('')
  const [thinking, setThinking] = useState(false)
  const [modal, setModal] = useState<'fen' | 'games' | 'current' | null>(null)
  const [source, setSource] = useState('Starting position')
  const chatRef = useRef<HTMLDivElement>(null)
  const reqId = useRef(0)

  const fen = ply === 0 ? rootFen : line[ply - 1].fen
  const perspective: Color = new Chess(fen).turn()

  const loadPosition = useCallback((f: string, label: string, persp?: Color) => {
    setRootFen(f)
    setLine([])
    setPly(0)
    setOverlay(null)
    setSource(label)
    const turn = new Chess(f).turn()
    setOrientation(persp ?? turn)
    setChat((c) => [...c, { who: 'coach', fen: f, msg: { paragraphs: [`New position loaded: ${label}. ${turn === 'w' ? 'White' : 'Black'} to move. Ask me anything about it.`] } }])
  }, [])

  useEffect(() => {
    if (target) {
      loadPosition(target, 'Position sent from puzzles/review')
      onTargetHandled()
    }
  }, [target, onTargetHandled, loadPosition])

  useEffect(() => {
    setChat([{ who: 'coach', fen: START, msg: { paragraphs: [greeting(coach)] } }])
  }, [coach])

  // Analyse whatever is on the board (latest position wins).
  useEffect(() => {
    const my = ++reqId.current
    setLines(null)
    setEngineErr(null)
    const c = new Chess(fen)
    if (c.isGameOver()) {
      setLines([])
      return
    }
    setAnalyzing(true)
    const t = setTimeout(() => {
      analyzeFen(fen, Math.max(3, Math.min(5, coach.candidates)), 900)
        .then((l) => { if (reqId.current === my) setLines(l) })
        .catch((e: Error) => { if (reqId.current === my) setEngineErr(e.message) })
        .finally(() => { if (reqId.current === my) setAnalyzing(false) })
    }, 200)
    return () => clearTimeout(t)
  }, [fen, coach.candidates])

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat, thinking])

  const chess = useMemo(() => new Chess(fen), [fen])
  const movable: BoardMovable | null = useMemo(() => {
    const map = legalDests(chess)
    return { color: chess.turn(), mode: 'move', dests: (f: Square) => map.get(f) ?? [] }
  }, [chess])
  const onMove = (from: Square, to: Square, promotion?: Promo) => {
    const c = new Chess(fen)
    let m
    try {
      m = c.move({ from, to, promotion })
    } catch {
      return
    }
    const entry = { san: m.san, uci: m.from + m.to + (m.promotion ?? ''), fen: c.fen() }
    setLine((l) => [...l.slice(0, ply), entry])
    setPly(ply + 1)
    setOverlay(null)
  }

  const ask = async (topic: CoachTopic | 'lastMove' | 'move', label: string, moveUci?: string) => {
    setChat((c) => [...c, { who: 'user', text: label, fen }])
    setThinking(true)
    void send({ type: 'coachQuestion' })
    try {
      const cur = await analyzeFen(fen, Math.max(3, Math.min(5, coach.candidates)), 900)
      const opening = openingFor(fenHistory(rootFen, line.slice(0, ply)))
      let msg: CoachMessage
      if (topic === 'lastMove') {
        if (ply === 0) msg = { paragraphs: ['Make a move on the board first, then ask me about it.'] }
        else {
          const before = ply === 1 ? rootFen : line[ply - 2].fen
          const mv = line[ply - 1]
          const bl = await analyzeFen(before, 2, 900)
          msg = judgeMove(before, mv.uci, bl, cur, { perspective: new Chess(before).turn() }, coach)
        }
      } else if (topic === 'move') {
        const legal = moveUci && chess.moves({ verbose: true }).find((m) => m.from + m.to + (m.promotion ?? '') === moveUci)
        if (!legal) msg = { paragraphs: [`I don't see a legal move "${moveUci ?? label}" in this position. ${chess.turn() === 'w' ? 'White' : 'Black'} is to move.`] }
        else {
          const after = new Chess(fen)
          after.move(legal)
          const al = await analyzeFen(after.fen(), 1, 900)
          msg = judgeMove(fen, moveUci!, cur, al, { perspective }, coach)
        }
      } else {
        msg = explainTopic(topic, { fen, lines: cur, opening, perspective }, coach)
      }
      setChat((c) => [...c, { who: 'coach', msg, fen }])
      if (msg.arrows?.length || msg.squares?.length) setOverlay({ arrows: msg.arrows ?? [], squares: msg.squares })
    } catch (e) {
      setChat((c) => [...c, { who: 'coach', fen, msg: { paragraphs: [`I couldn't analyse this position: ${(e as Error).message}`] } }])
    } finally {
      setThinking(false)
    }
  }

  const submitQuestion = () => {
    const q = question.trim()
    if (!q) return
    setQuestion('')
    const parsed = parseQuestion(q, fen)
    void ask(parsed.topic, q, parsed.move)
  }

  const best = lines?.[0]
  const whiteCp = best ? (chess.turn() === 'w' ? lineCp(best) : -lineCp(best)) : null
  const facts = positionFacts(fen)
  const opening = openingFor(fenHistory(rootFen, line.slice(0, ply)))
  const boardArrows: Arrow[] = (overlay?.arrows ?? []).map((a) => ({ from: a.from, to: a.to, color: a.color }))

  const quick: { topic: CoachTopic | 'lastMove'; label: string }[] = [
    { topic: 'thinking', label: 'What should I be thinking about?' },
    { topic: 'candidates', label: 'Show me candidate moves' },
    { topic: 'lastMove', label: 'Was the last move good?' },
    { topic: 'tactics', label: 'Explain the tactics' },
    { topic: 'evaluation', label: "Who's better?" },
    { topic: 'safety', label: 'Are my pieces safe?' },
    { topic: 'opening', label: 'Explain this opening' },
    { topic: 'endgame', label: 'Help with the endgame' }
  ]

  return (
    <main className="stage coach-stage" data-testid="coach-workspace">
      <section className="board-col">
        <div className="coach-board-head">
          <span className="coach-avatar small" style={{ background: coach.accent }}>{coach.initials}</span>
          <b>{coach.name}</b> <span className="muted">· {coach.title} ({coach.elo})</span>
          <span className="muted small src-label">{source}</span>
        </div>
        <div className="board-row">
          <EvalBarMini whiteCp={whiteCp} orientation={orientation} />
          <div className="board-wrap">
            <Board fen={fen} orientation={orientation} movable={movable} onMove={onMove} lastMove={ply > 0 ? uciToMove(line[ply - 1].uci) : null} theme={theme} showCoords={showCoords} showLegal={showLegal} extraArrows={boardArrows} highlights={(overlay?.squares ?? []).map((s) => ({ square: s.square, kind: s.kind }))} annotationKey={fen} />
          </div>
        </div>
        <div className="coach-board-tools">
          <button className="icon-btn" onClick={() => setPly(0)} disabled={ply === 0} title="Back to the loaded position">⏮</button>
          <button className="icon-btn" onClick={() => setPly(Math.max(0, ply - 1))} disabled={ply === 0}>◀</button>
          <button className="icon-btn" onClick={() => setPly(Math.min(line.length, ply + 1))} disabled={ply >= line.length}>▶</button>
          <button className="icon-btn" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} title="Flip board">⇅</button>
          <span className="muted small">{line.length ? formatLine(rootFen, line.map((m) => m.san)) : 'Move pieces for either side to explore.'}</span>
        </div>
      </section>
      <aside className="side-panel coach-panel">
        <div className="panel-head">
          <button className="ghost-btn small" onClick={onBack}>← Coaches</button>
          <div className="row-btns load-btns">
            <button className="ghost-btn small" onClick={() => setModal('current')} disabled={!currentGame || gameInProgress} title={gameInProgress ? 'Finish your game first — use "Coach watching" during play instead' : !currentGame ? 'No game played yet' : ''} data-testid="load-current">Current game</button>
            <button className="ghost-btn small" onClick={() => setModal('games')} disabled={!profile?.games.length}>Previous game</button>
            <button className="ghost-btn small" onClick={() => setModal('fen')} data-testid="load-fen">FEN</button>
            <button className="ghost-btn small" onClick={() => loadPosition(START, 'Starting position')}>Reset</button>
          </div>
        </div>
        <div className="panel-body coach-body">
          <div className="pos-info">
            <span><b>{facts.toMove}</b> to move{facts.check ? ' (in check)' : ''}</span>
            <span>{facts.phase}</span>
            <span>{facts.material}</span>
            {opening && <span title={opening.pgn}><span className="eco">{opening.eco}</span> {opening.name}</span>}
          </div>
          <div className="engine-lines" data-testid="engine-lines">
            {engineErr && <div className="error-text">Engine: {engineErr}</div>}
            {!lines && !engineErr && <div className="muted small">{analyzing ? 'Stockfish is analysing…' : '…'}</div>}
            {lines && lines.length === 0 && <div className="muted small">Game over in this position.</div>}
            {lines?.slice(0, Math.max(1, Math.min(lines.length, coach.candidates))).map((l) => {
              const wcp = chess.turn() === 'w' ? lineCp(l) : -lineCp(l)
              const san = uciLineToSan(fen, l.pv, Math.max(4, coach.pvPlies))
              return (
                <button key={l.multipv} className="engine-line" onClick={() => setOverlay({ arrows: [{ ...uciToMove(l.pv[0]), color: 'best' }], squares: [] })}>
                  <span className="eval-chip">{coach.tier >= 3 ? formatScore(wcp) : verbal(wcp, chess.turn())}</span>
                  <span className="pv">{formatLine(fen, san)}</span>
                </button>
              )
            })}
            {lines && lines[0] && <div className="muted small">depth {lines[0].depth}{coach.tier >= 5 ? ` · expected score for White ${Math.round(winProbability(whiteCp ?? 0) * 100)}%` : ''}</div>}
          </div>
          <div className="chat" ref={chatRef} data-testid="coach-chat">
            {chat.map((m, i) => (
              <div key={i} className={`chat-msg ${m.who}`}>
                {m.who === 'coach' && <span className="coach-avatar tiny" style={{ background: coach.accent }}>{coach.initials}</span>}
                <div className="bubble">
                  {m.text}
                  {m.msg?.paragraphs.map((p, j) => <p key={j}><RichText text={p} /></p>)}
                  {m.msg?.lines?.map((l, j) => <div key={j} className="line"><span className="line-label">{l.label}</span> {l.text}</div>)}
                  {(m.msg?.arrows?.length || m.msg?.squares?.length) && m.fen === fen ? (
                    <button className="link-btn" onClick={() => setOverlay({ arrows: m.msg!.arrows ?? [], squares: m.msg!.squares })}>Show on board</button>
                  ) : null}
                </div>
              </div>
            ))}
            {thinking && <div className="chat-msg coach"><span className="coach-avatar tiny" style={{ background: coach.accent }}>{coach.initials}</span><div className="bubble"><span className="thinking"><i /><i /><i /></span></div></div>}
          </div>
          <div className="quick-chips">
            {quick.map((q) => <button key={q.topic} className="chip" disabled={thinking} onClick={() => void ask(q.topic, q.label)} data-testid={`ask-${q.topic}`}>{q.label}</button>)}
          </div>
          <form className="ask-row" onSubmit={(e) => { e.preventDefault(); submitQuestion() }}>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder='Ask about this position, e.g. "Why is Nf3 good?"' data-testid="coach-input" />
            <button className="primary-btn small" disabled={thinking || !question.trim()}>Ask</button>
          </form>
          <p className="muted small">The coach recognises questions about candidate moves, plans, tactics, safety, evaluation, openings, endgames and specific moves (type the move, e.g. Bxf7+). Answers are built from Stockfish's analysis of this exact position.</p>
        </div>
      </aside>

      {modal === 'fen' && <FenModal onClose={() => setModal(null)} onLoad={(f) => { loadPosition(f, 'Imported FEN'); setModal(null) }} />}
      {modal === 'current' && currentGame && (
        <GamePicker title="Current game" games={[{ label: 'This game', record: currentGame }]} onClose={() => setModal(null)} onPick={(f, l, c) => { loadPosition(f, l, c); setModal(null) }} />
      )}
      {modal === 'games' && profile && (
        <GamePicker title="Previous games" games={profile.games.slice(0, 30).map((g) => ({ label: `${g.date.slice(0, 10)} · ${g.result} vs ${g.botElo ? '~' + g.botElo : 'full strength'} · ${g.moves.length} plies`, record: summaryToRecord(g) }))} onClose={() => setModal(null)} onPick={(f, l, c) => { loadPosition(f, l, c); setModal(null) }} />
      )}
    </main>
  )
}

function greeting(c: Coach): string {
  switch (c.tier) {
    case 1: return `Hi, I'm ${c.name}! Set up a position or load one of your games, then ask me anything. I'll keep it simple.`
    case 2: return `Hi, I'm ${c.name}. Let's look at tactics and good opening habits. Load a position or play some moves on the board.`
    case 3: return `I'm ${c.name}. We'll work through candidate moves and plans. Load a position to begin.`
    case 4: return `${c.name} here. Let's discuss plans, structures and concrete sequences. Load a position.`
    case 5: return `${c.name}. I'll give you precise evaluations and variations. Load a position.`
    default: return `${c.name}. Expect detailed variations and fine positional distinctions. Load a position to begin.`
  }
}

function verbal(wcp: number, turn: Color): string {
  const cp = turn === 'w' ? wcp : -wcp
  const ep = winProbability(cp)
  return ep >= 0.7 ? 'good' : ep >= 0.55 ? 'ok+' : ep > 0.45 ? 'equal' : ep > 0.3 ? 'ok−' : 'bad'
}

function uciToMove(u: string): { from: Square; to: Square } {
  const m = parseUci(u)!
  return { from: m.from, to: m.to }
}

function fenHistory(root: string, line: { fen: string }[]): string[] {
  return [root, ...line.map((l) => l.fen)]
}

function EvalBarMini({ whiteCp, orientation }: { whiteCp: number | null; orientation: Color }) {
  const share = whiteCp === null ? 0.5 : winProbability(whiteCp)
  return (
    <div className={`eval-bar${orientation === 'w' ? '' : ' flipped'}`}>
      <div className="eval-white" style={{ height: `${share * 100}%` }} />
      <span className={`eval-text ${share >= 0.5 ? 'white-adv' : 'black-adv'}`}>{whiteCp === null ? '' : formatScore(whiteCp).replace('+', '')}</span>
    </div>
  )
}

function FenModal({ onClose, onLoad }: { onClose: () => void; onLoad: (fen: string) => void }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  return (
    <Modal title="Import a position (FEN)" onClose={onClose}>
      <textarea className="fen-input" value={text} onChange={(e) => { setText(e.target.value); setErr(null) }} placeholder="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1" data-testid="fen-text" />
      {err && <p className="error-text" data-testid="fen-error">{err}</p>}
      <div className="row-btns">
        <button className="primary-btn" onClick={() => {
          const problem = positionProblem(text)
          if (problem) setErr(problem)
          else onLoad(normalizeFen(text))
        }} data-testid="fen-load">Load position</button>
        <button className="ghost-btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

function summaryToRecord(g: { startFen: string; moves: string[]; playerColor: Color; levelId: string; date: string; id: string }): GameRecord {
  const c = new Chess(g.startFen || undefined)
  const fens = [c.fen()]
  const moves = g.moves.map((u) => {
    const color = c.turn()
    const m = c.move(parseUci(u)!)
    fens.push(c.fen())
    return { san: m.san, uci: u, from: m.from, to: m.to, color, captured: !!m.captured, castle: false, check: c.inCheck(), clockAfter: 0 }
  })
  return { id: g.id, levelId: g.levelId, playerColor: g.playerColor, startFen: fens[0], moves, fens, result: null, date: g.date }
}

function GamePicker({ title, games, onClose, onPick }: { title: string; games: { label: string; record: GameRecord }[]; onClose: () => void; onPick: (fen: string, label: string, perspective: Color) => void }) {
  const [sel, setSel] = useState(0)
  const g = games[sel]?.record
  return (
    <Modal title={title} onClose={onClose} wide>
      {games.length > 1 && (
        <select className="game-select" value={sel} onChange={(e) => setSel(Number(e.target.value))}>
          {games.map((x, i) => <option key={i} value={i}>{x.label}</option>)}
        </select>
      )}
      {g && (
        <>
          <p className="muted small">Click a move to load the position after it (or the start).</p>
          <div className="pick-moves">
            <button className="mv" onClick={() => onPick(g.fens[0], 'Game start', g.playerColor)}>Start</button>
            {g.moves.map((m, i) => (
              <button key={i} className="mv" onClick={() => onPick(g.fens[i + 1], `After ${Math.floor(i / 2) + 1}${m.color === 'w' ? '.' : '...'} ${m.san}`, g.playerColor)}>
                {m.color === 'w' ? `${Math.floor(i / 2) + 1}. ` : ''}{m.san}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}
