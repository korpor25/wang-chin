/** บัญชีผู้ใช้ที่กำลังใช้งานอยู่ — ยืนยันตัวตนจริงผ่าน API (/auth/login) แล้วถือ JWT ไว้ */
import { create } from 'zustand'
import type { Role } from '../domain/types'

const KEY = 'wangchin.session'

/** ปลายทาง API เดียวกับที่ตัวซิงค์ใช้ */
const IS_DEV = import.meta.env?.DEV ?? false
const API_URL = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const PUBLIC_PRESENTATION_LOGIN = import.meta.env?.VITE_PUBLIC_PRESENTATION_LOGIN === 'true'

export interface Account {
  userId: string
  name: string
  role: Role
  phone: string
  /** ดูได้อย่างเดียว — คณะกรรมการสหกรณ์ใช้สิทธิ์ระดับนี้ */
  readOnly: boolean
  /** เข้าหน้าตั้งค่าระบบและเครื่องมือผู้ดูแลได้ */
  isAdmin: boolean
  /** ฟาร์มที่ผูกกับบัญชี (เกษตรกรเห็นเฉพาะของตัวเอง — SEC-01) */
  farmIds: string[]
  active: boolean
  /** JWT จาก backend — แนบไปกับทุกคำขอที่ต้องยืนยันตัวตน */
  token: string
  /** บัญชีเดโมในเครื่อง ไม่ส่งคำขอที่ต้องยืนยันตัวตนไป backend */
  demo?: boolean
}

/**
 * บัญชีนำเสนอที่ใช้รหัสร่วมกัน — เมื่อเปิดบน production ทุกคนจะเห็นข้อมูลรับรองนี้
 */
export interface DemoAccount {
  name: string
  role: Role
  phone: string
  readOnly: boolean
  isAdmin: boolean
  password: string
}

export const DEMO_LOGIN_ENABLED = IS_DEV || (Boolean(API_URL) && PUBLIC_PRESENTATION_LOGIN)
export const DEMO_LOGIN_USES_API = Boolean(API_URL)

export const DEMO_ACCOUNTS: DemoAccount[] = DEMO_LOGIN_ENABLED ? [
  { name: 'อนุชา วงศ์ใหญ่', role: 'husbandry', phone: '0810000002', readOnly: false, isAdmin: false, password: '123456' },
  { name: 'สมชาย ใจดี', role: 'farmer', phone: '0810000001', readOnly: false, isAdmin: false, password: '123456' },
  { name: 'วิไล ศรีบุญเรือง', role: 'coop', phone: '0810000003', readOnly: false, isAdmin: true, password: '123456' },
  { name: 'ประสิทธิ์ คำมูล', role: 'coop', phone: '0810000004', readOnly: true, isAdmin: false, password: '123456' },
] : []

/**
 * พากลับไปตั้งต้นที่หน้าแรกก่อนสลับบัญชี
 * หน้าเข้าสู่ระบบอยู่นอก Router พอเข้าสู่ระบบใหม่ Router จึงถูกสร้างใหม่ทั้งตัว
 * แล้วอ่าน URL ที่ยังค้างอยู่ ผู้ใช้เลยไปโผล่หน้าเดิมของบัญชีก่อนหน้าที่อาจไม่มีสิทธิ์
 */
function resetToHome() {
  try {
    if (window.location.pathname !== '/') window.history.replaceState(null, '', '/')
  } catch {
    // เบราว์เซอร์บางตัวในโหมดจำกัดสิทธิ์เขียนประวัติไม่ได้ ข้ามไปได้
  }
}

const onlyDigits = (s: string) => s.replace(/\D/g, '')

interface SessionState {
  account: Account | null
  ready: boolean
  loading: boolean
  error: string | null
  /** เข้าสู่ระบบด้วยเบอร์โทร+รหัสผ่าน คืน true เมื่อสำเร็จ */
  signIn: (phone: string, password: string) => Promise<boolean>
  /** เข้าใช้บัญชีเดโมในเครื่องพัฒนา โดยไม่เรียก backend */
  signInDemo: (phone: string, password: string) => Promise<boolean>
  signOut: () => void
  restore: () => void
}

export const useSession = create<SessionState>((set, get) => ({
  account: null,
  ready: false,
  loading: false,
  error: null,

  restore() {
    let account: Account | null = null
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) account = JSON.parse(raw) as Account
    } catch {
      // โหมดส่วนตัวอ่านค่าไม่ได้ ให้เข้าสู่ระบบใหม่
    }
    set({ account, ready: true })
  },

  async signIn(phone, password) {
    const digits = onlyDigits(phone)
    if (!API_URL) {
      if (!IS_DEV) {
        set({ loading: false, error: 'ระบบเข้าสู่ระบบยังไม่ได้ตั้งค่า ติดต่อผู้ดูแลระบบ' })
        return false
      }
      return get().signInDemo(digits, password)
    }

    set({ loading: true, error: null })

    // โหมดจริง — ยืนยันตัวตนที่เซิร์ฟเวอร์แล้วรับ JWT
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: digits, password }),
      })
      if (!res.ok) {
        set({ loading: false, error: 'เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง' })
        return false
      }
      const body = (await res.json()) as {
        data: { token: string; user: Omit<Account, 'token'> & { id: string } }
      }
      const u = body.data.user
      const account: Account = {
        userId: u.id,
        name: u.name,
        role: u.role,
        phone: u.phone,
        readOnly: u.readOnly,
        isAdmin: u.isAdmin,
        farmIds: u.farmIds ?? [],
        active: u.active,
        token: body.data.token,
      }
      persist(account)
      resetToHome()
      set({ account, loading: false, error: null })
      return true
    } catch {
      set({ loading: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบว่า API ทำงานอยู่' })
      return false
    }
  },

  async signInDemo(phone, password) {
    set({ loading: true, error: null })
    if (!IS_DEV) {
      set({ loading: false, error: 'บัญชีเดโมใช้ได้เฉพาะโหมดพัฒนา' })
      return false
    }

    const digits = onlyDigits(phone)
    const demo = DEMO_ACCOUNTS.find((a) => a.phone === digits)
    if (!demo || password !== demo.password) {
      set({ loading: false, error: 'เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง' })
      return false
    }

    const account: Account = {
      userId: `demo_${demo.phone}`,
      name: demo.name,
      role: demo.role,
      phone: demo.phone,
      readOnly: demo.readOnly,
      isAdmin: demo.isAdmin,
      farmIds: demo.role === 'farmer' ? ['farm_1'] : [],
      active: true,
      token: '',
      demo: true,
    }
    persist(account)
    resetToHome()
    set({ account, loading: false, error: null })
    return true
  },

  signOut() {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // ไม่มีอะไรต้องทำ
    }
    resetToHome()
    set({ account: null, error: null })
  },
}))

function persist(account: Account) {
  try {
    localStorage.setItem(KEY, JSON.stringify(account))
  } catch {
    // จำข้ามรอบไม่ได้ก็ยังใช้งานรอบนี้ได้
  }
}

/** โทเคนปัจจุบันสำหรับแนบใน Authorization header (ใช้จากนอก React ได้ เช่นตัวซิงค์) */
export function authToken(): string | null {
  const t = useSession.getState().account?.token
  return t ? t : null
}

/** ให้ตัวซิงค์แจ้งเมื่อโทเคนหมดอายุ/ไม่ถูกต้อง (401) → บังคับเข้าสู่ระบบใหม่ */
export function forceSignOut() {
  useSession.getState().signOut()
}

/** ใช้ในหน้าที่การันตีแล้วว่าเข้าสู่ระบบอยู่ */
export function useAccount(): Account {
  const account = useSession((s) => s.account)
  if (!account) throw new Error('เรียกใช้ก่อนเข้าสู่ระบบ')
  return account
}
