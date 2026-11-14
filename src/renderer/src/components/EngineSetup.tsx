import { useState } from 'react'
import type { EngineStatus } from '@shared/types'

/** Shown wherever the engine is missing or broken. Explains exactly how to fix it. */
export function EngineSetup({ status, onChange }: { status: EngineStatus | null; onChange: (s: EngineStatus) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const choose = async () => {
    setBusy(true)
    setErr(null)
    const r = await window.kingside.chooseEngine()
    setBusy(false)
    if (!r.ok) setErr(r.error)
    else if (r.value) onChange(r.value)
  }
  const rescan = async () => {
    setBusy(true)
    setErr(null)
    // Re-scan means auto-detect: forget a broken user-chosen path, then search again.
    const r = await window.kingside.clearEnginePath()
    setBusy(false)
    if (r.ok) onChange(r.value)
    else setErr(r.error)
  }

  if (!status) return <div className="engine-setup">Looking for Stockfish…</div>
  return (
    <div className="engine-setup" data-testid="engine-setup">
      <div className="engine-setup-title">Stockfish engine needed</div>
      <p className="muted">{status.error}</p>
      <ol>
        <li>
          Install it: <code>winget install Stockfish.Stockfish</code>, or download from{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); void window.kingside.openExternal('https://stockfishchess.org/download/') }}>stockfishchess.org</a>.
        </li>
        <li>Then click <b>Re-scan</b>, or point Kingside at the .exe directly.</li>
      </ol>
      <div className="row-btns">
        <button className="primary-btn" onClick={choose} disabled={busy}>Choose engine…</button>
        <button className="ghost-btn" onClick={rescan} disabled={busy}>{busy ? 'Checking…' : 'Re-scan'}</button>
      </div>
      {err && <p className="error-text">{err}</p>}
      {status.searched && status.searched.length > 0 && (
        <details>
          <summary>Locations tried</summary>
          <ul className="searched">{status.searched.map((s) => <li key={s}>{s}</li>)}</ul>
        </details>
      )}
    </div>
  )
}
