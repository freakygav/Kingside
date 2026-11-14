import { memo, useEffect, useState } from 'react'
import { DEFAULT_APPEARANCE, getBackground, MAX_IMAGE_SIDE, type Appearance } from '@shared/appearance'
import { setActivePieceSet } from './pieces'

export const customUrl = (file: string) => `kingside-bg://img/${encodeURIComponent(file)}`

/** Push square colours and the piece set to every board in the app (CSS variables, no re-render needed for colours). */
export function applyAppearanceGlobals(a: Appearance): void {
  const root = document.documentElement.style
  root.setProperty('--sq-light', a.light)
  root.setProperty('--sq-dark', a.dark)
  setActivePieceSet(a.pieces)
}

const FIT: Record<Appearance['bgFit'], { size: string; repeat: string }> = {
  cover: { size: 'cover', repeat: 'no-repeat' },
  contain: { size: 'contain', repeat: 'no-repeat' },
  tile: { size: 'auto', repeat: 'repeat' },
  stretch: { size: '100% 100%', repeat: 'no-repeat' }
}

/** CSS for the background layer. `imageUrl` overrides the stored custom image (used for unsaved previews). */
export function backgroundCss(a: Appearance, imageUrl?: string | null): React.CSSProperties {
  const isImage = !!imageUrl || a.background.startsWith('custom:')
  const style: React.CSSProperties = {
    opacity: a.bgOpacity,
    filter: `blur(${a.bgBlur}px) brightness(${a.bgBrightness})`,
    transform: `scale(${a.bgScale})`
  }
  if (isImage) {
    const url = imageUrl ?? customUrl(a.background.slice(7))
    const fit = FIT[a.bgFit]
    return { ...style, backgroundColor: '#111', backgroundImage: `url("${url}")`, backgroundSize: fit.size, backgroundRepeat: fit.repeat, backgroundPosition: a.bgPosition }
  }
  return { ...style, background: (getBackground(a.background) ?? getBackground(DEFAULT_APPEARANCE.background)!).css }
}

/**
 * The layer behind every screen. If a custom image is missing or unreadable, it falls back to the
 * default background and reports it once (so the user learns why).
 */
export const BackgroundLayer = memo(function BackgroundLayer({ appearance, imageUrl, className = 'app-bg', onMissing }: { appearance: Appearance; imageUrl?: string | null; className?: string; onMissing?: (file: string) => void }) {
  const file = appearance.background.startsWith('custom:') ? appearance.background.slice(7) : null
  const [broken, setBroken] = useState<string | null>(null)
  useEffect(() => {
    if (!file || imageUrl) return
    let alive = true
    // Uncached check, so a file deleted or corrupted since the last run is always noticed.
    const fail = () => {
      if (!alive) return
      setBroken(file)
      onMissing?.(file)
    }
    // An image probe (fetch to a custom scheme is blocked by CORS on file:// pages); the query
    // string bypasses the memory cache so a deleted file is noticed. onload also proves it decodes.
    const img = new Image()
    img.onload = () => alive && setBroken(null)
    img.onerror = fail
    img.src = `${customUrl(file)}?check=${Date.now()}`
    return () => {
      alive = false
      img.onload = null
      img.onerror = null
    }
  }, [file, imageUrl, onMissing])
  const effective = file && broken === file && !imageUrl ? { ...appearance, background: DEFAULT_APPEARANCE.background } : appearance
  return (
    <div className={className} aria-hidden>
      <div className="bg-paint" style={backgroundCss(effective, imageUrl)} />
    </div>
  )
})

export interface ProcessedImage {
  blob: Blob
  url: string
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

/**
 * Decode and validate an image in the renderer (Chromium handles PNG/JPEG/WEBP), downscale it so
 * the longest side is <= MAX_IMAGE_SIDE, and re-encode as JPEG. Throws a readable error for corrupt
 * files. The caller must URL.revokeObjectURL(result.url) when done.
 */
export async function processImage(bytes: Uint8Array, type: 'png' | 'jpg' | 'webp'): Promise<ProcessedImage> {
  const mime = type === 'png' ? 'image/png' : type === 'webp' ? 'image/webp' : 'image/jpeg'
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }))
  } catch {
    throw new Error('The image could not be decoded — the file may be corrupted.')
  }
  try {
    if (bmp.width < 16 || bmp.height < 16) throw new Error('The image is too small to use as a background.')
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale)
    const h = Math.round(bmp.height * scale)
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, w, h)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
    return { blob, url: URL.createObjectURL(blob), width: w, height: h, originalWidth: bmp.width, originalHeight: bmp.height }
  } finally {
    bmp.close()
  }
}
