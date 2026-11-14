/** Tiny synthesized sound set (no audio assets to license). */
let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(on: boolean): void {
  enabled = on
}

function ac(): AudioContext | null {
  if (!enabled) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function knock(freq: number, dur: number, gain: number, delay = 0): void {
  const a = ac()
  if (!a) return
  const t = a.currentTime + delay
  const len = Math.floor(a.sampleRate * dur)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4)
  const src = a.createBufferSource()
  src.buffer = buf
  const filt = a.createBiquadFilter()
  filt.type = 'bandpass'
  filt.frequency.value = freq
  filt.Q.value = 1.2
  const g = a.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(filt).connect(g).connect(a.destination)
  src.start(t)
}

function tone(freq: number, dur: number, gain: number, delay = 0, type: OscillatorType = 'sine'): void {
  const a = ac()
  if (!a) return
  const t = a.currentTime + delay
  const o = a.createOscillator()
  o.type = type
  o.frequency.value = freq
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

export const sounds = {
  move: () => knock(1800, 0.07, 0.9),
  capture: () => {
    knock(900, 0.09, 1.1)
    knock(2200, 0.05, 0.5, 0.015)
  },
  castle: () => {
    knock(1700, 0.06, 0.8)
    knock(1500, 0.06, 0.8, 0.09)
  },
  check: () => {
    knock(1600, 0.07, 0.9)
    tone(880, 0.12, 0.12, 0.02, 'triangle')
  },
  premove: () => knock(2600, 0.04, 0.4),
  illegal: () => tone(180, 0.12, 0.12, 0, 'square'),
  start: () => {
    tone(523, 0.12, 0.1)
    tone(784, 0.18, 0.1, 0.1)
  },
  end: () => {
    tone(392, 0.25, 0.12)
    tone(523, 0.25, 0.1, 0.12)
    tone(659, 0.4, 0.1, 0.24)
  },
  lowTime: () => tone(1320, 0.06, 0.08, 0, 'triangle')
}
