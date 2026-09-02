import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'วังชิ้นฟาร์ม — ระบบสนับสนุนการผสมเทียมโคขุน',
        short_name: 'วังชิ้นฟาร์ม',
        description: 'บันทึกงานภาคสนามการผสมเทียมโคขุน สหกรณ์วังชิ้น — ทำงานได้แม้ไม่มีสัญญาณ',
        lang: 'th',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#FFFFFF',
        theme_color: '#15803D',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      // เปิด service worker ตอน dev ด้วย เพื่อทดสอบออฟไลน์บน localhost ได้ทันที
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
})
