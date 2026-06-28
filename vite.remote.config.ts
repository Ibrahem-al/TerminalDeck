import { defineConfig } from 'vite'
import { resolve } from 'path'

/**
 * Standalone build for the RemoteDeck phone client (PWA).
 * Outputs a static bundle to out/remote/, which the Electron main process
 * serves over the embedded HTTP server. Kept separate from the electron-vite
 * main/preload/renderer builds so it never collides with them.
 *
 * Build with: npm run build:remote  (chained into `build` and `dist`).
 */
export default defineConfig({
  root: resolve(__dirname, 'src/remote'),
  base: './',
  // public/ (manifest, service worker, icons, offline.html) is copied verbatim
  publicDir: resolve(__dirname, 'src/remote/public'),
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  build: {
    outDir: resolve(__dirname, 'out/remote'),
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: resolve(__dirname, 'src/remote/index.html')
    }
  }
})
