import ReactDOM from 'react-dom/client'
import App from './App'
import { toast } from './store/toasts'

import '@fontsource-variable/schibsted-grotesk/index.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@xterm/xterm/css/xterm.css'
import './styles/global.css'

// Errors are never silent — uncaught failures surface as toasts (rate-limited).
let lastErrorToast = 0
function reportError(detail: unknown): void {
  console.error(detail)
  const now = Date.now()
  if (now - lastErrorToast < 3000) return
  lastErrorToast = now
  const message =
    detail instanceof Error ? detail.message : typeof detail === 'string' ? detail : 'see console for details'
  toast('error', 'Unexpected error', message.slice(0, 140))
}
window.addEventListener('error', (e) => reportError(e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => reportError(e.reason))

// A file dropped outside a real drop zone must never navigate the window — that
// would load file:// and blow away the app. Swallow such drops everywhere except
// genuine text inputs (so the editor's own text drag-and-drop keeps working).
const inTextField = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && !!t.closest('input, textarea, [contenteditable="true"]')
window.addEventListener('dragover', (e) => {
  if (!inTextField(e.target)) e.preventDefault()
})
window.addEventListener('drop', (e) => {
  if (!inTextField(e.target)) e.preventDefault()
})

// No StrictMode: its dev-mode double-mount would spawn duplicate PTY sessions.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
