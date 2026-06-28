import type { QuarterdeckApi } from './index'

declare global {
  interface Window {
    quarterdeck: QuarterdeckApi
  }
}

export {}
