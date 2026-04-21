import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    publicDir: resolve('src/renderer/src/public'),
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three', '@react-three/fiber', '@react-three/drei'],
            motion: ['framer-motion'],
            flow: ['reactflow'],
            map: ['leaflet', 'react-leaflet'],
            charts: ['recharts'],
            editor: ['@monaco-editor/react']
          }
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
