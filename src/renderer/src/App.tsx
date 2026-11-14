import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Chess, type Square } from 'chess.js'
import { legalDests } from '@shared/chessUtil'
import { premoveDests } from '@shared/premove'
import { DEFAULT_LEVEL_ID, getLevel, levelLabel, LEVELS } from '@shared/strength'
import { DEFAULT_SETTINGS, type Color, type EngineStatus, type Settings } from '@shared/types'
import { Board, type BoardMovable, type Promo } from './components/Board'
import { AboutModal, SettingsModal } from './components/Modals'
import { MoveList, NavControls } from './components/MoveList'
import { NewGamePanel } from './components/NewGamePanel'
import { PlayerBar } from './components/PlayerBar'
import { ReviewView } from './components/ReviewView'
import { openingFor } from './game/reviewRunner'
import { clearSaved, GameSession, interactionMode, resultText, type GameRecord } from './game/session'
import { setSoundEnabled } from './game/sound'
import { CoachWatch, type WatchItem } from './components/CoachWatch'
import { CoachesPage } from './pages/CoachesPage'
import { LessonsPage } from './pages/LessonsPage'
import { ProfilePage } from './pages/ProfilePage'
import { PuzzlesPage } from './pages/PuzzlesPage'
import { ProfileProvider, useProfile } from './profile'
import { AppearancePage } from './pages/AppearancePage'
import { applyAppearanceGlobals, BackgroundLayer } from './appearance'
import { ImportPage } from './pages/ImportPage'
import { analysisSummary, recordFromStored } from './game/library'
import { userColorOf, type StoredGame } from '@shared/library'

type Screen = 'play' | 'review' | 'lessons' | 'puzzles' | 'coaches' | 'profile' | 'appearance' | 'import' | 'import-review'

function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function kingInCheck(fen: string): Square | null {
  const c = new Chess(fen)
  if (!c.inCheck()) return null
  for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === c.turn()) return p.square
  return null
}

export default function App() {
  return (
    <ProfileProvider>
      <AppInner />
    </ProfileProvider>
  )
}

function AppInner() {
  const { profile, send, toast } = useProfile()
  const session = useMemo(() => new GameSession(), [])
  const version = useSyncExternalStore(session.subscribe, session.getVersion)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [levelId, setLevelId] = useState(() => {
    const v = readPref('kingside.level', DEFAULT_LEVEL_ID)
    return LEVELS.some((l) => l.id === v) ? v : DEFAULT_LEVEL_ID
  })
  const [colorPick, setColorPick] = useState<Color | 'random'>(() => (readPref('kingside.color', 'w') as Color | 'random'))
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [orientation, setOrientation] = useState<Color>('w')
  const [screen, setScreen] = useState<Screen>('play')
  const [lessonTarget, setLessonTarget] = useState<string | null>(null)
  const [puzzleTarget, setPuzzleTarget] = useState<string | null>(null)
  const [coachTarget, setCoachTarget] = useState<string | null>(null)
  const [watchItems, setWatchItems] = useState<WatchItem[]>([])
  const recordedGame = useRef<string | null>(null)
  const [importTab, setImportTab] = useState<'import' | 'library' | 'stats' | 'compare'>('import')
  const [importReview, setImportReview] = useState<{ game: StoredGame; autoStart: boolean; userColor: Color | null } | null>(null)
  const [reviewRecord, setReviewRecord] = useState<GameRecord | null>(null)
  const [modal, setModal] = useState<'settings' | 'about' | null>(null)
  const [saved, setSaved] = useState(() => GameSession.loadSaved())
  const [showResult, setShowResult] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)

  // Boot: settings, then engine detection.
  useEffect(() => {
    void window.kingside.getSettings().then(setSettings)
    void window.kingside.detectEngine().then(setEngine)
  }, [])
  useEffect(() => setSoundEnabled(settings.sound), [settings.sound])
  // Square colours (CSS variables) and piece set apply to every board app-wide.
  useEffect(() => applyAppearanceGlobals(settings.appearance), [settings.appearance])
  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const r = await window.kingside.setSettings(patch)
    if (!r.ok) {
      toast('info', `Could not save settings: ${r.error}`)
      return null
    }
    setSettings(r.value)
    return r.value
  }, [toast])
  const onBgMissing = useCallback(() => toast('info', 'Your custom background image could not be loaded, so the default background is shown. Choose another in Board Appearance.'), [toast])
  useEffect(() => {
    try {
      localStorage.setItem('kingside.level', levelId)
      localStorage.setItem('kingside.color', colorPick)
    } catch {
      /* ignore */
    }
  }, [levelId, colorPick])

  // Clock / flag watcher.
  useEffect(() => {
    const id = setInterval(() => session.tick(), 100)
    const onUnload = () => session.checkpoint()
    window.addEventListener('beforeunload', onUnload)
    return () => {
      clearInterval(id)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [session])

  const status = session.status
  useEffect(() => {
    if (status === 'over') setShowResult(true)
    if (status === 'playing') setSaved(null)
    // Record finished games (not aborts) in the training profile, once per game.
    if (status === 'over' && session.result && session.result.reason !== 'abort' && session.moves.length > 0 && recordedGame.current !== session.gameId) {
      recordedGame.current = session.gameId
      const r = session.result
      const rec = session.toRecord()
      void send({
        type: 'gameFinished',
        game: {
          id: rec.id, date: rec.date, levelId: rec.levelId, botElo: session.level.elo, playerColor: rec.playerColor,
          result: r.winner === null ? 'draw' : r.winner === rec.playerColor ? 'win' : 'loss', reason: r.reason,
          startFen: rec.startFen, moves: rec.moves.map((m) => m.uci), opening: openingFor(rec.fens)?.name ?? null,
          training: !!profile?.coach.training
        }
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const moves = session.moves
  const liveCount = moves.length
  const shownPly = viewPly === null ? liveCount : Math.min(viewPly, liveCount)
  const isLiveView = shownPly === liveCount
  const shownFen = session.fens[shownPly]
  const lastMove = shownPly > 0 ? moves[shownPly - 1] : null

  const goTo = useCallback(
    (ply: number) => {
      const p = Math.max(0, Math.min(session.moves.length, ply))
      setViewPly(p >= session.moves.length ? null : p)
    },
    [session]
  )

  // Keyboard navigation (play screen).
  useEffect(() => {
    if (screen !== 'play' || modal) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return
      const cur = viewPly === null ? session.moves.length : viewPly
      if (e.key === 'ArrowLeft') goTo(cur - 1)
      else if (e.key === 'ArrowRight') goTo(cur + 1)
      else if (e.key === 'Home') goTo(0)
      else if (e.key === 'End') goTo(session.moves.length)
      else if (e.key === 'f' || e.key === 'F') setOrientation((o) => (o === 'w' ? 'b' : 'w'))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, modal, viewPly, goTo, session])

  // What the player may do on the board right now. History view is always read-only.
  const movable: BoardMovable | null = useMemo(() => {
    const mode = interactionMode({
      status,
      viewingLive: isLiveView,
      engineError: !!session.engineError,
      playersTurn: session.isPlayersTurn,
      premovesEnabled: settings.premoves
    })
    if (!mode) return null
    const color = session.playerColor
    if (mode === 'move') {
      const map = legalDests(session.chess)
      return { color, mode: 'move', dests: (from: Square) => map.get(from) ?? [] }
    }
    const chess = session.chess
    return { color, mode: 'premove', dests: (from: Square) => premoveDests(chess, from, color) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, status, isLiveView, settings.premoves, session])

  const onMove = useCallback(
    (from: Square, to: Square, promotion?: Promo) => {
      if (!movable) return
      if (movable.mode === 'move') session.playerMove(from, to, promotion)
      else session.setPremove({ from, to, promotion })
    },
    [movable, session]
  )
  const cancelPremove = useCallback(() => session.cancelPremove(), [session])

  const startGame = (pick: Color | 'random' = colorPick) => {
    if (!engine?.ok) return
    session.start(levelId, pick)
    setOrientation(session.playerColor)
    setViewPly(null)
    setShowResult(false)
    setConfirmResign(false)
  }

  const clearLessonTarget = useCallback(() => setLessonTarget(null), [])
  const clearPuzzleTarget = useCallback(() => setPuzzleTarget(null), [])
  const clearCoachTarget = useCallback(() => setCoachTarget(null), [])
  const openCoach = useCallback((fen: string) => {
    setCoachTarget(fen)
    setScreen('coaches')
  }, [])

  /** Open a library game in the shared review/analysis screen. */
  const openImported = useCallback(async (id: string, analyze: boolean) => {
    const [r, lib] = await Promise.all([window.kingside.libraryGet(id), window.kingside.libraryList()])
    if (!r.ok || !r.value) {
      toast('info', r.ok ? 'That game is no longer in the library.' : r.error)
      return
    }
    setImportReview({ game: r.value, autoStart: analyze && !r.value.positions, userColor: userColorOf(r.value.meta, lib.myNames) })
    setScreen('import-review')
  }, [toast])

  const openReview = (rec: GameRecord) => {
    setReviewRecord(rec)
    setScreen('review')
    setShowResult(false)
  }

  const opening = useMemo(() => openingFor(session.fens.slice(0, shownPly + 1)), [version, shownPly, session])
  const level = session.status === 'idle' ? getLevel(levelId) : session.level
  const botColor: Color = session.playerColor === 'w' ? 'b' : 'w'
  const topColor: Color = orientation === 'w' ? 'b' : 'w'
  const inGame = status !== 'idle' || liveCount > 0
  const nameFor = (c: Color) => (!inGame ? (c === topColor ? 'Kingside Bot' : 'You') : c === session.playerColor ? 'You' : 'Kingside Bot')
  const isBot = (c: Color) => (inGame ? c === botColor : c === topColor)
  const res = session.result ? resultText(session.result, session.playerColor) : null

  return (
    <div className="app">
      <BackgroundLayer appearance={settings.appearance} onMissing={onBgMissing} />
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <Logo />
          <span className="nav-label">Kingside</span>
        </div>
        <NavItem icon="♟" label="Play" active={screen === 'play'} onClick={() => setScreen('play')} badge={status === 'playing' ? 'live' : undefined} />
        <NavItem icon="📈" label="Review" active={screen === 'review'} disabled={!reviewRecord || status === 'playing'} onClick={() => setScreen('review')} title={status === 'playing' ? 'Finish the game first' : !reviewRecord ? 'Finish a game to review it' : ''} />
        <div className="nav-sep" />
        <NavItem icon="📘" label="Lessons" active={screen === 'lessons'} onClick={() => setScreen('lessons')} />
        <NavItem icon="🧩" label="Puzzles" active={screen === 'puzzles'} onClick={() => setScreen('puzzles')} />
        <NavItem icon="🎓" label="Coaches" active={screen === 'coaches'} onClick={() => setScreen('coaches')} />
        <NavItem icon="👤" label="Profile" active={screen === 'profile'} onClick={() => setScreen('profile')} />
        <div className="nav-sep" />
        <NavItem icon="📥" label="Game Import" active={screen === 'import' || screen === 'import-review'} onClick={() => setScreen('import')} />
        <div className="nav-fill" />
        {profile && <div className="nav-xp" title="Total XP">✦ <span className="nav-label">{profile.xp} XP</span></div>}
        <button className={`engine-chip ${engine?.ok ? 'ok' : engine ? 'bad' : ''}`} onClick={() => setModal('settings')} title={engine?.path ?? engine?.error}>
          <i />
          <span className="nav-label">{engine === null ? 'Checking engine…' : engine.ok ? engine.name : 'No engine'}</span>
        </button>
        <div className="nav-row">
          <button className="icon-btn" onClick={() => setModal('settings')} title="Settings">⚙</button>
          <button className={`icon-btn${screen === 'appearance' ? ' on' : ''}`} onClick={() => setScreen('appearance')} title="Board appearance" data-nav="appearance">🎨</button>
          <button className="icon-btn" onClick={() => setModal('about')} title="About">?</button>
        </div>
      </nav>

      {screen === 'lessons' ? (
        <LessonsPage theme={settings.theme} showCoords={settings.showCoordinates} target={lessonTarget} onTargetHandled={clearLessonTarget} />
      ) : screen === 'puzzles' ? (
        <PuzzlesPage theme={settings.theme} showCoords={settings.showCoordinates} showLegal={settings.showLegalMoves} target={puzzleTarget} onTargetHandled={clearPuzzleTarget} onAnalyze={openCoach} />
      ) : screen === 'coaches' ? (
        <CoachesPage theme={settings.theme} showCoords={settings.showCoordinates} showLegal={settings.showLegalMoves} currentGame={liveCount > 0 ? session.toRecord() : null} gameInProgress={status === 'playing'} target={coachTarget} onTargetHandled={clearCoachTarget} />
      ) : screen === 'profile' ? (
        <ProfilePage />
      ) : screen === 'import' ? (
        <ImportPage onOpen={(id, a) => void openImported(id, a)} tab={importTab} setTab={setImportTab} />
      ) : screen === 'import-review' && importReview ? (
        <ImportedReview key={importReview.game.meta.id} data={importReview} settings={settings}
          onExit={() => { setImportTab('library'); setScreen('import') }}
          onOpenLesson={(id) => { setLessonTarget(id); setScreen('lessons') }}
          onOpenPuzzles={(c) => { setPuzzleTarget(c); setScreen('puzzles') }}
          onAnalyze={openCoach}
          onSaved={(msg) => toast('info', msg)} />
      ) : screen === 'appearance' ? (
        <AppearancePage settings={settings} save={saveSettings} showCoords={settings.showCoordinates} />
      ) : screen === 'review' && reviewRecord ? (
        <ReviewView key={reviewRecord.id + reviewRecord.moves.length} record={reviewRecord} settings={settings} onExit={() => setScreen('play')}
          onOpenLesson={(id) => { setLessonTarget(id); setScreen('lessons') }}
          onOpenPuzzles={(c) => { setPuzzleTarget(c); setScreen('puzzles') }}
          onAnalyze={openCoach} />
      ) : (
        <main className="stage">
          <section className="board-col">
            <PlayerBar
              name={nameFor(topColor)}
              subtitle={isBot(topColor) ? levelLabel(level) : undefined}
              avatar={isBot(topColor) ? 'bot' : 'you'}
              color={topColor}
              fen={shownFen}
              session={inGame ? session : undefined}
              staticClockMs={inGame ? undefined : 600_000}
              thinking={status === 'playing' && isBot(topColor) && session.botThinking}
            />
            <div className="board-wrap">
              <Board
                fen={shownFen}
                orientation={orientation}
                movable={movable}
                onMove={onMove}
                onCancelPremove={cancelPremove}
                lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
                premove={isLiveView ? session.premove : null}
                checkSquare={kingInCheck(shownFen)}
                showLegal={settings.showLegalMoves}
                showCoords={settings.showCoordinates}
                theme={settings.theme}
                annotationKey={`${moves.filter((m) => m.color === session.playerColor).length}-${viewPly ?? 'live'}`}
                dimmed={!isLiveView}
              />
              {!isLiveView && (
                <button className="history-banner" onClick={() => goTo(liveCount)} data-testid="back-to-live">
                  {shownPly === 0
                    ? 'Viewing the start position'
                    : `Viewing ${Math.ceil(shownPly / 2)}${moves[shownPly - 1].color === 'w' ? '.' : '...'} ${moves[shownPly - 1].san}`}{' '}
                  — view only. <b>Back to live ⏭</b>
                </button>
              )}
              {status === 'over' && showResult && res && (
                <div className="result-overlay" data-testid="result-overlay">
                  <div className="result-card">
                    <button className="icon-btn close" onClick={() => setShowResult(false)} aria-label="Close">✕</button>
                    <div className="result-title">{res.title}</div>
                    <div className="result-detail">{res.detail}</div>
                    {liveCount > 0 && (
                      <button className="primary-btn big" onClick={() => openReview(session.toRecord())} data-testid="open-review">
                        Game Review
                      </button>
                    )}
                    <div className="row-btns">
                      <button className="ghost-btn" onClick={() => startGame(session.playerColor === 'w' ? 'b' : 'w')}>Rematch</button>
                      <button className="ghost-btn" onClick={() => { setShowResult(false); session.toIdle() }}>New game</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <PlayerBar
              name={nameFor(orientation)}
              subtitle={isBot(orientation) ? levelLabel(level) : undefined}
              avatar={isBot(orientation) ? 'bot' : 'you'}
              color={orientation}
              fen={shownFen}
              session={inGame ? session : undefined}
              staticClockMs={inGame ? undefined : 600_000}
              thinking={status === 'playing' && isBot(orientation) && session.botThinking}
            />
          </section>

          <aside className="side-panel">
            {status === 'idle' ? (
              <>
                {saved && (
                  <div className="resume-card" data-testid="resume-card">
                    <b>Unfinished game found</b>
                    <div className="muted small">
                      {saved.uci.length} moves vs {levelLabel(getLevel(saved.levelId))}. Clocks were paused while Kingside was closed.
                    </div>
                    <div className="row-btns">
                      <button
                        className="primary-btn small"
                        disabled={!engine?.ok}
                        onClick={() => {
                          if (session.resume(saved)) {
                            setOrientation(session.playerColor)
                            setViewPly(null)
                          } else session.flash('That saved game could not be restored.')
                          setSaved(null)
                        }}
                      >
                        Resume
                      </button>
                      <button
                        className="ghost-btn small"
                        disabled={saved.uci.length === 0}
                        onClick={() => {
                          const rec = GameSession.recordFromSaved(saved)
                          clearSaved()
                          setSaved(null)
                          if (rec) openReview(rec)
                        }}
                      >
                        Review
                      </button>
                      <button className="ghost-btn small" onClick={() => { clearSaved(); setSaved(null) }}>Discard</button>
                    </div>
                  </div>
                )}
                <NewGamePanel
                  levelId={levelId}
                  onLevel={setLevelId}
                  color={colorPick}
                  onColor={setColorPick}
                  engine={engine}
                  onEngineChange={setEngine}
                  onStart={() => startGame()}
                />
              </>
            ) : (
              <div className="panel-body game-panel">
                <div className="game-head">
                  <h2 className="panel-title">vs Kingside Bot <span className="muted">{levelLabel(session.level)}</span></h2>
                  <div className="tc-chip small">10 min</div>
                </div>
                <div className="opening-box compact" title={opening?.pgn}>
                  {opening ? (
                    <><span className="eco">{opening.eco}</span> {opening.name}</>
                  ) : (
                    <span className="muted">{liveCount === 0 ? 'Starting position' : 'Opening not in database'}</span>
                  )}
                </div>
                <MoveList moves={moves} shownPly={shownPly} onSelect={goTo} />
                <NavControls ply={shownPly} max={liveCount} onGo={goTo} onFlip={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />

                {session.premove && (
                  <div className="premove-chip">
                    Premove {session.premove.from}→{session.premove.to}
                    <button className="link-btn" onClick={cancelPremove}>cancel (Esc)</button>
                  </div>
                )}
                {session.notice && <div className="notice">{session.notice}</div>}
                {session.engineError && (
                  <div className="error-box" data-testid="engine-error">
                    <b>The engine stopped responding.</b> Clocks are paused.
                    <div className="muted small">{session.engineError}</div>
                    <div className="row-btns">
                      <button className="primary-btn small" onClick={() => session.retryEngine()}>Retry</button>
                      <button className="ghost-btn small" onClick={() => session.abort()}>Abort game</button>
                    </div>
                  </div>
                )}

                <CoachWatch session={session} version={version} items={watchItems} setItems={setWatchItems} />
                {status === 'playing' ? (
                  <div className="row-btns actions">
                    {session.canAbort ? (
                      <button className="ghost-btn" onClick={() => session.abort()}>Abort</button>
                    ) : (
                      <button className="ghost-btn" onClick={() => session.offerDraw()}>½ Offer draw</button>
                    )}
                    <button
                      className={`ghost-btn${confirmResign ? ' danger' : ''}`}
                      onClick={() => {
                        if (confirmResign) {
                          session.resign()
                          setConfirmResign(false)
                        } else {
                          setConfirmResign(true)
                          setTimeout(() => setConfirmResign(false), 3000)
                        }
                      }}
                    >
                      ⚑ {confirmResign ? 'Confirm resign' : 'Resign'}
                    </button>
                  </div>
                ) : (
                  <div className="game-over-box">
                    {res && (
                      <div className="result-line">
                        <b>{res.title}</b> <span className="muted">· {res.detail}</span>
                      </div>
                    )}
                    <div className="row-btns">
                      {liveCount > 0 && <button className="primary-btn" onClick={() => openReview(session.toRecord())}>Game Review</button>}
                      <button className="ghost-btn" onClick={() => startGame(session.playerColor === 'w' ? 'b' : 'w')}>Rematch</button>
                      <button className="ghost-btn" onClick={() => session.toIdle()}>New game</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        </main>
      )}

      {modal === 'settings' && (
        <SettingsModal settings={settings} engine={engine} onSettings={setSettings} onEngine={setEngine} onClose={() => setModal(null)} onOpenAppearance={() => { setModal(null); setScreen('appearance') }} />
      )}
      {modal === 'about' && <AboutModal onClose={() => setModal(null)} />}
    </div>
  )
}

function ImportedReview({ data, settings, onExit, onOpenLesson, onOpenPuzzles, onAnalyze, onSaved }: {
  data: { game: StoredGame; autoStart: boolean; userColor: Color | null }
  settings: Settings
  onExit: () => void
  onOpenLesson: (id: string) => void
  onOpenPuzzles: (c: string) => void
  onAnalyze: (fen: string) => void
  onSaved: (msg: string) => void
}) {
  const g = data.game
  const record = useMemo(() => recordFromStored(g, data.userColor ?? 'w'), [g, data.userColor])
  return (
    <ReviewView
      record={record}
      settings={settings}
      onExit={onExit}
      onOpenLesson={onOpenLesson}
      onOpenPuzzles={onOpenPuzzles}
      onAnalyze={onAnalyze}
      imported={{
        meta: g.meta,
        userColor: data.userColor,
        cached: g.positions && g.positions.length === g.ucis.length + 1 ? { positions: g.positions, bookPlies: g.bookPlies ?? 0 } : null,
        autoStart: data.autoStart,
        pgn: g.pgn,
        onAnalyzed: (positions, bookPlies, review, ms) => {
          const summary = analysisSummary(record, positions, bookPlies, review, ms)
          void window.kingside.librarySaveAnalysis(g.meta.id, positions, bookPlies, summary).then((r) => onSaved(r.ok ? 'Analysis saved to your library' : `Could not save analysis: ${r.error}`))
        },
        onExport: () => void window.kingside.libraryExport([g.meta.id]).then((r) => { if (!r.ok) onSaved(r.error); else if (r.value) onSaved(`Exported to ${r.value}`) })
      }}
    />
  )
}

function NavItem({ icon, label, active, onClick, disabled, title, badge }: { icon: string; label: string; active: boolean; onClick: () => void; disabled?: boolean; title?: string; badge?: string }) {
  return (
    <button className={`nav-item${active ? ' active' : ''}`} onClick={onClick} disabled={disabled} title={title || label} data-nav={label.toLowerCase().split(" ").pop()}>
      <span className="nav-icon" aria-hidden>{icon}</span>
      <span className="nav-label">{label}</span>
      {badge && <span className="nav-badge">{badge}</span>}
    </button>
  )
}

function Logo() {
  // Original mark: a crown-topped "K" tile.
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--brand)" />
      <path d="M8 12l4 3 4-6 4 6 4-3-2 9H10z" fill="#1b1d1f" />
      <rect x="10" y="22.5" width="12" height="2.5" rx="1" fill="#1b1d1f" />
    </svg>
  )
}
