import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'สหกรณ์การเกษตรวังชิ้น จำกัด — ระบบสนับสนุนการผสมเทียมโคขุน',
        // ชื่อใต้ไอคอนบนโฮมสกรีน ระบบปฏิบัติการตัดที่ราว 12 ตัวอักษร ใช้ชื่อย่อจึงอ่านออก
        short_name: 'สหกรณ์วังชิ้น',
        description: 'บันทึกงานภาคสนามการผสมเทียมโคขุน สหกรณ์การเกษตรวังชิ้น จำกัด — ทำงานได้แม้ไม่มีสัญญาณ',
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
        // ไม่รวม .glb ไว้ในชุดที่แคชตั้งแต่แรก โมเดล 3 มิติหนักกว่าทั้งแอปรวมกัน
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // ตัวแสดงผล 3 มิติหนัก 1 MB และใช้เฉพาะตอนกดดูโมเดล จึงไม่เอาเข้าชุดแคชตั้งต้น
        globIgnores: ['**/model-viewer-*.js'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // ตัวแสดงผล 3 มิติ เก็บไว้หลังโหลดครั้งแรก จะได้เปิดดูซ้ำได้ตอนไม่มีสัญญาณ
            urlPattern: /model-viewer-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'model-viewer',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // โหลดครั้งแรกตอนผู้ใช้กดดู แล้วเก็บไว้ใช้ต่อได้แม้ออฟไลน์
            urlPattern: /\/models\/.*\.glb$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'models-3d',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // เปิด service worker ตอน dev ด้วย เพื่อทดสอบออฟไลน์บน localhost ได้ทันที
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
})
