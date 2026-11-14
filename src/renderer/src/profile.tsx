import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { ACHIEVEMENTS, type EventOutcome, type ProfileData, type ProfileEvent } from '@shared/progress'

export interface Toast {
  id: number
  kind: 'xp' | 'achievement' | 'level' | 'info'
  text: string
}

interface Ctx {
  profile: ProfileData | null
  /** Apply an event in the main process; resolves to the outcome (or null on failure). */
  send: (e: ProfileEvent) => Promise<EventOutcome | null>
  toast: (kind: Toast['kind'], text: string) => void
  reload: () => Promise<void>
}

const ProfileCtx = createContext<Ctx>({ profile: null, send: async () => null, toast: () => {}, reload: async () => {} })

let nextId = 1

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const reload = useCallback(async () => {
    setProfile(await window.kingside.getProfile())
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = nextId++
    setToasts((t) => [...t.slice(-3), { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'achievement' ? 5000 : 3200)
  }, [])

  const send = useCallback(async (e: ProfileEvent) => {
    const r = await window.kingside.profileEvent(e)
    if (!r.ok) {
      toast('info', `Could not save progress: ${r.error}`)
      return null
    }
    setProfile(r.value.profile)
    for (const id of r.value.unlocked) {
      const a = ACHIEVEMENTS.find((x) => x.id === id)
      if (a) toast('achievement', `Achievement unlocked: ${a.name}`)
    }
    if (r.value.levelUp) toast('level', `Level up! You reached level ${r.value.levelUp}`)
    else if (r.value.xpGained > 0) toast('xp', `+${r.value.xpGained} XP`)
    return r.value
  }, [toast])

  return (
    <ProfileCtx.Provider value={{ profile, send, toast, reload }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === 'achievement' ? '🏆 ' : t.kind === 'level' ? '⬆ ' : t.kind === 'xp' ? '✦ ' : ''}
            {t.text}
          </div>
        ))}
      </div>
    </ProfileCtx.Provider>
  )
}

export const useProfile = () => useContext(ProfileCtx)

/** Render **bold** markers in coach/lesson text. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}
    </>
  )
}
