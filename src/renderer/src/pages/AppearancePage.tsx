import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import {
  BACKGROUNDS, BOARD_PRESETS, BUILTIN_PRESETS, DARK_SWATCHES, DEFAULT_APPEARANCE, LIGHT_SWATCHES, PIECE_SETS, sameAppearance,
  type Appearance, type AppearancePreset, type BackgroundDef
} from '@shared/appearance'
import { legalDests } from '@shared/chessUtil'
import type { Settings } from '@shared/types'
import { BackgroundLayer, backgroundCss, customUrl, processImage, type ProcessedImage } from '../appearance'
import { Board, type BoardMovable, type Promo } from '../components/Board'
import { pieceUrl } from '../pieces'
import { useProfile } from '../profile'

type Cat = 'backgrounds' | 'colors' | 'pieces' | 'presets'

interface Props {
  settings: Settings
  /** Persist a settings patch; resolves to the saved settings. */
  save: (patch: Partial<Settings>) => Promise<Settings | null>
  showCoords: boolean
}

const SAMPLE_FEN = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5'
const CATS: { id: Cat; label: string; icon: string; hint: string }[] = [
  { id: 'backgrounds', label: 'Backgrounds', icon: '🖼', hint: 'Colours, gradients, textures and your own images' },
  { id: 'colors', label: 'Board colours', icon: '▦', hint: 'Light and dark squares' },
  { id: 'pieces', label: 'Pieces', icon: '♞', hint: 'Seven piece sets' },
  { id: 'presets', label: 'Presets', icon: '★', hint: 'Saved combinations' }
]

export function AppearancePage({ settings, save, showCoords }: Props) {
  const { toast } = useProfile()
  const applied = settings.appearance
  const [draft, setDraft] = useState<Appearance>(applied)
  const [cat, setCat] = useState<Cat>('backgrounds')
  const [pending, setPending] = useState<(ProcessedImage & { name: string }) | null>(null)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [images, setImages] = useState<{ file: string; bytes: number }[]>([])
  const [presetName, setPresetName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [fen, setFen] = useState(SAMPLE_FEN)
  const [last, setLast] = useState<{ from: Square; to: Square } | null>({ from: 'f8', to: 'c5' })
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  const loadImages = useCallback(async () => {
    const r = await window.kingside.listBackgroundImages()
    if (r.ok) setImages(r.value)
  }, [])
  useEffect(() => {
    void loadImages()
    // Free the unsaved preview's object URL when leaving the page.
    return () => {
      if (pendingRef.current) URL.revokeObjectURL(pendingRef.current.url)
    }
  }, [loadImages])

  const set = (patch: Partial<Appearance>) => setDraft((d) => ({ ...d, ...patch }))
  const dirty = !sameAppearance(draft, applied) || !!pending

  const clearPending = () => {
    if (pending) URL.revokeObjectURL(pending.url)
    setPending(null)
  }

  /** Copy the processed upload into the app's backgrounds folder and select it. */
  const keepPending = async (): Promise<string | null> => {
    if (!pending) return null
    const bytes = new Uint8Array(await pending.blob.arrayBuffer())
    const r = await window.kingside.saveBackgroundImage(bytes)
    if (!r.ok) {
      setUploadErr(r.error)
      return null
    }
    clearPending()
    const bg = `custom:${r.value}`
    set({ background: bg })
    await loadImages()
    return bg
  }

  const upload = async () => {
    setUploadErr(null)
    setBusy(true)
    try {
      const r = await window.kingside.pickBackgroundImage()
      if (!r.ok) throw new Error(r.error)
      if (!r.value) return
      const img = await processImage(r.value.bytes, r.value.type)
      clearPending()
      setPending({ ...img, name: r.value.name })
    } catch (e) {
      setUploadErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    let next = draft
    if (pending) {
      const bg = await keepPending()
      if (!bg) return
      next = { ...draft, background: bg }
    }
    const s = await save({ appearance: next })
    if (s) {
      setDraft(s.appearance)
      toast('info', 'Appearance applied')
    }
  }

  const removeImage = async (file: string) => {
    const r = await window.kingside.deleteBackgroundImage(file)
    if (!r.ok) return toast('info', r.error)
    setConfirmDel(null)
    if (draft.background === `custom:${file}`) set({ background: DEFAULT_APPEARANCE.background })
    if (applied.background === `custom:${file}`) await save({ appearance: { ...applied, background: DEFAULT_APPEARANCE.background } })
    await loadImages()
  }

  const savePreset = async () => {
    const name = presetName.trim()
    if (!name) return
    let a = draft
    if (pending) {
      const bg = await keepPending()
      if (!bg) return
      a = { ...draft, background: bg }
    }
    const id = `p-${Date.now().toString(36)}`
    const s = await save({ appearancePresets: [...settings.appearancePresets, { id, name, appearance: a }] })
    if (s) {
      setPresetName('')
      toast('info', `Preset "${name}" saved`)
    }
  }

  const applyPreset = async (p: AppearancePreset) => {
    clearPending()
    setDraft(p.appearance)
    const s = await save({ appearance: p.appearance })
    if (s) toast('info', `Applied "${p.name}"`)
  }

  // Interactive sample board (so drag, click, dots, arrows and highlights can be tried out).
  const chess = useMemo(() => new Chess(fen), [fen])
  const movable: BoardMovable = useMemo(() => {
    const map = legalDests(chess)
    return { color: chess.turn(), mode: 'move', dests: (f: Square) => map.get(f) ?? [] }
  }, [chess])
  const onMove = (from: Square, to: Square, promotion?: Promo) => {
    const c = new Chess(fen)
    const m = c.move({ from, to, promotion })
    setFen(c.fen())
    setLast({ from: m.from, to: m.to })
  }
  const check = chess.inCheck() ? (chess.board().flat().find((p) => p && p.type === 'k' && p.color === chess.turn())?.square ?? null) : null

  return (
    <main className="appearance" data-testid="appearance-page">
      <nav className="ap-cats">
        <h2>Board Appearance</h2>
        {CATS.map((c) => (
          <button key={c.id} className={`ap-cat${cat === c.id ? ' active' : ''}`} onClick={() => setCat(c.id)} data-testid={`ap-cat-${c.id}`}>
            <span className="ap-cat-icon">{c.icon}</span>
            <span><b>{c.label}</b><small>{c.hint}</small></span>
          </button>
        ))}
        <div className="ap-current muted small">
          Background, square colours and pieces are separate settings — changing one never changes the others.
        </div>
      </nav>

      <section className="ap-preview">
        <div className="ap-stage" data-testid="ap-stage">
          <BackgroundLayer className="preview-bg" appearance={draft} imageUrl={pending?.url} />
          <div className="ap-board">
            <div className="ap-caption">
              <span>Live preview</span>
              <button className="link-btn" onClick={() => { setFen(SAMPLE_FEN); setLast({ from: 'f8', to: 'c5' }) }}>Reset position</button>
            </div>
            <Board fen={fen} orientation="w" movable={movable} onMove={onMove} lastMove={last} checkSquare={check as Square | null} theme="sage" showCoords={showCoords}
              colors={{ light: draft.light, dark: draft.dark }} pieceSet={draft.pieces} extraArrows={fen === SAMPLE_FEN ? [{ from: 'f3', to: 'g5', color: 'user' }] : []} />
            <div className="ap-pieces-row">
              {['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'].map((c) => <img key={c} src={pieceUrl(c, draft.pieces)} alt={c} />)}
            </div>
          </div>
        </div>
      </section>

      <aside className="ap-controls">
        <div className="ap-scroll">
          {cat === 'backgrounds' && (
            <BackgroundControls draft={draft} set={set} pending={pending} busy={busy} uploadErr={uploadErr} images={images}
              onUpload={upload} onKeep={() => void keepPending()} onDiscard={clearPending} confirmDel={confirmDel} setConfirmDel={setConfirmDel} onDelete={removeImage} />
          )}
          {cat === 'colors' && <ColorControls draft={draft} set={set} />}
          {cat === 'pieces' && (
            <div className="ap-section">
              <h3>Piece set</h3>
              <div className="piece-grid">
                {PIECE_SETS.map((p) => (
                  <button key={p.id} className={`piece-card${draft.pieces === p.id ? ' selected' : ''}`} onClick={() => set({ pieces: p.id })} data-testid={`pieces-${p.id}`}>
                    <span className="piece-samples" style={{ background: `linear-gradient(90deg, ${draft.light} 50%, ${draft.dark} 50%)` }}>
                      {['wK', 'wN', 'bQ', 'bP'].map((c) => <img key={c} src={pieceUrl(c, p.id)} alt="" />)}
                    </span>
                    <b>{p.name}</b>
                    <small className="muted">{p.style}</small>
                    <small className="muted lic">{p.license}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {cat === 'presets' && (
            <div className="ap-section">
              <h3>Built-in presets</h3>
              <div className="preset-grid">
                {BUILTIN_PRESETS.map((p) => <PresetCard key={p.id} preset={p} active={sameAppearance(p.appearance, applied)} onApply={() => void applyPreset(p)} />)}
              </div>
              <h3>Your presets</h3>
              {settings.appearancePresets.length === 0 && <p className="muted small">None yet — use "Save preset" below to store the current combination.</p>}
              <div className="preset-list">
                {settings.appearancePresets.map((p) => (
                  <div key={p.id} className="preset-row" data-testid="custom-preset">
                    <PresetThumb a={p.appearance} />
                    {renaming?.id === p.id ? (
                      <form className="preset-rename" onSubmit={async (e) => {
                        e.preventDefault()
                        const name = renaming.name.trim()
                        if (!name) return
                        await save({ appearancePresets: settings.appearancePresets.map((x) => (x.id === p.id ? { ...x, name } : x)) })
                        setRenaming(null)
                      }}>
                        <input autoFocus value={renaming.name} maxLength={40} onChange={(e) => setRenaming({ id: p.id, name: e.target.value })} data-testid="preset-rename-input" />
                        <button className="primary-btn small">Save</button>
                        <button type="button" className="ghost-btn small" onClick={() => setRenaming(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <span className="preset-name">{p.name}{sameAppearance(p.appearance, applied) && <span className="lbadge ok">active</span>}</span>
                        <button className="ghost-btn small" onClick={() => void applyPreset(p)} data-testid="preset-apply">Apply</button>
                        <button className="ghost-btn small" onClick={() => setRenaming({ id: p.id, name: p.name })} data-testid="preset-rename">Rename</button>
                        {confirmDel === p.id ? (
                          <button className="ghost-btn small danger" onClick={async () => { await save({ appearancePresets: settings.appearancePresets.filter((x) => x.id !== p.id) }); setConfirmDel(null) }} data-testid="preset-delete-confirm">Delete?</button>
                        ) : (
                          <button className="ghost-btn small" onClick={() => setConfirmDel(p.id)} data-testid="preset-delete">Delete</button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="ap-footer">
          <form className="save-preset" onSubmit={(e) => { e.preventDefault(); void savePreset() }}>
            <input value={presetName} maxLength={40} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" data-testid="preset-name" />
            <button className="ghost-btn small" disabled={!presetName.trim()} data-testid="preset-save">Save preset</button>
          </form>
          <div className="row-btns">
            <button className="ghost-btn" onClick={() => { clearPending(); setDraft(DEFAULT_APPEARANCE) }} data-testid="ap-reset">Reset to default</button>
            <button className="primary-btn" disabled={!dirty} onClick={() => void apply()} data-testid="ap-apply">Apply changes</button>
          </div>
          {dirty && <div className="muted small">Unsaved changes — the preview shows them; the rest of the app updates when you apply.</div>}
        </div>
      </aside>
    </main>
  )
}

function Thumb({ def, selected, onClick }: { def: BackgroundDef; selected: boolean; onClick: () => void }) {
  return (
    <button className={`bg-thumb${selected ? ' selected' : ''}`} onClick={onClick} title={def.name} data-bg={def.id}>
      <span className="bg-swatch" style={{ background: def.css }} />
      <span className="bg-name">{def.name}</span>
      {selected && <span className="bg-check">✓</span>}
    </button>
  )
}

function BackgroundControls(p: {
  draft: Appearance
  set: (x: Partial<Appearance>) => void
  pending: (ProcessedImage & { name: string }) | null
  busy: boolean
  uploadErr: string | null
  images: { file: string; bytes: number }[]
  onUpload: () => void
  onKeep: () => void
  onDiscard: () => void
  confirmDel: string | null
  setConfirmDel: (f: string | null) => void
  onDelete: (f: string) => void
}) {
  const [q, setQ] = useState('')
  const isImage = !!p.pending || p.draft.background.startsWith('custom:')
  const groups: { title: string; cat: BackgroundDef['category'] }[] = [
    { title: 'Solid colours', cat: 'solid' },
    { title: 'Gradients', cat: 'gradient' },
    { title: 'Textures', cat: 'texture' }
  ]
  const match = (d: BackgroundDef) => {
    const needle = q.trim().toLowerCase()
    return !needle || d.name.toLowerCase().includes(needle) || d.category.includes(needle) || (needle.startsWith('solid') && d.category === 'solid') || (needle.startsWith('textur') && d.category === 'texture')
  }
  return (
    <>
      <div className="ap-section">
        <input className="ap-search" placeholder="Search backgrounds…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="bg-search" />
        {groups.map((g) => {
          const list = BACKGROUNDS.filter((b) => b.category === g.cat && match(b))
          if (!list.length) return null
          return (
            <div key={g.cat}>
              <h3>{g.title}</h3>
              <div className="bg-grid">{list.map((d) => <Thumb key={d.id} def={d} selected={!p.pending && p.draft.background === d.id} onClick={() => { p.onDiscard(); p.set({ background: d.id }) }} />)}</div>
            </div>
          )
        })}
      </div>

      <div className="ap-section">
        <h3>Your images</h3>
        <div className="row-btns">
          <button className="ghost-btn small" onClick={p.onUpload} disabled={p.busy} data-testid="bg-upload">{p.busy ? 'Processing…' : 'Upload image…'}</button>
          <button className="ghost-btn small" onClick={() => { p.onDiscard(); p.set({ background: DEFAULT_APPEARANCE.background }) }} data-testid="bg-restore">Restore default background</button>
        </div>
        <p className="muted small">PNG, JPG/JPEG or WEBP up to 40 MB. Large images are resized to 2560 px and stored by the app, so they keep working offline and after restarts.</p>
        {p.uploadErr && <p className="error-text" data-testid="bg-upload-error">{p.uploadErr}</p>}
        {p.pending && (
          <div className="pending-card" data-testid="bg-pending">
            <span className="pending-thumb" style={{ backgroundImage: `url("${p.pending.url}")` }} />
            <span className="small">
              <b>{p.pending.name}</b><br />
              {p.pending.originalWidth}×{p.pending.originalHeight}{p.pending.width !== p.pending.originalWidth ? ` → resized to ${p.pending.width}×${p.pending.height}` : ''} · previewing
            </span>
            <span className="row-btns">
              <button className="primary-btn small" onClick={p.onKeep} data-testid="bg-keep">Use image</button>
              <button className="ghost-btn small" onClick={p.onDiscard}>Discard</button>
            </span>
          </div>
        )}
        {p.images.length > 0 && (
          <div className="bg-grid">
            {p.images.map((img) => {
              const id = `custom:${img.file}`
              return (
                <div key={img.file} className={`bg-thumb img${!p.pending && p.draft.background === id ? ' selected' : ''}`} data-testid="custom-image">
                  <button className="bg-swatch" style={{ backgroundImage: `url("${customUrl(img.file)}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} onClick={() => { p.onDiscard(); p.set({ background: id }) }} title="Use this image" />
                  {p.confirmDel === img.file ? (
                    <button className="bg-del confirm" onClick={() => p.onDelete(img.file)} data-testid="custom-image-delete-confirm">Delete?</button>
                  ) : (
                    <button className="bg-del" onClick={() => p.setConfirmDel(img.file)} title="Remove this image" data-testid="custom-image-delete">✕</button>
                  )}
                  <span className="bg-name">{(img.bytes / 1024).toFixed(0)} KB</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="ap-section">
        <h3>Adjustments</h3>
        <Slider label="Opacity" value={p.draft.bgOpacity} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => p.set({ bgOpacity: v })} testid="bg-opacity" />
        <Slider label="Blur" value={p.draft.bgBlur} min={0} max={20} step={1} fmt={(v) => `${v}px`} onChange={(v) => p.set({ bgBlur: v })} testid="bg-blur" />
        <Slider label="Brightness" value={p.draft.bgBrightness} min={0.3} max={1.5} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => p.set({ bgBrightness: v })} testid="bg-brightness" />
        <Slider label="Scale" value={p.draft.bgScale} min={1} max={2} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => p.set({ bgScale: v })} testid="bg-scale" />
        <label className="set-row">
          <span>Image fit {!isImage && <small className="muted">(images only)</small>}</span>
          <select value={p.draft.bgFit} disabled={!isImage} onChange={(e) => p.set({ bgFit: e.target.value as Appearance['bgFit'] })} data-testid="bg-fit">
            <option value="cover">Fill (cover)</option>
            <option value="contain">Fit (contain)</option>
            <option value="tile">Tile</option>
            <option value="stretch">Stretch</option>
          </select>
        </label>
        <label className="set-row">
          <span>Image position {!isImage && <small className="muted">(images only)</small>}</span>
          <select value={p.draft.bgPosition} disabled={!isImage} onChange={(e) => p.set({ bgPosition: e.target.value as Appearance['bgPosition'] })} data-testid="bg-position">
            <option value="center">Center</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>
    </>
  )
}

function Slider({ label, value, min, max, step, fmt, onChange, testid }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void; testid: string }) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} data-testid={testid} />
      <span className="slider-val">{fmt(value)}</span>
    </label>
  )
}

function ColorControls({ draft, set }: { draft: Appearance; set: (x: Partial<Appearance>) => void }) {
  return (
    <>
      <div className="ap-section">
        <h3>Board presets</h3>
        <div className="combo-grid">
          {BOARD_PRESETS.map((b) => (
            <button key={b.id} className={`combo${draft.light === b.light && draft.dark === b.dark ? ' selected' : ''}`} onClick={() => set({ light: b.light, dark: b.dark })} data-testid={`combo-${b.id}`}>
              <span className="mini-board">{[0, 1, 2, 3].map((i) => <i key={i} style={{ background: (i === 0 || i === 3) ? b.light : b.dark }} />)}</span>
              {b.name}
            </button>
          ))}
        </div>
      </div>
      <div className="ap-section">
        <h3>Light squares</h3>
        <div className="swatches">
          {LIGHT_SWATCHES.map((s) => <button key={s.id} className={`swatch${draft.light === s.color ? ' selected' : ''}`} style={{ background: s.color }} title={s.name} onClick={() => set({ light: s.color })} data-testid={`light-${s.id}`} />)}
          <label className="swatch custom" title="Custom colour"><input type="color" value={draft.light} onChange={(e) => set({ light: e.target.value })} data-testid="light-custom" /><span>+</span></label>
        </div>
        <div className="muted small">{LIGHT_SWATCHES.find((s) => s.color === draft.light)?.name ?? `Custom ${draft.light}`}</div>
      </div>
      <div className="ap-section">
        <h3>Dark squares</h3>
        <div className="swatches">
          {DARK_SWATCHES.map((s) => <button key={s.id} className={`swatch${draft.dark === s.color ? ' selected' : ''}`} style={{ background: s.color }} title={s.name} onClick={() => set({ dark: s.color })} data-testid={`dark-${s.id}`} />)}
          <label className="swatch custom" title="Custom colour"><input type="color" value={draft.dark} onChange={(e) => set({ dark: e.target.value })} data-testid="dark-custom" /><span>+</span></label>
        </div>
        <div className="muted small">{DARK_SWATCHES.find((s) => s.color === draft.dark)?.name ?? `Custom ${draft.dark}`}</div>
      </div>
    </>
  )
}

function PresetThumb({ a }: { a: Appearance }) {
  return (
    <span className="preset-thumb">
      <span className="preset-bg" style={{ ...backgroundCss(a), filter: undefined, transform: undefined, opacity: 1 }} />
      <span className="mini-board">{[0, 1, 2, 3].map((i) => <i key={i} style={{ background: (i === 0 || i === 3) ? a.light : a.dark }} />)}</span>
      <img src={pieceUrl('wN', a.pieces)} alt="" />
    </span>
  )
}

function PresetCard({ preset, active, onApply }: { preset: AppearancePreset; active: boolean; onApply: () => void }) {
  return (
    <button className={`preset-card${active ? ' selected' : ''}`} onClick={onApply} data-testid={`builtin-preset-${preset.id}`}>
      <PresetThumb a={preset.appearance} />
      <b>{preset.name}</b>
    </button>
  )
}
