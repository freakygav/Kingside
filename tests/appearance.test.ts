import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BACKGROUNDS, BOARD_PRESETS, BUILTIN_PRESETS, DARK_SWATCHES, DEFAULT_APPEARANCE, isValidBackground, LIGHT_SWATCHES, PIECE_SETS, sanitizeAppearance,
  sanitizePresets, sniffImage
} from '../src/shared/appearance'
import { sanitizeSettings } from '../src/shared/settings'

describe('appearance catalogue', () => {
  it('has every requested background, in the right categories', () => {
    const names = (cat: string) => BACKGROUNDS.filter((b) => b.category === cat).map((b) => b.name)
    expect(names('solid')).toEqual(['Midnight Black', 'Dark Slate', 'Pure Black', 'Charcoal', 'Navy Blue', 'Dark Purple', 'Forest Green', 'Burgundy'])
    expect(names('gradient')).toEqual(['Midnight Gradient', 'Purple Gradient', 'Blue Gradient', 'Sunset Gradient', 'Dark Ocean', 'Emerald Gradient', 'Crimson Gradient'])
    expect(names('texture')).toEqual(['Carbon Fiber', 'Dark Marble', 'Brushed Metal', 'Leather', 'Wood', 'Dark Stone', 'Hexagonal Pattern', 'Subtle Grid', 'Dark Fabric'])
    expect(new Set(BACKGROUNDS.map((b) => b.id)).size).toBe(BACKGROUNDS.length)
    // Inline SVG data URIs are fully encoded (no raw quotes or angle brackets that would break CSS).
    for (const b of BACKGROUNDS) {
      for (const m of b.css.matchAll(/data:image\/svg\+xml,([^"]+)"/g)) expect(m[1]).not.toMatch(/[<>"]/)
    }
  })

  it('square colours include the requested swatches and presets', () => {
    expect(LIGHT_SWATCHES.map((s) => s.name)).toEqual(['Classic Cream', 'Ivory', 'White', 'Light Gray', 'Sand', 'Light Blue'])
    expect(DARK_SWATCHES.map((s) => s.name)).toEqual(['Classic Brown', 'Dark Brown', 'Charcoal', 'Slate', 'Dark Blue', 'Purple', 'Forest Green'])
    expect(BOARD_PRESETS.length).toBeGreaterThanOrEqual(6)
  })

  it('every piece set ships all 12 pieces as SVG', () => {
    const dir = join(__dirname, '../src/renderer/src/assets/pieces')
    for (const set of PIECE_SETS) {
      for (const c of ['w', 'b']) for (const p of ['K', 'Q', 'R', 'B', 'N', 'P']) {
        const f = join(dir, set.id, `${c}${p}.svg`)
        expect(existsSync(f), f).toBe(true)
        expect(readFileSync(f, 'utf8')).toMatch(/<svg[\s>]/)
      }
    }
    expect(PIECE_SETS.map((p) => p.name)).toEqual(expect.arrayContaining(['Classic', 'Modern', 'Minimal', 'Tournament', 'Wooden']))
  })

  it('built-in presets are valid appearances', () => {
    for (const p of BUILTIN_PRESETS) expect(sanitizeAppearance(p.appearance)).toEqual(p.appearance)
  })
})

describe('appearance validation and persistence', () => {
  it('clamps and rejects bad values, keeps background and colours independent', () => {
    const a = sanitizeAppearance({ background: 'nope', bgOpacity: 7, bgBlur: -3, bgScale: 9, bgBrightness: 0, light: 'red', dark: '#ABCDEF', pieces: 'unknown', bgFit: 'zoom' })
    expect(a).toMatchObject({ background: DEFAULT_APPEARANCE.background, bgOpacity: 1, bgBlur: 0, bgScale: 2, bgBrightness: 0.3, light: DEFAULT_APPEARANCE.light, dark: '#abcdef', pieces: 'cburnett', bgFit: 'cover' })
    expect(isValidBackground('custom:0f1e2d3c-aaaa-bbbb-cccc-1234567890ab.jpg')).toBe(true)
    expect(isValidBackground('custom:../../etc/passwd')).toBe(false)
  })

  it('migrates the old board theme into appearance colours', () => {
    const s = sanitizeSettings({ theme: 'harbor' })
    expect(s.appearance.light).toBe('#dde4ea')
    expect(s.appearance.dark).toBe('#6f8ba4')
    expect(s.appearance.background).toBe(DEFAULT_APPEARANCE.background)
    // Existing appearance wins over the legacy theme.
    expect(sanitizeSettings({ theme: 'harbor', appearance: { ...DEFAULT_APPEARANCE, light: '#ffffff' } }).appearance.light).toBe('#ffffff')
  })

  it('presets: names trimmed, duplicates and built-in ids dropped', () => {
    const p = sanitizePresets([
      { id: 'p-1', name: '  Mine  ', appearance: { ...DEFAULT_APPEARANCE, pieces: 'merida' } },
      { id: 'p-1', name: 'dup', appearance: {} },
      { id: 'kingside', name: 'clash', appearance: {} },
      { id: 'bad id!', name: 'x', appearance: {} },
      { id: 'p-2', name: '', appearance: {} }
    ])
    expect(p.map((x) => x.name)).toEqual(['Mine'])
    expect(p[0].appearance.pieces).toBe('merida')
  })

  it('detects real image files by signature', () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe('png')
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('jpg')
    expect(sniffImage(new TextEncoder().encode('RIFF0000WEBPVP8 '))).toBe('webp')
    expect(sniffImage(new TextEncoder().encode('this is not an image'))).toBeNull()
  })
})
