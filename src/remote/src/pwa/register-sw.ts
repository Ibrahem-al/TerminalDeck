/** Registers the service worker (required for offline + home-screen install). */
export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => {
      console.warn('[remote] SW registration failed', e)
    })
  })
}

/** True when launched from the home screen (installed PWA). */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** Rough iOS detection — used to show the manual "Add to Home Screen" hint. */
export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
