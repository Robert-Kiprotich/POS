// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/static/fe/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      moment: 'moment/moment.js'
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: 'all',
    proxy: {
      
      '/api/pos/': {
        target: 'http://0.0.0.0:8000',
        changeOrigin: true,
      },
       '/users': {
        target: 'http://0.0.0.0:8000',
        changeOrigin: true,
      },
      
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
}))
