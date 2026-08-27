import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Prevent ResizeObserver loop errors from crashing Vite's error overlay
    hmr: {
      overlay: true,
    },
  },
  build: {
    // Target browsers that support modern features but include Safari
    target: ['es2020', 'chrome90', 'firefox90', 'safari14'],
  },
})
