import { useCallback, useEffect, useMemo, useState } from 'react'
import { TAG_INFO } from '@shared/coach/report'
import {
  candidateFromChesscom, candidateFromLichess, candidateFromParsed, fensOf, inPeriod, libraryStats, outcomeFor, truncateToValid, userColorOf,
  type ChesscomGame, type GameMeta, type ImportCandidate, type LichessGame, type Period
} from '@shared/library'
import { parsePgn } from '@shared/pgn'
import { useProfile } from '../profile'
import { openingFor } from '../game/reviewRunner'

type Tab = 'import' | 'library' | 'stats' | 'compare'
type Method = 'chesscom' | 'lichess' | 'pgn'

interface Props {
  /** Open a library game in the analysis workspace. */
  onOpen: (id: string, analyze: boolean) => void
  tab: Tab
  setTab: (t: Tab) => void
}

export function ImportPage({ onOpen, tab, setTab }: Props) {
  const [lib, setLib] = useState<{ games: GameMeta[]; myNames: string[] }>({ games: [], myNames: [] })
  const reload = useCallback(async () => setLib(await window.kingside.libraryList()), [])
  useEffect(() => {
    void reload()
  }, [reload])
  const have = useMemo(() => new Set(lib.games.map((g) => g.id)), [lib])
  return (
    <main className="page import-page" data-testid="import-page">
      <div className="page-head">
        <h1>Game Import</h1>
        <p className="muted">Bring in your games from Chess.com, Lichess or PGN files, then analyse them with Stockfish and your coaches. Everything is stored locally and works offline once imported.</p>
      </div>
      <div className="sub-tabs flush">
        {(['import', 'library', 'stats', 'compare'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} data-testid={`import-tab-${t}`}>
            {t === 'import' ? 'Import' : t === 'library' ? `Library (${lib.games.length})` : t === 'stats' ? 'Statistics' : 'Compare'}
          </button>
        ))}
      </div>
      {tab === 'import' && <ImportCenter have={have} onImported={reload} />}
      {tab === 'library' && <Library lib={lib} reload={reload} onOpen={onOpen} />}
      {tab === 'stats' && <Stats lib={lib} reload={reload} />}
      {tab === 'compare' && <Compare lib={lib} onOpen={onOpen} />}
    </main>
  )
}

// ============================================================================================
// Import center

interface Report {
  added: number
  duplicates: number
  failed: { label: string; reason: string }[]
}

function ImportCenter({ have, onImported }: { have: Set<string>; onImported: () => Promise<void> }) {
  const [method, setMethod] = useState<Method>('chesscom')
  const [report, setReport] = useState<Report | null>(null)
  const { toast } = useProfile()

  const importCandidates = async (cands: ImportCandidate[], labelOf: (c: ImportCandidate) => string) => {
    const ok = cands.filter((c) => !c.error)
    // Fill missing opening names from the bundled opening database (position-based, never invented).
    for (const c of ok) {
      if (c.game.meta.opening && c.game.meta.eco) continue
      try {
        const m = openingFor(fensOf(c.game))
        if (m) c.game.meta = { ...c.game.meta, opening: c.game.meta.opening ?? m.name, eco: c.game.meta.eco ?? m.eco }
      } catch {
        /* leave as unknown */
      }
    }
    const failed = cands.filter((c) => c.error).map((c) => ({ label: labelOf(c), reason: c.error! }))
    let added = 0
    let duplicates = 0
    for (let i = 0; i < ok.length; i += 100) {
      const r = await window.kingside.libraryAdd(ok.slice(i, i + 100).map((c) => c.game))
      if (!r.ok) {
        failed.push({ label: `${ok.length - i} games`, reason: r.error })
        break
      }
      added += r.value.added.length
      duplicates += r.value.duplicates.length
    }
    setReport({ added, duplicates, failed })
    toast('info', `Imported ${added} game${added === 1 ? '' : 's'}${duplicates ? `, ${duplicates} already in your library` : ''}`)
    await onImported()
  }

  return (
    <div className="import-center">
      <div className="method-cards">
        {([
          ['chesscom', 'Chess.com', 'Monthly archives from the public API', '♟'],
          ['lichess', 'Lichess', 'Your public games, with filters', '♞'],
          ['pgn', 'PGN file', 'Drag & drop, browse or paste', '📄']
        ] as [Method, string, string, string][]).map(([id, name, desc, icon]) => (
          <button key={id} className={`method-card${method === id ? ' selected' : ''}`} onClick={() => { setMethod(id); setReport(null) }} data-testid={`method-${id}`}>
            <span className="method-icon">{icon}</span>
            <b>{name}</b>
            <span className="muted small">{desc}</span>
          </button>
        ))}
      </div>
      {report && (
        <div className={`import-report ${report.failed.length ? 'warn' : 'ok'}`} data-testid="import-report">
          <b>Imported {report.added} game{report.added === 1 ? '' : 's'}.</b>
          {report.duplicates > 0 && <span> {report.duplicates} already in your library (skipped, not duplicated).</span>}
          {report.failed.length > 0 && (
            <details open={report.failed.length <= 5}>
              <summary>{report.failed.length} could not be imported</summary>
              <ul>{report.failed.map((f, i) => <li key={i}><b>{f.label}</b>: {f.reason}</li>)}</ul>
            </details>
          )}
        </div>
      )}
      {method === 'chesscom' && <ChesscomImporter have={have} onImport={importCandidates} />}
      {method === 'lichess' && <LichessImporter have={have} onImport={importCandidates} />}
      {method === 'pgn' && <PgnImporter have={have} onImport={importCandidates} />}
    </div>
  )
}

const label = (c: ImportCandidate) => `${c.game.meta.white} vs ${c.game.meta.black}${c.game.meta.date ? ` (${c.game.meta.date})` : ''}`
const resultText = (r: string) => (r === '1/2-1/2' ? '½–½' : r)

function CandidateTable({ cands, selected, setSelected, have, owner }: { cands: ImportCandidate[]; selected: Set<string>; setSelected: (s: Set<string>) => void; have: Set<string>; owner?: string }) {
  const selectable = cands.filter((c) => !c.error && !have.has(c.game.meta.id))
  const allOn = selectable.length > 0 && selectable.every((c) => selected.has(c.game.meta.id))
  return (
    <div className="table-wrap">
      <table className="game-table" data-testid="candidate-table">
        <thead>
          <tr>
            <th><input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(selectable.map((c) => c.game.meta.id)))} aria-label="Select all" /></th>
            <th>Date</th><th>White</th><th>Black</th><th>Result</th><th>Time</th><th>Opening</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {cands.map((c) => {
            const m = c.game.meta
            const inLib = have.has(m.id)
            const you = owner ? userColorOf(m, [owner]) : null
            const out = you ? outcomeFor(m, you) : null
            return (
              <tr key={m.id + m.white + m.date} className={c.error ? 'bad' : inLib ? 'dim' : ''}>
                <td><input type="checkbox" disabled={!!c.error || inLib} checked={selected.has(m.id)} onChange={() => { const n = new Set(selected); n.has(m.id) ? n.delete(m.id) : n.add(m.id); setSelected(n) }} /></td>
                <td>{m.date ?? '—'}</td>
                <td className={you === 'w' ? 'me' : ''}>{m.white} {m.whiteElo ? <span className="muted">({m.whiteElo})</span> : null}</td>
                <td className={you === 'b' ? 'me' : ''}>{m.black} {m.blackElo ? <span className="muted">({m.blackElo})</span> : null}</td>
                <td className={out === 'win' ? 'good-text' : out === 'loss' ? 'bad-text' : ''}>{resultText(m.result)}</td>
                <td>{m.timeClass !== 'unknown' ? m.timeClass : ''} <span className="muted small">{m.timeControl ?? ''}</span></td>
                <td className="muted ellip">{m.opening ?? m.eco ?? '—'}</td>
                <td className="small">{c.error ? <span className="bad-text" title={c.error}>✗ {c.error}</span> : inLib ? 'In library' : c.warnings.length ? <span className="muted" title={c.warnings.join('; ')}>✓ ({c.warnings.length} note{c.warnings.length > 1 ? 's' : ''})</span> : '✓'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type ImportFn = (c: ImportCandidate[], labelOf: (c: ImportCandidate) => string) => Promise<void>

function ChesscomImporter({ have, onImport }: { have: Set<string>; onImport: ImportFn }) {
  const [username, setUsername] = useState('')
  const [profile, setProfile] = useState<{ username: string; name: string | null; url: string | null; joined: number | null } | null>(null)
  const [archives, setArchives] = useState<{ year: number; month: number }[]>([])
  const [month, setMonth] = useState<{ year: number; month: number } | null>(null)
  const [cands, setCands] = useState<ImportCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [stop, setStop] = useState(false)

  const check = async () => {
    setErr(null)
    setProfile(null)
    setArchives([])
    setCands([])
    setBusy('Checking username…')
    const p = await window.kingside.chesscomProfile(username)
    if (!p.ok) {
      setBusy(null)
      return setErr(p.error)
    }
    setProfile(p.value)
    setBusy('Loading archives…')
    const a = await window.kingside.chesscomArchives(p.value.username)
    setBusy(null)
    if (!a.ok) return setErr(a.error)
    setArchives(a.value)
    if (a.value.length === 0) setErr('This account has no public game archives.')
  }

  const loadMonth = async (m: { year: number; month: number }) => {
    if (!profile) return
    setMonth(m)
    setErr(null)
    setBusy(`Loading ${monthName(m)}…`)
    const r = await window.kingside.chesscomMonth(profile.username, m.year, m.month)
    setBusy(null)
    if (!r.ok) return setErr(r.error)
    const c = r.value.map((g: ChesscomGame) => candidateFromChesscom(g, profile.username)).reverse()
    setCands(c)
    setSelected(new Set(c.filter((x) => !x.error && !have.has(x.game.meta.id)).map((x) => x.game.meta.id)))
  }

  const importAll = async () => {
    if (!profile) return
    setStop(false)
    const all: ImportCandidate[] = []
    for (let i = 0; i < archives.length; i++) {
      if (stopRef.current) break
      setBusy(`Downloading archive ${i + 1}/${archives.length} (${monthName(archives[i])})…`)
      const r = await window.kingside.chesscomMonth(profile.username, archives[i].year, archives[i].month)
      if (!r.ok) {
        setErr(`${monthName(archives[i])}: ${r.error}`)
        if (/rate-limit|wait/i.test(r.error)) break
        continue
      }
      all.push(...r.value.map((g: ChesscomGame) => candidateFromChesscom(g, profile.username)))
    }
    setBusy('Saving…')
    await onImport(all, label)
    setBusy(null)
  }
  const stopRef = useStopRef(stop)

  return (
    <div className="importer" data-testid="chesscom-importer">
      <form className="user-row" onSubmit={(e) => { e.preventDefault(); void check() }}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Chess.com username" data-testid="chesscom-username" />
        <button className="primary-btn" disabled={!username.trim() || !!busy}>Find games</button>
      </form>
      <p className="muted small">Uses Chess.com's public Published-Data API. Only public games are available; no password or login is needed or asked for.</p>
      {err && <div className="error-box" data-testid="import-error">{err}</div>}
      {busy && <div className="muted" data-testid="import-busy">{busy} {busy.startsWith('Downloading') && <button className="link-btn" onClick={() => setStop(true)}>Stop</button>}</div>}
      {profile && (
        <div className="profile-strip">
          <b>{profile.username}</b>{profile.name ? ` · ${profile.name}` : ''}{profile.joined ? ` · joined ${new Date(profile.joined * 1000).getFullYear()}` : ''} · {archives.length} monthly archive{archives.length === 1 ? '' : 's'}
          {archives.length > 0 && <button className="ghost-btn small" disabled={!!busy} onClick={() => void importAll()} data-testid="chesscom-import-all">Import all archives</button>}
        </div>
      )}
      {archives.length > 0 && (
        <div className="month-grid" data-testid="month-grid">
          {groupByYear(archives).map(([year, ms]) => (
            <div key={year} className="year-row">
              <span className="year">{year}</span>
              {ms.map((m) => (
                <button key={m.month} className={`chip${month && month.year === m.year && month.month === m.month ? ' on' : ''}`} onClick={() => void loadMonth(m)} disabled={!!busy}>
                  {new Date(m.year, m.month - 1).toLocaleString('en', { month: 'short' })}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {cands.length > 0 && (
        <>
          <div className="row-btns">
            <button className="primary-btn" disabled={selected.size === 0 || !!busy} onClick={() => void onImport(cands.filter((c) => selected.has(c.game.meta.id)), label)} data-testid="import-selected">Import selected ({selected.size})</button>
            <button className="ghost-btn" disabled={!!busy} onClick={() => void onImport(cands.filter((c) => !have.has(c.game.meta.id)), label)}>Import whole month</button>
          </div>
          <CandidateTable cands={cands} selected={selected} setSelected={setSelected} have={have} owner={profile?.username} />
        </>
      )}
    </div>
  )
}

function useStopRef(v: boolean) {
  const [ref] = useState(() => ({ current: false }))
  ref.current = v
  return ref
}

const monthName = (m: { year: number; month: number }) => new Date(m.year, m.month - 1).toLocaleString('en', { month: 'long', year: 'numeric' })
function groupByYear(a: { year: number; month: number }[]): [number, { year: number; month: number }[]][] {
  const map = new Map<number, { year: number; month: number }[]>()
  for (const m of a) map.set(m.year, [...(map.get(m.year) ?? []), m])
  return [...map.entries()].sort((x, y) => y[0] - x[0]).map(([y, ms]) => [y, ms.sort((p, q) => q.month - p.month)])
}

function LichessImporter({ have, onImport }: { have: Set<string>; onImport: ImportFn }) {
  const [username, setUsername] = useState('')
  const [user, setUser] = useState<{ username: string; games: number | null; disabled: boolean } | null>(null)
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const [perfs, setPerfs] = useState<string[]>([])
  const [resultFilter, setResultFilter] = useState<'all' | 'win' | 'loss' | 'draw'>('all')
  const [max, setMax] = useState(50)
  const [raw, setRaw] = useState<ImportCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [oldest, setOldest] = useState<number | null>(null)

  const fetchGames = async (more: boolean) => {
    setErr(null)
    setBusy('Checking username…')
    let u = user
    if (!u || u.username.toLowerCase() !== username.trim().toLowerCase()) {
      const r = await window.kingside.lichessUser(username)
      if (!r.ok) {
        setBusy(null)
        return setErr(r.error)
      }
      u = r.value
      setUser(u)
      if (u.disabled) {
        setBusy(null)
        return setErr('This Lichess account is closed; its games are not available through the API.')
      }
    }
    setBusy('Downloading games from Lichess…')
    const q = {
      max,
      perfType: perfs,
      since: since ? new Date(since + 'T00:00:00').getTime() : undefined,
      until: more && oldest ? oldest - 1 : until ? new Date(until + 'T23:59:59').getTime() : undefined
    }
    const r = await window.kingside.lichessGames(u.username, q)
    setBusy(null)
    if (!r.ok) return setErr(r.error)
    const c = r.value.map((g: LichessGame) => candidateFromLichess(g, u!.username))
    const created = r.value.map((g) => g.createdAt ?? 0).filter(Boolean)
    setOldest(created.length ? Math.min(...created) : null)
    const next = more ? [...raw, ...c] : c
    setRaw(next)
    setSelected(new Set(next.filter((x) => !x.error && !have.has(x.game.meta.id)).map((x) => x.game.meta.id)))
    if (r.value.length === 0) setErr('No games matched these filters.')
  }

  const shown = raw.filter((c) => {
    if (resultFilter === 'all' || !user) return true
    const you = userColorOf(c.game.meta, [user.username])
    return you ? outcomeFor(c.game.meta, you) === resultFilter : false
  })

  return (
    <div className="importer" data-testid="lichess-importer">
      <form className="user-row" onSubmit={(e) => { e.preventDefault(); void fetchGames(false) }}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Lichess username" data-testid="lichess-username" />
        <button className="primary-btn" disabled={!username.trim() || !!busy}>Find games</button>
      </form>
      <div className="filter-row">
        <label>From <input type="date" value={since} onChange={(e) => setSince(e.target.value)} /></label>
        <label>To <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
        <label>Max <select value={max} onChange={(e) => setMax(Number(e.target.value))}>{[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        {['bullet', 'blitz', 'rapid', 'classical', 'correspondence'].map((p) => (
          <label key={p} className="check"><input type="checkbox" checked={perfs.includes(p)} onChange={() => setPerfs((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))} /> {p}</label>
        ))}
        <label>Result <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value as typeof resultFilter)}><option value="all">All</option><option value="win">Wins</option><option value="loss">Losses</option><option value="draw">Draws</option></select></label>
      </div>
      <p className="muted small">Uses the public Lichess API (one request at a time, as Lichess asks). Only public games; no login needed.</p>
      {err && <div className="error-box" data-testid="import-error">{err}</div>}
      {busy && <div className="muted" data-testid="import-busy">{busy}</div>}
      {user && <div className="profile-strip"><b>{user.username}</b>{user.games !== null ? ` · ${user.games.toLocaleString()} games on Lichess` : ''} · {raw.length} loaded</div>}
      {shown.length > 0 && (
        <>
          <div className="row-btns">
            <button className="primary-btn" disabled={selected.size === 0 || !!busy} onClick={() => void onImport(shown.filter((c) => selected.has(c.game.meta.id)), label)} data-testid="import-selected">Import selected ({[...selected].filter((id) => shown.some((c) => c.game.meta.id === id)).length})</button>
            <button className="ghost-btn" disabled={!!busy} onClick={() => void onImport(shown.filter((c) => !have.has(c.game.meta.id)), label)}>Import all shown</button>
            {oldest && <button className="ghost-btn" disabled={!!busy} onClick={() => void fetchGames(true)}>Load older games</button>}
          </div>
          <CandidateTable cands={shown} selected={selected} setSelected={setSelected} have={have} owner={user?.username} />
        </>
      )}
    </div>
  )
}

function PgnImporter({ have, onImport }: { have: Set<string>; onImport: ImportFn }) {
  const [text, setText] = useState('')
  const [source, setSource] = useState<string | null>(null)
  const [cands, setCands] = useState<ImportCandidate[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [partial, setPartial] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const parse = (t: string, name: string | null) => {
    setErr(null)
    setSource(name)
    const games = parsePgn(t)
    if (games.length === 0) {
      setCands(null)
      return setErr('No games found. A PGN game is a block of [Tag "value"] lines followed by the moves.')
    }
    const c = games.map((g) => candidateFromParsed(g, 'pgn'))
    setCands(c)
    setSelected(new Set(c.filter((x) => !x.error && !have.has(x.game.meta.id)).map((x) => x.game.meta.id)))
    setPartial(new Set())
  }

  const onFile = async (f: File) => {
    if (f.size > 50 * 1024 * 1024) return setErr('The file is larger than 50 MB.')
    const t = await f.text()
    setText(t)
    parse(t, f.name)
  }

  const doImport = () => {
    if (!cands) return
    const chosen = cands.filter((c) => (c.error ? partial.has(c.game.meta.id) && c.game.sans.length > 0 : selected.has(c.game.meta.id))).map((c) => (c.error ? truncateToValid(c) : c))
    const rejected = cands.filter((c) => c.error && !partial.has(c.game.meta.id))
    void onImport([...chosen, ...rejected], (c) => `Game ${cands.indexOf(c) + 1}: ${label(c)}`)
  }

  return (
    <div className="importer" data-testid="pgn-importer">
      <div
        className={`drop-zone${drag ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void onFile(f) }}
        data-testid="drop-zone"
      >
        <span className="drop-icon">📄</span>
        <b>Drop a .pgn file here</b>
        <span className="muted small">or</span>
        <button className="ghost-btn small" onClick={async () => { const r = await window.kingside.libraryOpenPgn(); if (!r.ok) setErr(r.error); else if (r.value) { setText(r.value.text); parse(r.value.text, r.value.name) } }} data-testid="pgn-browse">Browse…</button>
      </div>
      <textarea className="pgn-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Or paste PGN here, e.g.\n[White "Me"]\n[Black "Friend"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *'} data-testid="pgn-text" />
      <div className="row-btns">
        <button className="primary-btn" disabled={!text.trim()} onClick={() => parse(text, source ?? 'pasted text')} data-testid="pgn-parse">Read games</button>
        {cands && <span className="muted small">{cands.length} game{cands.length === 1 ? '' : 's'} found{source ? ` in ${source}` : ''} · {cands.filter((c) => c.error).length} with problems</span>}
      </div>
      {err && <div className="error-box" data-testid="import-error">{err}</div>}
      {cands && (
        <>
          {cands.some((c) => c.error) && (
            <div className="warn-box small">
              Games with problems are not imported unless you tick "valid part" — then only the moves before the problem are kept (marked as unfinished).
              <ul className="problems">
                {cands.map((c, i) => c.error ? (
                  <li key={i}>
                    Game {i + 1} ({label(c)}): {c.error}
                    {c.game.sans.length > 0 && (
                      <label className="check"> <input type="checkbox" checked={partial.has(c.game.meta.id)} onChange={() => { const n = new Set(partial); n.has(c.game.meta.id) ? n.delete(c.game.meta.id) : n.add(c.game.meta.id); setPartial(n) }} /> import valid part ({c.game.sans.length} moves)</label>
                    )}
                  </li>
                ) : null)}
              </ul>
            </div>
          )}
          <button className="primary-btn" disabled={selected.size + partial.size === 0} onClick={doImport} data-testid="import-selected">Import {selected.size + partial.size} game{selected.size + partial.size === 1 ? '' : 's'}</button>
          <CandidateTable cands={cands} selected={selected} setSelected={setSelected} have={have} />
        </>
      )}
    </div>
  )
}

// ============================================================================================
// Library

/** Search text survives opening a game and coming back (for this app session). */
const librarySearch = { q: '' }

function Library({ lib, reload, onOpen }: { lib: { games: GameMeta[]; myNames: string[] }; reload: () => Promise<void>; onOpen: (id: string, analyze: boolean) => void }) {
  const { toast } = useProfile()
  const [q, setQRaw] = useState(librarySearch.q)
  const setQ = (v: string) => {
    librarySearch.q = v
    setQRaw(v)
  }
  const [sources, setSources] = useState<string[]>([])
  const [result, setResult] = useState<'all' | 'win' | 'loss' | 'draw'>('all')
  const [opponent, setOpponent] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [opening, setOpening] = useState('')
  const [tc, setTc] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<string[] | null>(null)

  const openings = useMemo(() => [...new Set(lib.games.map((g) => g.opening).filter((o): o is string => !!o))].sort(), [lib])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return lib.games
      .filter((g) => {
        const you = userColorOf(g, lib.myNames)
        if (needle && ![g.white, g.black, g.opening ?? '', g.event ?? '', g.eco ?? ''].some((s) => s.toLowerCase().includes(needle))) return false
        if (sources.length && !sources.includes(g.source)) return false
        if (result !== 'all' && (!you || outcomeFor(g, you) !== result)) return false
        if (opponent.trim()) {
          const opp = you === 'w' ? g.black : you === 'b' ? g.white : `${g.white} ${g.black}`
          if (!opp.toLowerCase().includes(opponent.trim().toLowerCase())) return false
        }
        if (from && (!g.date || g.date < from)) return false
        if (to && (!g.date || g.date > to)) return false
        if (opening && g.opening !== opening) return false
        if (tc && g.timeClass !== tc) return false
        return true
      })
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.importedAt - a.importedAt)
  }, [lib, q, sources, result, opponent, from, to, opening, tc])

  const del = async (ids: string[]) => {
    const r = await window.kingside.libraryDelete(ids)
    setConfirm(null)
    setSelected(new Set())
    if (r.ok) toast('info', `Deleted ${r.value} game${r.value === 1 ? '' : 's'}`)
    await reload()
  }
  const exportIds = async (ids: string[]) => {
    const r = await window.kingside.libraryExport(ids)
    if (!r.ok) toast('info', r.error)
    else if (r.value) toast('info', `Exported ${ids.length} game${ids.length === 1 ? '' : 's'} to ${r.value}`)
  }
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id))

  if (lib.games.length === 0) return <div className="empty-state">Your library is empty. Import games from Chess.com, Lichess or a PGN file to get started.</div>
  return (
    <div className="library" data-testid="library">
      <div className="filter-row">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search players, openings, events…" data-testid="library-search" />
        {['chesscom', 'lichess', 'pgn'].map((s) => (
          <label key={s} className="check"><input type="checkbox" checked={sources.includes(s)} onChange={() => setSources((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))} /> {s === 'chesscom' ? 'Chess.com' : s === 'lichess' ? 'Lichess' : 'PGN'}</label>
        ))}
        <select value={result} onChange={(e) => setResult(e.target.value as typeof result)} data-testid="library-result"><option value="all">All results</option><option value="win">Wins</option><option value="loss">Losses</option><option value="draw">Draws</option></select>
        <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Opponent" className="short" />
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <select value={opening} onChange={(e) => setOpening(e.target.value)} className="short"><option value="">Any opening</option>{openings.map((o) => <option key={o} value={o}>{o}</option>)}</select>
        <select value={tc} onChange={(e) => setTc(e.target.value)}><option value="">Any time control</option>{['bullet', 'blitz', 'rapid', 'classical', 'daily', 'unknown'].map((t) => <option key={t} value={t}>{t}</option>)}</select>
      </div>
      <div className="row-btns bulk">
        <span className="muted small">{rows.length} of {lib.games.length} games · {selected.size} selected</span>
        <button className="ghost-btn small" disabled={!selected.size} onClick={() => void exportIds([...selected])} data-testid="export-selected">Export selected</button>
        {confirm && confirm.length > 1 ? (
          <button className="ghost-btn small danger" onClick={() => void del(confirm)} data-testid="confirm-delete">Delete {confirm.length} games?</button>
        ) : (
          <button className="ghost-btn small" disabled={!selected.size} onClick={() => setConfirm([...selected])} data-testid="delete-selected">Delete selected</button>
        )}
      </div>
      <div className="table-wrap">
        <table className="game-table" data-testid="library-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Select all" /></th>
              <th>Date</th><th>White</th><th>Black</th><th>Result</th><th>Opening</th><th>Time</th><th>Source</th><th>Analysis</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => {
              const you = userColorOf(g, lib.myNames)
              const out = you ? outcomeFor(g, you) : null
              const acc = g.analysis ? (you === 'b' ? g.analysis.accuracyB : you === 'w' ? g.analysis.accuracyW : null) : null
              return (
                <tr key={g.id} data-game={g.id}>
                  <td><input type="checkbox" checked={selected.has(g.id)} onChange={() => { const n = new Set(selected); n.has(g.id) ? n.delete(g.id) : n.add(g.id); setSelected(n) }} /></td>
                  <td>{g.date ?? '—'}</td>
                  <td className={you === 'w' ? 'me' : ''}>{g.white} {g.whiteElo ? <span className="muted">({g.whiteElo})</span> : null}</td>
                  <td className={you === 'b' ? 'me' : ''}>{g.black} {g.blackElo ? <span className="muted">({g.blackElo})</span> : null}</td>
                  <td className={out === 'win' ? 'good-text' : out === 'loss' ? 'bad-text' : ''}>{resultText(g.result)}</td>
                  <td className="muted ellip" title={g.opening ?? ''}>{g.opening ?? g.eco ?? '—'}</td>
                  <td>{g.timeClass !== 'unknown' ? g.timeClass : <span className="muted">—</span>}</td>
                  <td><span className={`src src-${g.source}`}>{g.source === 'chesscom' ? 'Chess.com' : g.source === 'lichess' ? 'Lichess' : 'PGN'}</span></td>
                  <td>{g.analysis ? <span className="good-text">✓{acc !== null ? ` ${acc}%` : ''}</span> : <span className="muted">—</span>}</td>
                  <td className="actions-cell">
                    <button className="ghost-btn small" onClick={() => onOpen(g.id, false)} data-testid="open-game">Open</button>
                    <button className="primary-btn small" onClick={() => onOpen(g.id, true)} data-testid="analyze-game">{g.analysis ? 'Review' : 'Analyze'}</button>
                    <button className="icon-btn" title="Export PGN" onClick={() => void exportIds([g.id])}>⤓</button>
                    {g.url && <button className="icon-btn" title="Open original game" onClick={() => void window.kingside.openExternal(g.url!)}>↗</button>}
                    {confirm && confirm.length === 1 && confirm[0] === g.id ? (
                      <button className="ghost-btn small danger" onClick={() => void del([g.id])} data-testid="confirm-delete-one">Delete?</button>
                    ) : (
                      <button className="icon-btn" title="Delete" onClick={() => setConfirm([g.id])} data-testid="delete-one">🗑</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================================
// Statistics

const tagLabel = (t: string) => TAG_INFO[t]?.label ?? t

function Stats({ lib, reload }: { lib: { games: GameMeta[]; myNames: string[] }; reload: () => Promise<void> }) {
  const [period, setPeriod] = useState<Period>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [names, setNames] = useState(lib.myNames.join(', '))
  useEffect(() => setNames(lib.myNames.join(', ')), [lib.myNames])
  const games = lib.games.filter((g) => inPeriod(g, period, Date.now(), from, to))
  const s = libraryStats(games, lib.myNames)
  const best = s.openings.filter((o) => o.games >= 3).sort((a, b) => b.score - a.score)
  const pct = (w: number, d: number, n: number) => (n ? `${Math.round(((w + d / 2) / n) * 100)}%` : '—')
  return (
    <div className="stats-page" data-testid="import-stats">
      <div className="filter-row">
        {(['7', '30', '90', 'all', 'custom'] as Period[]).map((p) => (
          <button key={p} className={`chip${period === p ? ' on' : ''}`} onClick={() => setPeriod(p)} data-testid={`period-${p}`}>{p === 'all' ? 'All time' : p === 'custom' ? 'Custom' : `Last ${p} days`}</button>
        ))}
        {period === 'custom' && (<><label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></>)}
      </div>
      <form className="names-row" onSubmit={async (e) => { e.preventDefault(); await window.kingside.librarySetNames(names.split(',')); await reload() }}>
        <span className="small">Your usernames (to know which side you played):</span>
        <input value={names} onChange={(e) => setNames(e.target.value)} placeholder="e.g. mychesscomname, mylichessname" data-testid="my-names" />
        <button className="ghost-btn small">Save</button>
      </form>
      {s.games === 0 ? <div className="empty-state">No imported games in this period.</div> : (
        <>
          <div className="dash-grid">
            <div className="stat-card"><span className="stat-label">Games imported</span><span className="stat-value">{s.games}</span><span className="muted small">{s.withYou} with you identified</span></div>
            <div className="stat-card"><span className="stat-label">Wins / losses / draws</span><span className="stat-value"><span className="good-text">{s.wins}</span> / <span className="bad-text">{s.losses}</span> / {s.draws}</span><span className="muted small">Score {s.winRate !== null ? `${s.winRate}%` : '—'}</span></div>
            <div className="stat-card"><span className="stat-label">As White</span><span className="stat-value">{pct(s.asWhite.wins, s.asWhite.draws, s.asWhite.games)}</span><span className="muted small">{s.asWhite.games} games · +{s.asWhite.wins} ={s.asWhite.draws} −{s.asWhite.losses}</span></div>
            <div className="stat-card"><span className="stat-label">As Black</span><span className="stat-value">{pct(s.asBlack.wins, s.asBlack.draws, s.asBlack.games)}</span><span className="muted small">{s.asBlack.games} games · +{s.asBlack.wins} ={s.asBlack.draws} −{s.asBlack.losses}</span></div>
            <div className="stat-card"><span className="stat-label">Avg. opponent rating</span><span className="stat-value">{s.avgOpponent ?? '—'}</span><span className="muted small">from games with ratings</span></div>
            <div className="stat-card"><span className="stat-label">Avg. game length</span><span className="stat-value">{s.avgLength ?? '—'}<small> moves</small></span></div>
            <div className="stat-card"><span className="stat-label">Analysed games</span><span className="stat-value">{s.analysed}</span><span className="muted small">accuracy {s.avgAccuracy ?? '—'}% · ACPL {s.avgAcpl ?? '—'}</span></div>
          </div>
          {s.withYou === 0 && <div className="warn-box">None of these games has a player matching your usernames, so wins/losses can't be attributed. Add your usernames above.</div>}
          <div className="chart-grid">
            <div className="chart-card">
              <h3>Most played openings</h3>
              {s.openings.length === 0 ? <div className="chart-empty">No opening data in these games.</div> : (
                <table className="hist-table"><tbody>{s.openings.slice(0, 8).map((o) => <tr key={o.name}><td>{o.name}</td><td>{o.games} game{o.games === 1 ? '' : 's'}</td><td>{o.score}%</td></tr>)}</tbody></table>
              )}
            </div>
            <div className="chart-card">
              <h3>Best and worst openings <span className="muted small">(3+ games)</span></h3>
              {best.length === 0 ? <div className="chart-empty">Not enough games per opening yet.</div> : (
                <table className="hist-table"><tbody>
                  {best.slice(0, 3).map((o) => <tr key={'b' + o.name}><td className="good-text">▲</td><td>{o.name}</td><td>{o.score}% in {o.games}</td></tr>)}
                  {best.length > 3 && best.slice(-3).reverse().map((o) => <tr key={'w' + o.name}><td className="bad-text">▼</td><td>{o.name}</td><td>{o.score}% in {o.games}</td></tr>)}
                </tbody></table>
              )}
            </div>
            <div className="chart-card">
              <h3>Most common mistake categories</h3>
              {s.mistakes.length === 0 ? <div className="chart-empty">Analyse games to see your mistake categories (only analysed games count).</div> : (
                <table className="hist-table"><tbody>{s.mistakes.slice(0, 8).map((m) => <tr key={m.tag}><td>{tagLabel(m.tag)}</td><td>{m.count}×</td></tr>)}</tbody></table>
              )}
            </div>
          </div>
          <p className="muted small">Accuracy and ACPL are Kingside's own engine-based estimates, not official Chess.com or Lichess accuracy scores. Statistics use only your imported games and completed analyses.</p>
        </>
      )}
    </div>
  )
}

// ============================================================================================
// Compare

function Compare({ lib, onOpen }: { lib: { games: GameMeta[]; myNames: string[] }; onOpen: (id: string, analyze: boolean) => void }) {
  const [mode, setMode] = useState<'games' | 'opponent' | 'openings' | 'colors'>('games')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [opp, setOpp] = useState('')
  const games = lib.games
  const mineOnly = games.filter((g) => userColorOf(g, lib.myNames))
  const opponents = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of mineOnly) {
      const you = userColorOf(g, lib.myNames)!
      const o = you === 'w' ? g.black : g.white
      m.set(o, (m.get(o) ?? 0) + 1)
    }
    return [...m.entries()].sort((x, y) => y[1] - x[1])
  }, [mineOnly, lib.myNames])
  const label2 = (g: GameMeta) => `${g.date ?? '?'} · ${g.white} vs ${g.black} (${g.result})`
  const metricRow = (g: GameMeta | undefined) => {
    if (!g) return null
    const you = userColorOf(g, lib.myNames) ?? 'w'
    const acc = g.analysis ? (you === 'w' ? g.analysis.accuracyW : g.analysis.accuracyB) : null
    const acpl = g.analysis ? (you === 'w' ? g.analysis.acplW : g.analysis.acplB) : null
    const tags = g.analysis?.tags?.[you] ?? {}
    return { you, acc, acpl, tags, out: outcomeFor(g, you) }
  }
  const ga = games.find((g) => g.id === a)
  const gb = games.find((g) => g.id === b)
  const ma = metricRow(ga)
  const mb = metricRow(gb)
  const group = (filter: (g: GameMeta) => boolean) => libraryStats(games.filter(filter), lib.myNames)
  return (
    <div className="compare" data-testid="compare">
      <div className="filter-row">
        {([['games', 'Two games'], ['opponent', 'Vs an opponent'], ['openings', 'Openings'], ['colors', 'White vs Black']] as const).map(([id, l]) => (
          <button key={id} className={`chip${mode === id ? ' on' : ''}`} onClick={() => setMode(id)} data-testid={`compare-${id}`}>{l}</button>
        ))}
      </div>
      {mode === 'games' && (
        <>
          <div className="filter-row">
            <select value={a} onChange={(e) => setA(e.target.value)} data-testid="compare-a"><option value="">Choose game A…</option>{games.map((g) => <option key={g.id} value={g.id}>{label2(g)}</option>)}</select>
            <select value={b} onChange={(e) => setB(e.target.value)} data-testid="compare-b"><option value="">Choose game B…</option>{games.map((g) => <option key={g.id} value={g.id}>{label2(g)}</option>)}</select>
          </div>
          {ga && gb && ma && mb && (
            <table className="hist-table compare-table" data-testid="compare-table">
              <thead><tr><th /><th>A</th><th>B</th></tr></thead>
              <tbody>
                <tr><td>Game</td><td>{label2(ga)}</td><td>{label2(gb)}</td></tr>
                <tr><td>Your result</td><td>{ma.out ?? '—'}</td><td>{mb.out ?? '—'}</td></tr>
                <tr><td>Opening</td><td>{ga.opening ?? '—'}</td><td>{gb.opening ?? '—'}</td></tr>
                <tr><td>Your accuracy</td><td>{ma.acc ?? 'not analysed'}</td><td>{mb.acc ?? 'not analysed'}</td></tr>
                <tr><td>Your ACPL</td><td>{ma.acpl ?? '—'}</td><td>{mb.acpl ?? '—'}</td></tr>
                <tr><td>Mistakes</td><td>{Object.entries(ma.tags).map(([k, n]) => `${tagLabel(k)} ×${n}`).join(', ') || '—'}</td><td>{Object.entries(mb.tags).map(([k, n]) => `${tagLabel(k)} ×${n}`).join(', ') || '—'}</td></tr>
                <tr><td /><td><button className="link-btn" onClick={() => onOpen(ga.id, true)}>Open A</button></td><td><button className="link-btn" onClick={() => onOpen(gb.id, true)}>Open B</button></td></tr>
              </tbody>
            </table>
          )}
        </>
      )}
      {mode === 'opponent' && (
        <>
          <select value={opp} onChange={(e) => setOpp(e.target.value)} data-testid="compare-opponent"><option value="">Choose an opponent…</option>{opponents.map(([o, n]) => <option key={o} value={o}>{o} ({n} games)</option>)}</select>
          {opp && <GroupSummary s={group((g) => { const you = userColorOf(g, lib.myNames); return !!you && (you === 'w' ? g.black : g.white) === opp })} title={`Your games against ${opp}`} />}
          {opponents.length === 0 && <div className="empty-state">Add your usernames in Statistics so your opponents can be identified.</div>}
        </>
      )}
      {mode === 'openings' && (
        <table className="hist-table" data-testid="opening-table">
          <thead><tr><th>Opening</th><th>Games</th><th>Score</th><th>Avg. accuracy</th></tr></thead>
          <tbody>
            {libraryStats(mineOnly, lib.myNames).openings.slice(0, 20).map((o) => {
              const sub = group((g) => (g.opening ?? g.eco) === o.name && !!userColorOf(g, lib.myNames))
              return <tr key={o.name}><td>{o.name}</td><td>{o.games}</td><td>{o.score}%</td><td>{sub.avgAccuracy ?? '—'}</td></tr>
            })}
          </tbody>
        </table>
      )}
      {mode === 'colors' && (
        <div className="chart-grid">
          <GroupSummary s={group((g) => userColorOf(g, lib.myNames) === 'w')} title="As White" />
          <GroupSummary s={group((g) => userColorOf(g, lib.myNames) === 'b')} title="As Black" />
        </div>
      )}
      <p className="muted small">Engine accuracy is an application-generated estimate, not an official Chess.com or Lichess accuracy score. Accuracy, ACPL and mistakes only include games you have analysed.</p>
    </div>
  )
}

function GroupSummary({ s, title }: { s: ReturnType<typeof libraryStats>; title: string }) {
  return (
    <div className="chart-card" data-testid="group-summary">
      <h3>{title}</h3>
      <table className="hist-table"><tbody>
        <tr><td>Games</td><td>{s.withYou}</td></tr>
        <tr><td>Win / draw / loss</td><td>{s.wins} / {s.draws} / {s.losses}</td></tr>
        <tr><td>Score</td><td>{s.winRate !== null ? `${s.winRate}%` : '—'}</td></tr>
        <tr><td>Avg. accuracy</td><td>{s.avgAccuracy ?? '—'} <span className="muted small">({s.analysed} analysed)</span></td></tr>
        <tr><td>Avg. centipawn loss</td><td>{s.avgAcpl ?? '—'}</td></tr>
        <tr><td>Common mistakes</td><td>{s.mistakes.slice(0, 3).map((m) => `${tagLabel(m.tag)} ×${m.count}`).join(', ') || '—'}</td></tr>
        <tr><td>Most played opening</td><td>{s.openings[0]?.name ?? '—'}</td></tr>
      </tbody></table>
    </div>
  )
}
