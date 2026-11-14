/**
 * Board appearance: background (around the board), square colours and piece set are independent
 * settings. Everything here is pure data + validation; the renderer turns it into CSS.
 * All built-in backgrounds are original CSS / inline-SVG patterns (no image assets).
 */

export type BgFit = 'cover' | 'contain' | 'tile' | 'stretch'
export type BgPosition = 'center' | 'top' | 'bottom' | 'left' | 'right'

export interface Appearance {
  /** Built-in background id, or "custom:<file>" for an image in the app's backgrounds folder. */
  background: string
  bgFit: BgFit
  bgPosition: BgPosition
  /** Zoom of the background layer, 1-2. */
  bgScale: number
  /** 0-1 */
  bgOpacity: number
  /** Blur in px, 0-20. */
  bgBlur: number
  /** 0.3-1.5 */
  bgBrightness: number
  light: string
  dark: string
  pieces: string
}

export interface AppearancePreset {
  id: string
  name: string
  appearance: Appearance
  builtin?: boolean
}

export interface BackgroundDef {
  id: string
  name: string
  category: 'solid' | 'gradient' | 'texture'
  /** CSS `background` shorthand. */
  css: string
}

const svg = (body: string, w = 400, h = 400) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`

/** Seamless noise tile (feTurbulence with stitchTiles) tinted by a colour matrix. */
const noise = (freq: string, octaves: number, matrix: string, base: string, opacity = 1, w = 400, h = 400, seed = 3, type = 'fractalNoise') =>
  svg(`<filter id='n' x='0' y='0'><feTurbulence type='${type}' baseFrequency='${freq}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/><feColorMatrix values='${matrix}'/></filter><rect width='100%' height='100%' fill='${base}'/><rect width='100%' height='100%' filter='url(#n)' opacity='${opacity}'/>`, w, h)

/** Veined marble: turbulence ridges as light veins over a fine cloudy grain. */
const marble = svg(
  `<rect width='100%' height='100%' fill='#131518'/><filter id='v' x='0' y='0'><feTurbulence type='turbulence' baseFrequency='0.003 0.01' numOctaves='6' seed='21' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.75  0 0 0 0 0.77  0 0 0 0 0.82  -4 0 0 0 0.9'/></filter><rect width='100%' height='100%' filter='url(#v)' opacity='0.3'/><filter id='g' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='0.02' numOctaves='3' seed='5' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.55  0 0 0 0.25 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/>`,
  600, 600
)

const hex = svg(
  `<rect width='56' height='97' fill='#15181c'/><g fill='none' stroke='rgba(255,255,255,0.06)' stroke-width='1.2'><path d='M28 0 L56 16.2 L56 48.5 L28 64.7 L0 48.5 L0 16.2 Z'/><path d='M28 64.7 L28 97 M0 48.5 L-28 64.7 M56 48.5 L84 64.7'/></g>`,
  56, 97
)

export const BACKGROUNDS: BackgroundDef[] = [
  // Solid colours
  { id: 'midnight-black', name: 'Midnight Black', category: 'solid', css: '#0e1013' },
  { id: 'dark-slate', name: 'Dark Slate', category: 'solid', css: '#262c32' },
  { id: 'pure-black', name: 'Pure Black', category: 'solid', css: '#000000' },
  { id: 'charcoal', name: 'Charcoal', category: 'solid', css: '#1b1d1f' },
  { id: 'navy-blue', name: 'Navy Blue', category: 'solid', css: '#131f36' },
  { id: 'dark-purple', name: 'Dark Purple', category: 'solid', css: '#24182f' },
  { id: 'forest-green', name: 'Forest Green', category: 'solid', css: '#15241b' },
  { id: 'burgundy', name: 'Burgundy', category: 'solid', css: '#311219' },
  // Gradients
  { id: 'midnight-gradient', name: 'Midnight Gradient', category: 'gradient', css: 'linear-gradient(160deg, #0f1424 0%, #1b2236 55%, #0b0d14 100%)' },
  { id: 'purple-gradient', name: 'Purple Gradient', category: 'gradient', css: 'linear-gradient(145deg, #1a1129 0%, #33204d 55%, #140d20 100%)' },
  { id: 'blue-gradient', name: 'Blue Gradient', category: 'gradient', css: 'linear-gradient(150deg, #0c1a2c 0%, #1b3759 55%, #09131f 100%)' },
  { id: 'sunset-gradient', name: 'Sunset Gradient', category: 'gradient', css: 'linear-gradient(165deg, #241320 0%, #4a2230 40%, #6b3a26 75%, #23140f 100%)' },
  { id: 'dark-ocean', name: 'Dark Ocean', category: 'gradient', css: 'radial-gradient(ellipse at 50% 0%, #17394d 0%, #0c1c29 50%, #060d14 100%)' },
  { id: 'emerald-gradient', name: 'Emerald Gradient', category: 'gradient', css: 'linear-gradient(150deg, #0b1d15 0%, #163f2c 55%, #07120d 100%)' },
  { id: 'crimson-gradient', name: 'Crimson Gradient', category: 'gradient', css: 'linear-gradient(150deg, #1c090d 0%, #44131d 55%, #120609 100%)' },
  // Textures
  {
    id: 'carbon-fiber', name: 'Carbon Fiber', category: 'texture',
    css: 'linear-gradient(27deg, #131313 5px, transparent 5px) 0 5px / 20px 20px, linear-gradient(207deg, #131313 5px, transparent 5px) 10px 0 / 20px 20px, linear-gradient(27deg, #202020 5px, transparent 5px) 0 10px / 20px 20px, linear-gradient(207deg, #202020 5px, transparent 5px) 10px 5px / 20px 20px, linear-gradient(90deg, #1a1a1a 10px, transparent 10px) 0 0 / 20px 20px, linear-gradient(#1c1c1c 25%, #191919 25%, #191919 50%, transparent 50%, transparent 75%, #222 75%, #222) 0 0 / 20px 20px, #141414'
  },
  { id: 'dark-marble', name: 'Dark Marble', category: 'texture', css: `${marble} 0 0 / 600px 600px, #131518` },
  { id: 'brushed-metal', name: 'Brushed Metal', category: 'texture', css: `${noise('0.002 0.9', 2, '0 0 0 0 0.55  0 0 0 0 0.57  0 0 0 0 0.6  0 0 0 0.35 0', '#24272b', 1, 400, 400)} 0 0 / 400px 400px, linear-gradient(180deg, #2c3035, #1c1e21)` },
  { id: 'leather', name: 'Leather', category: 'texture', css: `${noise('0.9', 3, '0 0 0 0 0.12  0 0 0 0 0.07  0 0 0 0 0.04  0 0 0 0.5 0', '#33211a', 1, 300, 300)} 0 0 / 300px 300px, radial-gradient(ellipse at center, #3e281d 0%, #24160f 100%)` },
  { id: 'wood', name: 'Wood', category: 'texture', css: `${noise('0.003 0.08', 4, '0 0 0 0 0.45  0 0 0 0 0.27  0 0 0 0 0.14  0 0 0 0.9 -0.15', '#2e1d12', 1, 500, 500, 5)} 0 0 / 500px 500px, #2e1d12` },
  { id: 'dark-stone', name: 'Dark Stone', category: 'texture', css: `${noise('0.022', 4, '0 0 0 0 0.3  0 0 0 0 0.31  0 0 0 0 0.33  0 0 0 0.7 0', '#1f2124', 1, 400, 400, 9)} 0 0 / 400px 400px, #1f2124` },
  { id: 'hexagons', name: 'Hexagonal Pattern', category: 'texture', css: `${hex} 0 0 / 56px 97px, #15181c` },
  { id: 'subtle-grid', name: 'Subtle Grid', category: 'texture', css: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px) 0 0 / 32px 32px, #17191c' },
  { id: 'dark-fabric', name: 'Dark Fabric', category: 'texture', css: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 4px), repeating-linear-gradient(-45deg, rgba(0,0,0,0.28) 0 2px, transparent 2px 4px), #222428' }
]

export const LIGHT_SWATCHES = [
  { id: 'cream', name: 'Classic Cream', color: '#eedcb3' },
  { id: 'ivory', name: 'Ivory', color: '#f3eedd' },
  { id: 'white', name: 'White', color: '#f4f4f2' },
  { id: 'light-gray', name: 'Light Gray', color: '#d4d8dc' },
  { id: 'sand', name: 'Sand', color: '#e3cfa0' },
  { id: 'light-blue', name: 'Light Blue', color: '#d3e1ee' }
]

export const DARK_SWATCHES = [
  { id: 'classic-brown', name: 'Classic Brown', color: '#b08560' },
  { id: 'dark-brown', name: 'Dark Brown', color: '#7c5236' },
  { id: 'charcoal', name: 'Charcoal', color: '#4a4e54' },
  { id: 'slate', name: 'Slate', color: '#6b7c8f' },
  { id: 'dark-blue', name: 'Dark Blue', color: '#3e5f8a' },
  { id: 'purple', name: 'Purple', color: '#7a5a96' },
  { id: 'forest-green', name: 'Forest Green', color: '#5f7f4a' }
]

export const BOARD_PRESETS = [
  { id: 'sage', name: 'Sage', light: '#e8e4cc', dark: '#7f9c62' },
  { id: 'classic', name: 'Classic', light: '#eedcb3', dark: '#b08560' },
  { id: 'walnut', name: 'Walnut', light: '#ead7b7', dark: '#7c5236' },
  { id: 'harbor', name: 'Harbor', light: '#dde4ea', dark: '#6f8ba4' },
  { id: 'ocean', name: 'Ocean', light: '#d3e1ee', dark: '#3e5f8a' },
  { id: 'plum', name: 'Plum', light: '#e9e0ee', dark: '#7a5a96' },
  { id: 'graphite', name: 'Graphite', light: '#d4d8dc', dark: '#4a4e54' },
  { id: 'tournament', name: 'Tournament', light: '#f3eedd', dark: '#5f7f4a' }
]

export interface PieceSetDef {
  id: string
  name: string
  style: string
  license: string
}

export const PIECE_SETS: PieceSetDef[] = [
  { id: 'cburnett', name: 'Classic', style: 'Clean Staunton outlines', license: 'Cburnett, GPLv2+' },
  { id: 'merida', name: 'Tournament', style: 'Traditional book diagram style', license: 'Merida by Armando H. Marroquin, GPLv2+' },
  { id: 'chessnut', name: 'Modern', style: 'Bold, rounded shapes', license: 'Chessnut by Alexis Luengas, Apache-2.0' },
  { id: 'minimal', name: 'Minimal', style: 'Flat geometric shapes', license: 'Original Kingside set, MIT' },
  { id: 'wooden', name: 'Wooden', style: 'Warm carved-wood tones', license: 'Recoloured Cburnett, GPLv2+' },
  { id: 'fantasy', name: 'Fantasy', style: 'Decorative, ornate', license: 'Fantasy by Maurizio Monge, MIT' },
  { id: 'spatial', name: 'Spatial', style: 'Shaded 3D look', license: 'Spatial by Maurizio Monge, MIT' }
]

export const DEFAULT_APPEARANCE: Appearance = {
  background: 'charcoal',
  bgFit: 'cover',
  bgPosition: 'center',
  bgScale: 1,
  bgOpacity: 1,
  bgBlur: 0,
  bgBrightness: 1,
  light: '#e8e4cc',
  dark: '#7f9c62',
  pieces: 'cburnett'
}

export const BUILTIN_PRESETS: AppearancePreset[] = [
  { id: 'kingside', name: 'Kingside Default', builtin: true, appearance: DEFAULT_APPEARANCE },
  { id: 'midnight-study', name: 'Midnight Study', builtin: true, appearance: { ...DEFAULT_APPEARANCE, background: 'midnight-gradient', light: '#dde4ea', dark: '#6f8ba4', pieces: 'cburnett' } },
  { id: 'walnut-library', name: 'Walnut Library', builtin: true, appearance: { ...DEFAULT_APPEARANCE, background: 'wood', bgBrightness: 0.8, light: '#ead7b7', dark: '#7c5236', pieces: 'wooden' } },
  { id: 'tournament-hall', name: 'Tournament Hall', builtin: true, appearance: { ...DEFAULT_APPEARANCE, background: 'dark-slate', light: '#f3eedd', dark: '#5f7f4a', pieces: 'merida' } },
  { id: 'carbon-pro', name: 'Carbon Pro', builtin: true, appearance: { ...DEFAULT_APPEARANCE, background: 'carbon-fiber', light: '#d4d8dc', dark: '#4a4e54', pieces: 'chessnut' } },
  { id: 'deep-ocean', name: 'Deep Ocean', builtin: true, appearance: { ...DEFAULT_APPEARANCE, background: 'dark-ocean', light: '#d3e1ee', dark: '#3e5f8a', pieces: 'spatial' } },
  { id: 'royal-velvet', name: 'Royal Velvet', builtin: true, appearance: { ...DEFAULT_APPEARANCE, background: 'purple-gradient', light: '#e9e0ee', dark: '#7a5a96', pieces: 'fantasy' } },
  { id: 'marble-minimal', name: 'Marble Minimal', builtin: true, appearance: { ...DEFAULT_APPEARANCE, background: 'dark-marble', light: '#f4f4f2', dark: '#4a4e54', pieces: 'minimal' } }
]

/** Legacy `theme` setting -> colours (settings files from before appearance existed). */
export const LEGACY_THEMES: Record<string, { light: string; dark: string }> = {
  sage: { light: '#e8e4cc', dark: '#7f9c62' },
  walnut: { light: '#ead7b7', dark: '#a87b55' },
  harbor: { light: '#dde4ea', dark: '#6f8ba4' },
  plum: { light: '#e9e0ee', dark: '#8c6c9c' }
}

export const CUSTOM_FILE_RE = /^[a-f0-9-]{8,64}\.(jpg|png|webp)$/

const HEX_RE = /^#[0-9a-f]{6}$/i
const num = (v: unknown, min: number, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d)

export function isValidBackground(id: unknown): id is string {
  if (typeof id !== 'string') return false
  if (id.startsWith('custom:')) return CUSTOM_FILE_RE.test(id.slice(7))
  return BACKGROUNDS.some((b) => b.id === id)
}

export function sanitizeAppearance(raw: unknown, legacyTheme?: unknown): Appearance {
  const d = DEFAULT_APPEARANCE
  const legacy = typeof legacyTheme === 'string' ? LEGACY_THEMES[legacyTheme] : undefined
  if (!raw || typeof raw !== 'object') return { ...d, ...(legacy ?? {}) }
  const r = raw as Record<string, unknown>
  const fits: BgFit[] = ['cover', 'contain', 'tile', 'stretch']
  const positions: BgPosition[] = ['center', 'top', 'bottom', 'left', 'right']
  return {
    background: isValidBackground(r.background) ? r.background : d.background,
    bgFit: fits.includes(r.bgFit as BgFit) ? (r.bgFit as BgFit) : d.bgFit,
    bgPosition: positions.includes(r.bgPosition as BgPosition) ? (r.bgPosition as BgPosition) : d.bgPosition,
    bgScale: num(r.bgScale, 1, 2, d.bgScale),
    bgOpacity: num(r.bgOpacity, 0, 1, d.bgOpacity),
    bgBlur: num(r.bgBlur, 0, 20, d.bgBlur),
    bgBrightness: num(r.bgBrightness, 0.3, 1.5, d.bgBrightness),
    light: typeof r.light === 'string' && HEX_RE.test(r.light) ? r.light.toLowerCase() : d.light,
    dark: typeof r.dark === 'string' && HEX_RE.test(r.dark) ? r.dark.toLowerCase() : d.dark,
    pieces: PIECE_SETS.some((p) => p.id === r.pieces) ? (r.pieces as string) : d.pieces
  }
}

export function sanitizePresets(raw: unknown): AppearancePreset[] {
  if (!Array.isArray(raw)) return []
  const out: AppearancePreset[] = []
  for (const p of raw.slice(0, 50)) {
    if (!p || typeof p !== 'object') continue
    const r = p as Record<string, unknown>
    if (typeof r.id !== 'string' || !/^[\w-]{1,64}$/.test(r.id)) continue
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : ''
    if (!name || out.some((x) => x.id === r.id) || BUILTIN_PRESETS.some((b) => b.id === r.id)) continue
    out.push({ id: r.id, name, appearance: sanitizeAppearance(r.appearance) })
  }
  return out
}

export function getBackground(id: string): BackgroundDef | undefined {
  return BACKGROUNDS.find((b) => b.id === id)
}

export function sameAppearance(a: Appearance, b: Appearance): boolean {
  return (Object.keys(a) as (keyof Appearance)[]).every((k) => a[k] === b[k])
}

/** Image-file signature check (PNG, JPEG, WEBP). Returns the detected type or null. */
export function sniffImage(bytes: Uint8Array): 'png' | 'jpg' | 'webp' | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  const ascii = (o: number, n: number) => String.fromCharCode(...bytes.slice(o, o + n))
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp'
  return null
}

export const MAX_IMAGE_BYTES = 40 * 1024 * 1024
/** Images are downscaled so the longest side is at most this, keeping memory and disk use small. */
export const MAX_IMAGE_SIDE = 2560
