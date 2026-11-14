import type { KingsideApi } from './api'

declare global {
  interface Window {
    kingside: KingsideApi
  }
}

export {}
