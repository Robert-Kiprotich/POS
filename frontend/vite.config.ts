
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => ({
  // Django static path in production
  base: command === 'build' ? '/static/fe/' : '/',

  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

     manifest: {
  name: 'Super POS',
  short_name: 'Super POS',
  description: 'Point of Sale System',
  display: 'standalone',
  theme_color: '#0d47a1',
  background_color: '#ffffff',
  icons: [
    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
},

      workbox: {
        // Fix: allow larger JavaScript bundles in the precache
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

        // Offline application shell
        navigateFallback: '/index.html',

        // Do not serve the application shell for API requests
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/users(?:\/|$)/,
        ],

        // Files to precache
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,woff,woff2}',
        ],
      },
    }),
  ],

  resolve: {
    alias: {
      moment: 'moment/moment.js',
    },
  },

  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: 'all',

    proxy: {
      '/api/pos/': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },

      '/api/reports/': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },

      '/users': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
}))

