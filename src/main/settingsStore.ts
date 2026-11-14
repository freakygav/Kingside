import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'
import { sanitizeSettings } from '@shared/settings'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

export class SettingsStore {
  private value: Settings
  readonly file: string

  constructor(dir: string) {
    this.file = join(dir, 'settings.json')
    let raw: unknown = {}
    try {
      raw = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      raw = { ...DEFAULT_SETTINGS, threads: Math.max(1, Math.min(4, Math.floor(cpus().length / 2))) }
    }
    this.value = sanitizeSettings(raw, cpus().length)
  }

  get(): Settings {
    return { ...this.value }
  }

  update(patch: Partial<Settings>): Settings {
    this.value = sanitizeSettings({ ...this.value, ...patch }, cpus().length)
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = this.file + '.tmp'
      writeFileSync(tmp, JSON.stringify(this.value, null, 2))
      renameSync(tmp, this.file)
    } catch (e) {
      console.error('Failed to save settings', e)
    }
    return this.get()
  }
}
