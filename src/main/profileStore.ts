import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { applyEvent, emptyProfile, migrateProfile, type EventOutcome, type ProfileData, type ProfileEvent } from '@shared/progress'

/**
 * Training profile persistence: one JSON document next to settings.json (userData/profile.json).
 * Writes are atomic (tmp + rename). A file that fails to parse is kept as profile.corrupt-<ts>.json
 * instead of being silently overwritten.
 */
export class ProfileStore {
  readonly file: string
  private data: ProfileData

  constructor(dir: string, private now: () => number = Date.now) {
    this.file = join(dir, 'profile.json')
    this.data = this.load()
  }

  private load(): ProfileData {
    if (!existsSync(this.file)) return emptyProfile(this.now())
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'))
      const migrated = migrateProfile(raw, this.now())
      if ((raw as { schemaVersion?: number }).schemaVersion !== migrated.schemaVersion) {
        // Persist the migrated document once so later reads are already current.
        this.data = migrated
        this.save()
      }
      return migrated
    } catch (e) {
      try {
        copyFileSync(this.file, this.file.replace(/\.json$/, `.corrupt-${this.now()}.json`))
      } catch {
        /* ignore */
      }
      console.error('profile.json unreadable, starting fresh (backup kept)', e)
      return emptyProfile(this.now())
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.data))
    renameSync(tmp, this.file)
  }

  get(): ProfileData {
    return this.data
  }

  apply(e: ProfileEvent): EventOutcome {
    const out = applyEvent(this.data, e, this.now())
    this.data = out.profile
    this.save()
    return out
  }

  reset(): ProfileData {
    this.data = emptyProfile(this.now())
    this.save()
    return this.data
  }
}
