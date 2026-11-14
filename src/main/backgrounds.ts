import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { CUSTOM_FILE_RE, MAX_IMAGE_BYTES, sniffImage } from '@shared/appearance'

export const BG_SCHEME = 'kingside-bg'

/** Must run before app.whenReady(): lets CSS load `kingside-bg://img/<file>` like a normal URL. */
export function registerBackgroundScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: BG_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

/**
 * Custom background images live in <userData>/backgrounds, copied there by the app (never
 * referenced from wherever the user picked them). Only files matching CUSTOM_FILE_RE are served.
 */
export class BackgroundStore {
  readonly dir: string

  constructor(userData: string) {
    this.dir = join(userData, 'backgrounds')
    mkdirSync(this.dir, { recursive: true })
  }

  registerProtocol(): void {
    protocol.handle(BG_SCHEME, async (req) => {
      const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''))
      if (!CUSTOM_FILE_RE.test(name)) return new Response('bad name', { status: 400 })
      const file = join(this.dir, name)
      if (!existsSync(file)) return new Response('missing', { status: 404 })
      return net.fetch(pathToFileURL(file).toString())
    })
  }

  /** Read a user-chosen file after validating size and signature. */
  readCandidate(path: string): { name: string; bytes: Uint8Array; type: 'png' | 'jpg' | 'webp' } {
    const ext = extname(path).toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) throw new Error('Unsupported file type. Use PNG, JPG/JPEG or WEBP.')
    const size = statSync(path).size
    if (size === 0) throw new Error('The file is empty.')
    if (size > MAX_IMAGE_BYTES) throw new Error(`The image is too large (${(size / 1e6).toFixed(1)} MB). The limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`)
    const bytes = new Uint8Array(readFileSync(path))
    const type = sniffImage(bytes)
    if (!type) throw new Error('This file is not a valid PNG, JPEG or WEBP image (its contents do not match the format).')
    return { name: path.split(/[\\/]/).pop() ?? 'image', bytes, type }
  }

  /** Save processed image bytes (already downscaled by the renderer). Returns the stored file name. */
  save(bytes: Uint8Array): string {
    const type = sniffImage(bytes)
    if (!type) throw new Error('Processed image is not a valid image.')
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Processed image is too large.')
    const name = `${randomUUID()}.${type}`
    writeFileSync(join(this.dir, name), bytes)
    return name
  }

  list(): { file: string; bytes: number; added: number }[] {
    return readdirSync(this.dir)
      .filter((f) => CUSTOM_FILE_RE.test(f))
      .map((f) => {
        const st = statSync(join(this.dir, f))
        return { file: f, bytes: st.size, added: st.mtimeMs }
      })
      .sort((a, b) => b.added - a.added)
  }

  remove(file: string): void {
    if (!CUSTOM_FILE_RE.test(file)) throw new Error('Invalid file name')
    const p = join(this.dir, file)
    if (existsSync(p)) unlinkSync(p)
  }
}
