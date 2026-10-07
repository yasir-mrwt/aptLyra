import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { publicMetadata } from './src/constants/seo'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), {
    name: 'aptlyra-metadata',
    transformIndexHtml() {
      return publicMetadata(loadEnv(mode, process.cwd(), 'VITE_').VITE_PUBLIC_URL)
        .map(tag => ({ ...tag, injectTo: 'head' as const }));
    },
  }],
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
}))
