import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './fonts.css'
import './index.css'
import './app.css'

// service worker ทำให้แอปเปิดได้ตอนไม่มีเน็ต และเป็นเงื่อนไขให้ติดตั้งเป็น PWA ได้
registerSW({
  immediate: true,
  onRegisterError(error) {
    console.error('ลงทะเบียน service worker ไม่สำเร็จ', error)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
