import { useState } from 'react'
import { LEVELS, levelLabel } from '@shared/strength'
import type { Color, EngineStatus } from '@shared/types'
import { PIECE_URL } from '../pieces'
import { EngineSetup } from './EngineSetup'

interface Props {
  levelId: string
  onLevel: (id: string) => void
  color: Color | 'random'
  onColor: (c: Color | 'random') => void
  engine: EngineStatus | null
  onStart: () => void
  onEngineChange: (s: EngineStatus) => void
}

export function NewGamePanel(p: Props) {
  const [showElo, setShowElo] = useState(false)
  const engineOk = !!p.engine?.ok
  const limitUnsupported = engineOk && p.engine!.eloMin === undefined
  return (
    <div className="panel-body new-game">
      <h2 className="panel-title">Play the bot</h2>
      <div className="tc-chip">
        <span className="tc-icon">◷</span> 10 min · Rapid · no increment
      </div>

      <div className="section-label">Difficulty</div>
      <div className="level-grid" role="radiogroup" aria-label="Difficulty">
        {LEVELS.map((l) => {
          const disabled = limitUnsupported && l.mode === 'limit'
          return (
            <button
              key={l.id}
              role="radio"
              aria-checked={p.levelId === l.id}
              className={`level-card${p.levelId === l.id ? ' selected' : ''}`}
              disabled={disabled}
              onClick={() => p.onLevel(l.id)}
              title={disabled ? 'This engine does not support UCI_Elo' : l.blurb}
            >
              <span className="level-elo">{levelLabel(l)}</span>
              <span className="level-name">{l.name}</span>
            </button>
          )
        })}
      </div>
      <div className="level-blurb">{LEVELS.find((l) => l.id === p.levelId)?.blurb}</div>
      <button className="link-btn" onClick={() => setShowElo((s) => !s)}>
        {showElo ? 'Hide' : 'What do these ratings mean?'}
      </button>
      {showElo && (
        <div className="info-box">
          <p>
            Bot ratings are <b>estimates</b>, not a guarantee that the bot plays like a human with that rating.
          </p>
          <p>
            Levels from 1320 up use Stockfish's own <code>UCI_LimitStrength</code>/<code>UCI_Elo</code>. Stockfish calibrates that
            number against engine rating lists at a fixed time control. Human ratings on FIDE or online sites come from different
            player pools, and engines make different mistakes than people, so the comparison is loose.
          </p>
          <p>
            Levels below 1320 sit under Stockfish's minimum. Kingside weakens the engine itself with a very shallow search and a
            weighted random pick among its top candidate moves. Those numbers are rough guesses.
          </p>
        </div>
      )}

      <div className="section-label">Play as</div>
      <div className="color-pick">
        {(['w', 'random', 'b'] as const).map((c) => (
          <button key={c} className={`color-btn${p.color === c ? ' selected' : ''}`} onClick={() => p.onColor(c)} title={c === 'random' ? 'Random' : c === 'w' ? 'White' : 'Black'}>
            {c === 'random' ? (
              <span className="rand-icon">
                <img src={PIECE_URL.wK} alt="" />
                <img src={PIECE_URL.bK} alt="" />
              </span>
            ) : (
              <img src={PIECE_URL[c + 'K']} alt="" />
            )}
            <span>{c === 'random' ? 'Random' : c === 'w' ? 'White' : 'Black'}</span>
          </button>
        ))}
      </div>

      {!engineOk ? (
        <EngineSetup status={p.engine} onChange={p.onEngineChange} />
      ) : (
        <>
          <button className="primary-btn big" onClick={p.onStart} data-testid="start-game">
            Play
          </button>
          <div className="engine-line">
            {p.engine!.name} · {p.engine!.source === 'bundled' ? 'bundled' : p.engine!.source}
            {p.engine!.notStockfish && <span className="warn"> · not Stockfish, levels may not behave as described</span>}
          </div>
        </>
      )}
    </div>
  )
}
