import { defineConfig, loadEnv } from 'vite'
import { cloudConfiguration } from './src/cloud/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = '/kitaplanio-mini/'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_SUPABASE_')
  const config = cloudConfiguration(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
  if (config.mode === 'invalid') throw new Error(config.message)
  return {
  base,
  build: { rollupOptions: { output: { manualChunks: { supabase: ['@supabase/supabase-js'] } } } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      scope: base,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'caro.',
        short_name: 'caro.',
        description: 'caro. – Mit Herz geplant. Dein Kita-Alltag im Überblick.',
        lang: 'de',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#FFF9F4',
        theme_color: '#5A1F5B',
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  }
})
