/** โครงหน้าจอหลัก — หัวแอป สถานะเครือข่าย เมนูผู้ใช้ และแถบเมนูหลัก */
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import {
  Beef,
  CircleAlert,
  ClipboardPlus,
  Download,
  Home,
  LayoutGrid,
  ListChecks,
  LogOut,
  RefreshCw,
  WifiOff,
  X,
} from 'lucide-react'
import { useSession } from '../state/session'
import { ROLE_LABEL } from '../domain/types'
import { runSync, syncSnapshot, type SyncSnapshot } from '../data/sync'
import { age } from '../lib/format'
import { Toasts, toast } from './Toast'

const TABS = [
  { to: '/', label: 'หน้าแรก', Icon: Home, end: true },
  { to: '/animals', label: 'ฝูงโค', Icon: Beef, end: false },
  { to: '/record', label: 'บันทึก', Icon: ClipboardPlus, end: false },
  { to: '/tasks', label: 'งาน', Icon: ListChecks, end: false },
  { to: '/more', label: 'เพิ่มเติม', Icon: LayoutGrid, end: false },
]

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function AppShell() {
  const account = useSession((s) => s.account)!
  const signOut = useSession((s) => s.signOut)
  const loc = useLocation()
  const [snap, setSnap] = useState<SyncSnapshot | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [installHidden, setInstallHidden] = useState(false)

  useEffect(() => {
    let alive = true
    const refresh = () => void syncSnapshot().then((s) => alive && setSnap(s))
    refresh()
    const id = setInterval(refresh, 5000)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [loc.pathname])

  // ปิดชีตเมื่อเปลี่ยนหน้า และเลื่อนขึ้นบนสุดเหมือนแอปทั่วไป
  useEffect(() => {
    setMenu(false)
    window.scrollTo(0, 0)
  }, [loc.pathname])

  // ชวนติดตั้งลงหน้าจอโฮม — จำเป็นกับการใช้งานออฟไลน์ระยะยาว
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  // ซิงค์อัตโนมัติเมื่อกลับมาออนไลน์
  useEffect(() => {
    const onOnline = async () => {
      const s = await syncSnapshot()
      if (s.pending === 0) return
      const out = await runSync()
      if (out.succeeded > 0) toast.ok(`ส่งข้อมูลขึ้นระบบแล้ว ${out.succeeded} รายการ`)
      setSnap(await syncSnapshot())
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  async function sync() {
    setSyncing(true)
    const out = await runSync()
    setSnap(await syncSnapshot())
    setSyncing(false)
    if (out.succeeded > 0) toast.ok(`ส่งขึ้นระบบแล้ว ${out.succeeded} รายการ`)
    if (out.failed > 0) toast.error(`ส่งไม่สำเร็จ ${out.failed} รายการ จะลองใหม่ให้อัตโนมัติ`)
  }

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    setInstallEvent(null)
    if (outcome === 'accepted') toast.ok('ติดตั้งแอปแล้ว')
  }

  const pending = (snap?.pending ?? 0) + (snap?.failed ?? 0) + (snap?.conflict ?? 0)
  const offline = snap ? !snap.online : false

  return (
    <div className="shell">
      <header className="shell-head">
        <div className="shell-head-row">
          <img src="/pwa-192.png" alt="" />
          <div style={{ minWidth: 0 }}>
            <div className="shell-title">วังชิ้นฟาร์ม</div>
            <div className="shell-sub">
              {account.name} · {ROLE_LABEL[account.role]}
            </div>
          </div>
          <button className="avatar" onClick={() => setMenu(true)} aria-label="บัญชีผู้ใช้">
            {account.name.charAt(0)}
          </button>
        </div>
      </header>

      <nav className="tabbar">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'on' : '')}>
            <Icon strokeWidth={1.8} />
            <span>{label}</span>
            {to === '/more' && pending > 0 && (
              <span className="dot">{pending > 99 ? '99+' : pending}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <main className="shell-body">
        {snap && (offline || pending > 0) && (
          <div className={`statusbar ${offline ? 'offline' : 'online'}`}>
            {offline ? <WifiOff size={15} /> : <RefreshCw size={15} />}
            <span>
              {offline ? 'ออฟไลน์ — บันทึกลงเครื่องไว้ก่อน' : 'ออนไลน์'}
              {pending > 0 && ` · ค้างส่ง ${pending} รายการ`}
              {snap.oldestPendingAt && ` · เก่าสุด ${age(snap.oldestPendingAt)}`}
            </span>
            {!offline && pending > 0 && (
              <button onClick={() => void sync()} disabled={syncing}>
                {syncing ? 'กำลังส่ง…' : 'ส่งเลย'}
              </button>
            )}
          </div>
        )}

        {snap && snap.conflict > 0 && (
          <div className="statusbar offline">
            <CircleAlert size={15} />
            <span>มี {snap.conflict} รายการขัดแย้งกับระบบ ต้องเลือกว่าจะเก็บฉบับไหน</span>
          </div>
        )}

        {installEvent && !installHidden && (
          <div className="install">
            <Download size={16} style={{ flex: 'none' }} />
            <span>ติดตั้งลงหน้าจอโฮมเพื่อใช้งานออฟไลน์ได้เต็มที่</span>
            <button onClick={() => void install()}>ติดตั้ง</button>
            <button className="x" onClick={() => setInstallHidden(true)} aria-label="ปิด">
              <X size={15} />
            </button>
          </div>
        )}

        <Outlet />
      </main>

      {menu && (
        <button className="sheet-backdrop" onClick={() => setMenu(false)} aria-label="ปิดเมนู">
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{account.name}</h2>
            <p className="sheet-sub">
              {ROLE_LABEL[account.role]}
              {account.readOnly && ' · ดูอย่างเดียว'}
              {account.isAdmin && ' · ผู้ดูแลระบบ'} · {account.phone}
            </p>
            <div className="row" style={{ marginTop: 4 }}>
              <button
                className="btn ghost"
                onClick={() => {
                  signOut()
                  setMenu(false)
                }}
              >
                <LogOut size={16} /> ออกจากระบบ
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 12 }}>
              ข้อมูลที่ยังไม่ได้ส่งขึ้นระบบจะยังอยู่ในเครื่องหลังออกจากระบบ
              และส่งต่อได้เมื่อเข้าสู่ระบบอีกครั้ง
            </p>
          </div>
        </button>
      )}

      <Toasts />
    </div>
  )
}
