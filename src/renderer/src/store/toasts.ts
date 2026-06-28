import { create } from 'zustand'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  tone: ToastTone
  title: string
  detail?: string
  action?: ToastAction
}

interface ToastStore {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

let counter = 0
const MAX_VISIBLE = 4

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = `toast-${++counter}`
    set((s) => ({ toasts: [...s.toasts.slice(-(MAX_VISIBLE - 1)), { ...toast, id }] }))
    // toasts with actions linger longer so they can be clicked
    const ttl = toast.action ? 10_000 : toast.tone === 'error' ? 6000 : 4000
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, ttl)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export const toast = (tone: ToastTone, title: string, detail?: string, action?: ToastAction): void => {
  useToasts.getState().push({ tone, title, detail, action })
}
