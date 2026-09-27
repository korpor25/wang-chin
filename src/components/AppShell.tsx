/** โครงหน้าจอหลัก — หัวแอป สถานะเครือข่าย เมนูผู้ใช้ และแถบเมนูหลัก */
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import {
  Beef,
  Bell,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  ClipboardPlus,
  Download,
  Home,
  LayoutGrid,
  ListChecks,
  LogOut,
  RefreshCw,
  TriangleAlert,
  WifiOff,
  X,
} from 'lucide-react'
import { db } from '../data/db'
import { useSession } from '../state/session'
import { ROLE_LABEL, type Role } from '../domain/types'
import { getRetention, runSync, runSyncAll, syncSnapshot, type RetentionPolicy, type SyncSnapshot } from '../data/sync'
import { age } from '../lib/format'
import { Toasts, toast } from './Toast'

/**
 * แถบเมนูหลักแยกตามบทบาท (SEC-02)
 *
 * เจ้าหน้าที่สหกรณ์ไม่มีกิจกรรมภาค ก ที่ต้องกรอกเองเลยสักรายการ
 * ช่อง "บันทึก" จึงพาไปหน้าที่กดอะไรไม่ได้ ของเจ้าหน้าที่เป็น "มอบหมาย" แทน
 * ซึ่งตรงกับบทบาทจริงในเฟสนี้คือมอบหมายและติดตาม
 */
function tabsFor(role: Role) {
  const mid =
    role === 'coop'
      ? { to: '/assign', label: 'มอบหมาย', Icon: ClipboardList, end: false }
      : { to: '/record', label: 'บันทึก', Icon: ClipboardPlus, end: false }
  return [
    { to: '/', label: 'หน้าหลัก', Icon: Home, end: true },
    { to: '/animals', label: 'ฝูงโค', Icon: Beef, end: false },
    mid,
    { to: '/tasks', label: 'งาน', Icon: ListChecks, end: false },
    { to: '/more', label: 'เพิ่มเติม', Icon: LayoutGrid, end: false },
  ]
}

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
  const [unread, setUnread] = useState(0)
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null)

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

  // จำนวนแจ้งเตือนที่ยังไม่ได้อ่าน ใช้กับกระดิ่งบนหัวแอป
  useEffect(() => {
    let alive = true
    void db.alerts
      .filter(
        (a) =>
          a.toRole === account.role &&
          (!a.toUser || a.toUser === account.userId) &&
          a.readAt === null &&
          a.resolvedAt === null,
      )
      .count()
      .then((n) => alive && setUnread(n))
    return () => {
      alive = false
    }
  }, [account.role, account.userId, loc.pathname])

  // ปิดชีตเมื่อเปลี่ยนหน้า และเลื่อนขึ้นบนสุดเหมือนแอปทั่วไป
  useEffect(() => {
    setMenu(false)
    window.scrollTo(0, 0)
  }, [loc.pathname])

  useEffect(() => {
    void getRetention().then(setPolicy)
  }, [])

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
      if (s.outbox === 0) return
      const out = await runSync()
      if (out.succeeded > 0) toast.ok(`ส่งข้อมูลขึ้นระบบแล้ว ${out.succeeded} รายการ`)
      setSnap(await syncSnapshot())
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  async function sync() {
    if (syncing) return
    if (offline) {
      toast.error('ยังไม่มีสัญญาณ ข้อมูลเก็บไว้ในเครื่องแล้ว จะส่งให้เองเมื่อกลับมาออนไลน์')
      return
    }
    // อ่านคิวใหม่ตอนกด — ค่าที่แสดงอยู่อาจช้ากว่าคิวจริงได้ถึง 5 วินาที
    const fresh = await syncSnapshot()
    setSnap(fresh)
    if (fresh.outbox === 0) {
      toast.ok('ส่งข้อมูลครบแล้ว ไม่มีรายการค้าง')
      return
    }
    setSyncing(true)
    const out = await runSyncAll()
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

  /**
   * นับจากคิวส่งทั้งหมด (บันทึก งาน รูป โค ฟาร์ม) บวกรายการที่ขัดแย้ง
   * เดิมนับแค่บันทึกกิจกรรม แถบเลยขึ้นว่าส่งครบแล้วทั้งที่ยังมีงานค้างในคิว และปุ่มส่งก็ไม่ยอมส่ง
   */
  const pending = (snap?.outbox ?? 0) + (snap?.conflict ?? 0)
  const offline = snap ? !snap.online : false

  /**
   * OFF-07 — ค้างเกินจำนวนหรือค้างนานเกินเกณฑ์ ต้องเห็นตั้งแต่แถบบนสุด
   * ไม่ใช่ต้องเข้าไปหาในศูนย์ซิงค์ เพราะคนหน้างานไม่ได้เปิดหน้านั้นทุกวัน
   */
  const overLimit = Boolean(
    policy &&
      snap &&
      (snap.outbox > policy.warnPendingOver ||
        (snap.oldestPendingAt !== null &&
          Date.now() - snap.oldestPendingAt > policy.warnAgeHours * 3_600_000)),
  )

  return (
    <div className="shell">
      <header className="shell-head">
        <div className="shell-head-row">
          <span className="brand-mark">
            <img src="/logo-96.png" alt="" />
          </span>
          <div className="shell-head-main">
            <div className="shell-title">สหกรณ์การเกษตรวังชิ้น จำกัด</div>
            <div className="shell-sub">
              {account.name} · {ROLE_LABEL[account.role]}
            </div>
          </div>
          {/* กระดิ่งอยู่คู่กับปุ่มบัญชีตามดีไซน์ กดแล้วไปกล่องแจ้งเตือนโดยตรง */}
          <Link className="bell" to="/alerts" aria-label={`แจ้งเตือน${unread > 0 ? ` ${unread} รายการ` : ''}`}>
            <Bell size={18} />
            {unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
          </Link>
          <button className="avatar" onClick={() => setMenu(true)} aria-label="บัญชีผู้ใช้">
            {account.name.charAt(0)}
          </button>
        </div>
      </header>

      <nav className="tabbar">
        {tabsFor(account.role).map(({ to, label, Icon, end }) => (
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
        {/* แถบสถานะโชว์ทุกหน้าพร้อมปุ่มส่งข้อมูลตัวใหญ่ ผู้สูงอายุไม่ต้องไล่หาศูนย์ซิงค์ในเมนูเพิ่มเติม */}
        {snap && (
          <Link
            className={`statusbar ${overLimit ? 'alert' : offline ? 'offline' : pending > 0 ? 'online' : 'synced'}`}
            to="/sync"
          >
            {overLimit ? (
              <TriangleAlert size={15} />
            ) : offline ? (
              <WifiOff size={15} />
            ) : pending > 0 ? (
              <RefreshCw size={15} />
            ) : (
              <CircleCheck size={15} />
            )}
            <span>
              {offline ? 'ออฟไลน์ — บันทึกลงเครื่องไว้ก่อน' : pending > 0 ? 'ออนไลน์' : 'ข้อมูลขึ้นระบบครบแล้ว'}
              {pending > 0 && ` · ค้างส่ง ${pending} รายการ`}
              {pending > 0 && snap.oldestPendingAt && ` · เก่าสุด ${age(snap.oldestPendingAt)}`}
              {overLimit && ' · เกินเกณฑ์ที่ตั้งไว้'}
            </span>
            {!offline && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  void sync()
                }}
                disabled={syncing}
              >
                <RefreshCw size={15} className={syncing ? 'spin' : undefined} />
                {syncing ? 'กำลังส่ง…' : 'ส่งข้อมูล'}
              </button>
            )}
          </Link>
        )}

        {snap && snap.conflict > 0 && (
          <div className="statusbar offline">
            <CircleAlert size={15} />
            <span>มี {snap.conflict} รายการขัดแย้งกับระบบ ต้องเลือกว่าจะเก็บฉบับไหน</span>
          </div>
        )}

        {installEvent && !installHidden && (
          <div className="install">
            <Download size={16} className="ic" />
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
            <div className="row tight">
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
            <p className="sheet-foot">
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
