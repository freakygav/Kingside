import { useEffect, useState } from 'react'
import type { AppInfo, EngineStatus, Settings } from '@shared/types'
import { EngineSetup } from './EngineSetup'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}


interface SettingsProps {
  settings: Settings
  engine: EngineStatus | null
  onSettings: (s: Settings) => void
  onEngine: (s: EngineStatus) => void
  onClose: () => void
  onOpenAppearance: () => void
}

export function SettingsModal({ settings, engine, onSettings, onEngine, onClose, onOpenAppearance }: SettingsProps) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const update = async (patch: Partial<Settings>) => {
    const r = await window.kingside.setSettings(patch)
    if (r.ok) onSettings(r.value)
    else setErr(r.error)
  }
  const choose = async () => {
    setBusy(true)
    const r = await window.kingside.chooseEngine()
    setBusy(false)
    if (!r.ok) setErr(r.error)
    else if (r.value) {
      setErr(null)
      onEngine(r.value)
      onSettings(await window.kingside.getSettings())
    }
  }
  const auto = async () => {
    setBusy(true)
    const r = await window.kingside.clearEnginePath()
    setBusy(false)
    if (r.ok) {
      onEngine(r.value)
      onSettings(await window.kingside.getSettings())
    } else setErr(r.error)
  }
  return (
    <Modal title="Settings" onClose={onClose}>
      <section className="set-section">
        <h4>Engine</h4>
        {engine?.ok ? (
          <div className="engine-info">
            <div><b>{engine.name}</b> <span className="muted">({engine.source})</span></div>
            <div className="mono small break">{engine.path}</div>
            {engine.eloMin !== undefined && <div className="muted small">UCI_Elo range {engine.eloMin}–{engine.eloMax}</div>}
            <div className="row-btns">
              <button className="ghost-btn small" onClick={choose} disabled={busy}>Choose another…</button>
              <button className="ghost-btn small" onClick={auto} disabled={busy}>Auto-detect</button>
            </div>
          </div>
        ) : (
          <EngineSetup status={engine} onChange={onEngine} />
        )}
        {err && <p className="error-text">{err}</p>}
      </section>

      <section className="set-section">
        <h4>Game review</h4>
        <label className="set-row">
          <span>Time per position</span>
          <select value={settings.analysisMs} onChange={(e) => update({ analysisMs: Number(e.target.value) })}>
            <option value={200}>Fast (0.2 s)</option>
            <option value={500}>Standard (0.5 s)</option>
            <option value={1000}>Deep (1 s)</option>
            <option value={2000}>Deeper (2 s)</option>
          </select>
        </label>
        <label className="set-row">
          <span>Analysis threads</span>
          <select value={settings.threads} onChange={(e) => update({ threads: Number(e.target.value) })}>
            {[1, 2, 4, 6, 8, 12, 16, 24, 32]
              .filter((n) => n <= Math.max(1, navigator.hardwareConcurrency || 1) || n === settings.threads)
              .map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="set-row">
          <span>Analysis hash</span>
          <select value={settings.hashMb} onChange={(e) => update({ hashMb: Number(e.target.value) })}>
            {[16, 32, 64, 128, 256, 512, 1024, 2048].map((n) => <option key={n} value={n}>{n} MB</option>)}
          </select>
        </label>
        <p className="muted small">The bot itself always uses 1 thread so its strength is consistent.</p>
      </section>

      <section className="set-section">
        <h4>Board</h4>
        <div className="appearance-row">
          <span className="theme-swatch selected" aria-hidden>
            <span style={{ background: settings.appearance.light }} />
            <span style={{ background: settings.appearance.dark }} />
            <span style={{ background: settings.appearance.dark }} />
            <span style={{ background: settings.appearance.light }} />
          </span>
          <span className="small">
            <b>Board Appearance</b><br />
            <span className="muted">Backgrounds, custom images, square colours, piece sets and presets.</span>
          </span>
          <button className="primary-btn small" onClick={onOpenAppearance} data-testid="open-appearance">Customize…</button>
        </div>
        <Toggle label="Show legal moves" on={settings.showLegalMoves} set={(v) => update({ showLegalMoves: v })} />
        <Toggle label="Allow premoves" on={settings.premoves} set={(v) => update({ premoves: v })} />
        <Toggle label="Coordinates" on={settings.showCoordinates} set={(v) => update({ showCoordinates: v })} />
        <Toggle label="Sounds" on={settings.sound} set={(v) => update({ sound: v })} />
      </section>
    </Modal>
  )
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="set-row toggle">
      <span>{label}</span>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <i className="switch" />
    </label>
  )
}

export function AboutModal({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    void window.kingside.appInfo().then(setInfo)
  }, [])
  return (
    <Modal title="About Kingside" onClose={onClose} wide>
      <p>
        Kingside {info?.version} · Electron {info?.electron}. Play Stockfish at a range of strengths on a 10-minute clock, then
        review the game.
      </p>
      <p className="muted small">
        Kingside is an independent app and is not affiliated with Stockfish, lichess or chess.com. The chess engine is Stockfish
        (GPL-3.0), a separate program Kingside talks to over the UCI protocol. Opening names come from the lichess chess-openings
        database (CC0). The piece artwork is the "Cburnett" set (GPLv2+ / CC BY-SA 3.0).
      </p>
      <h4>Shortcuts</h4>
      <ul className="small">
        <li>← / → step through moves · Home / End jump to start / live</li>
        <li>Right-click a square to mark it, right-drag to draw an arrow, left-click the board to clear</li>
        <li>Esc cancels a selection or premove · F flips the board</li>
      </ul>
      <h4>Licenses</h4>
      {info?.licenses.map((l, i) => (
        <div key={l.title} className="license">
          <button className="link-btn" onClick={() => setOpen(open === i ? null : i)}>{open === i ? '▾' : '▸'} {l.title}</button>
          {open === i && <pre className="license-text">{l.text}</pre>}
        </div>
      ))}
    </Modal>
  )
}
