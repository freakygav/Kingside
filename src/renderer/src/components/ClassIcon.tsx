import type { MoveClass } from '@shared/review'
import { CLASS_LABEL } from '@shared/review'

/** Original, simple classification glyphs: a coloured disc with a symbol. */
const GLYPH: Record<MoveClass, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '✓',
  good: '✓',
  book: 'B',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
  miss: '✗',
  forced: '→'
}

export function ClassIcon({ cls, size = 18, title }: { cls: MoveClass; size?: number; title?: string }) {
  const glyph = GLYPH[cls]
  return (
    <span
      className={`cls-icon cls-${cls}`}
      style={{ width: size, height: size, fontSize: size * (glyph.length > 1 ? 0.5 : 0.62) }}
      title={title ?? CLASS_LABEL[cls]}
      aria-label={CLASS_LABEL[cls]}
    >
      {glyph}
    </span>
  )
}
