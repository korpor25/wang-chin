/**
 * ห่อ Storage API ของเบราว์เซอร์ — แอปนี้เก็บงานภาคสนามไว้บนเครื่องก่อนเสมอ
 * จึงต้องรู้สองอย่าง: เหลือพื้นที่เท่าไหร่ และข้อมูลถูกจัดเป็นถาวรแล้วหรือยัง
 */

export interface Estimate {
  supported: boolean
  quota: number
  usage: number
  /** แยกตามชนิดที่เก็บ (Chromium เท่านั้น) เช่น indexedDB, caches, serviceWorkerRegistrations */
  details: Record<string, number>
}

export const EMPTY_ESTIMATE: Estimate = { supported: false, quota: 0, usage: 0, details: {} }

export async function estimate(): Promise<Estimate> {
  if (!navigator.storage?.estimate) return EMPTY_ESTIMATE
  const e = await navigator.storage.estimate()
  // usageDetails ยังไม่อยู่ใน lib.dom มาตรฐาน
  const details = (e as StorageEstimate & { usageDetails?: Record<string, number> }).usageDetails ?? {}
  return { supported: true, quota: e.quota ?? 0, usage: e.usage ?? 0, details }
}

/** ข้อมูลถูกจัดเป็น "persistent" แล้วหรือยัง — ถ้าใช่ ระบบจะไม่ลบทิ้งเองตอนพื้นที่ใกล้เต็ม */
export async function isPersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false
  return navigator.storage.persisted()
}

/**
 * ขอสิทธิ์ persistent storage
 * Chrome บน Android จะอนุมัติอัตโนมัติเมื่อเข้าเงื่อนไขอย่างใดอย่างหนึ่ง เช่น
 * ติดตั้งเป็นแอปลงโฮมสกรีน, ผู้ใช้บุ๊กมาร์ก, เข้าใช้บ่อย, หรืออนุญาต notification
 *
 * ยังไม่มีหน้าไหนเรียก — ต้องต่อเข้าหน้าตั้งค่าหรือขั้นตอนติดตั้งแอป
 * ไม่งั้นข้อมูลงานยังอยู่ในสถานะ best-effort ที่ระบบลบทิ้งได้
 */
export async function requestPersist(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}

