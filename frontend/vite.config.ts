import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      'roughjs/bin/rough': 'roughjs/bin/rough.js'
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    server: {
      deps: {
        inline: ['roughjs', '@excalidraw/excalidraw']
      }
    },
    env: {
      VITE_API_URL: 'http://localhost:5000/api'
    }
  }
})
