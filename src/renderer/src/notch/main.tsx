/**
 * Entry for the notch overlay window (its own Vite entry — deliberately NOT
 * importing the app bundle: no Monaco, no stores, no session code; the window
 * must stay feather-light and can never own the persisted session).
 */
import ReactDOM from 'react-dom/client'
import { NotchApp } from './NotchApp'

import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@xterm/xterm/css/xterm.css'
import './notch.css'

// The overlay must never turn into an opaque error box; log and carry on.
window.addEventListener('error', (e) => console.error('[notch]', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => console.error('[notch]', e.reason))

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<NotchApp />)
