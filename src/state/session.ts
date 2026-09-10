/** บัญชีผู้ใช้ที่กำลังใช้งานอยู่ */
import { create } from 'zustand'
import type { Role } from '../domain/types'

const KEY = 'wangchin.session'

export interface Account {
  userId: string
  name: string
  role: Role
  phone: string
  /** ดูได้อย่างเดียว — คณะกรรมการสหกรณ์ใช้สิทธิ์ระดับนี้ */
  readOnly: boolean
  /** เข้าหน้าตั้งค่าระบบและเครื่องมือผู้ดูแลได้ */
  isAdmin: boolean
}

/**
 * รายชื่อบัญชีในเครื่องนี้
 * เมื่อเชื่อม Supabase Auth แล้ว ให้แทนที่ด้วยข้อมูลจาก session จริง
 * และเปลี่ยนหน้าเข้าสู่ระบบเป็นอีเมล/รหัสผ่านตามที่ระบบรองรับ
 */
export const ACCOUNTS: Account[] = [
  { userId: 'u_husb', name: 'อนุชา วงศ์ใหญ่', role: 'husbandry', phone: '081-000-0002', readOnly: false, isAdmin: false },
  { userId: 'u_farmer', name: 'สมชาย ใจดี', role: 'farmer', phone: '081-000-0001', readOnly: false, isAdmin: false },
  { userId: 'u_coop', name: 'วิไล ศรีบุญเรือง', role: 'coop', phone: '081-000-0003', readOnly: false, isAdmin: true },
  // กรรมการสหกรณ์ใช้บัญชีเจ้าหน้าที่แบบดูอย่างเดียว ไม่ต้องมีบทบาทแยก
  { userId: 'u_board', name: 'ประสิทธิ์ คำมูล', role: 'coop', phone: '081-000-0004', readOnly: true, isAdmin: false },
]

/**
 * พากลับไปตั้งต้นที่หน้าแรกก่อนสลับบัญชี
 *
 * หน้าเข้าสู่ระบบอยู่นอก Router พอเข้าสู่ระบบใหม่ Router จึงถูกสร้างใหม่ทั้งตัว
 * แล้วอ่าน URL ที่ยังค้างอยู่บนแถบที่อยู่ ผู้ใช้เลยไปโผล่หน้าเดิมของบัญชีก่อนหน้า
 * ซึ่งบทบาทใหม่อาจไม่มีสิทธิ์เข้าด้วยซ้ำ จึงเจอการ์ด "ไม่มีสิทธิ์เข้าถึง" แทน
 */
function resetToHome() {
  try {
    if (window.location.pathname !== '/') window.history.replaceState(null, '', '/')
  } catch {
    // เบราว์เซอร์บางตัวในโหมดจำกัดสิทธิ์เขียนประวัติไม่ได้ ข้ามไปได้ ไม่กระทบการเข้าสู่ระบบ
  }
}

interface SessionState {
  account: Account | null
  ready: boolean
  signIn: (userId: string) => void
  signOut: () => void
  restore: () => void
}

export const useSession = create<SessionState>((set) => ({
  account: null,
  ready: false,
  restore() {
    let account: Account | null = null
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) account = ACCOUNTS.find((a) => a.userId === raw) ?? null
    } catch {
      // โหมดส่วนตัวอ่านค่าไม่ได้ ให้เข้าสู่ระบบใหม่
    }
    set({ account, ready: true })
  },
  signIn(userId) {
    const account = ACCOUNTS.find((a) => a.userId === userId) ?? null
    try {
      if (account) localStorage.setItem(KEY, account.userId)
    } catch {
      // จำข้ามรอบไม่ได้ก็ยังใช้งานรอบนี้ได้
    }
    resetToHome()
    set({ account })
  },
  signOut() {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // ไม่มีอะไรต้องทำ
    }
    resetToHome()
    set({ account: null })
  },
}))

/** ใช้ในหน้าที่การันตีแล้วว่าเข้าสู่ระบบอยู่ */
export function useAccount(): Account {
  const account = useSession((s) => s.account)
  if (!account) throw new Error('เรียกใช้ก่อนเข้าสู่ระบบ')
  return account
}
