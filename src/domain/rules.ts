/**
 * กฎการคำนวณกำหนดการ (ค-01) และช่วงเวลาผสมที่เหมาะสม
 *
 * ทุกค่าที่ใช้คำนวณมาจาก BioParams ซึ่งปรับได้ผ่านหน้าตั้งค่า (ง-02)
 * ห้าม hard-code ตัวเลขไว้ในโค้ด เพราะที่ประชุมต้องปรับได้แล้วเทียบผลก่อน/หลัง
 */
import type { Animal, BioParams, Role, Task } from './types'

export const DEFAULT_PARAMS: BioParams = {
  voluntaryWaitDays: 45,
  uterusCheckDays: 30,
  readinessCheckDays: 45,
  estrusCycleDays: 21,
  estrusWindowHours: 18,
  goldenPeriodFromHours: 8,
  goldenPeriodToHours: 16,
  pregnancyCheckDays: 35,
  gestationDays: 283,
  bcsScaleMax: 9,
  bcsMinBeforeBreeding: 5,
  alertLeadDays: 2,
  escalateAfterDays: 3,
  semenWarnStraws: 12,
  semenCritStraws: 4,
}

export const PARAM_LABEL: Record<keyof BioParams, string> = {
  voluntaryWaitDays: 'ระยะพักหลังคลอดก่อนเข้าผสม',
  uterusCheckDays: 'ตรวจมดลูกหลังคลอด',
  readinessCheckDays: 'ตรวจความพร้อมก่อนเข้าโปรแกรม',
  estrusCycleDays: 'ความยาววงรอบการเป็นสัด',
  estrusWindowHours: 'ระยะเวลาที่แสดงอาการเป็นสัด',
  goldenPeriodFromHours: 'เริ่มช่วงผสมที่เหมาะสม (หลังเริ่มเป็นสัด)',
  goldenPeriodToHours: 'สิ้นสุดช่วงผสมที่เหมาะสม',
  pregnancyCheckDays: 'ตรวจท้องหลังผสม',
  gestationDays: 'ระยะตั้งท้อง',
  bcsScaleMax: 'ค่าสูงสุดของสเกล BCS',
  bcsMinBeforeBreeding: 'BCS ต่ำสุดที่ยอมให้เข้าผสม',
  alertLeadDays: 'แจ้งเตือนล่วงหน้า',
  escalateAfterDays: 'ส่งให้สหกรณ์ตาม เมื่อค้างเกิน',
  semenWarnStraws: 'น้ำเชื้อคงเหลือระดับเฝ้าระวัง (สีส้ม)',
  semenCritStraws: 'น้ำเชื้อคงเหลือระดับวิกฤต (สีแดง)',
}

export const PARAM_UNIT: Record<keyof BioParams, string> = {
  voluntaryWaitDays: 'วัน',
  uterusCheckDays: 'วัน',
  readinessCheckDays: 'วัน',
  estrusCycleDays: 'วัน',
  estrusWindowHours: 'ชั่วโมง',
  goldenPeriodFromHours: 'ชั่วโมง',
  goldenPeriodToHours: 'ชั่วโมง',
  pregnancyCheckDays: 'วัน',
  gestationDays: 'วัน',
  bcsScaleMax: 'คะแนน',
  bcsMinBeforeBreeding: 'คะแนน',
  alertLeadDays: 'วัน',
  escalateAfterDays: 'วัน',
  semenWarnStraws: 'หลอด',
  semenCritStraws: 'หลอด',
}

const DAY = 86_400_000
const HOUR = 3_600_000

export const addDays = (ts: number, d: number) => ts + d * DAY
export const addHours = (ts: number, h: number) => ts + h * HOUR

export interface DerivedTask {
  activityCode: string
  title: string
  dueAt: number
  toleranceDays: number
  assignedRole: Role
  priority: Task['priority']
  derivedFrom: string
}

/**
 * เหตุการณ์คลอด → สร้างกำหนดการทั้งรอบถัดไป
 * นี่คือจุดที่ทำให้ระบบ "คิดเอง" แทนที่จะรอให้คนจำเอง
 */
export function tasksAfterCalving(calvedAt: number, p: BioParams): DerivedTask[] {
  const d = (n: number) => new Date(calvedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ` + ${n} วัน`
  return [
    {
      activityCode: 'ก-03',
      title: 'ให้คะแนน BCS ณ วันคลอด',
      dueAt: calvedAt,
      toleranceDays: 1,
      assignedRole: 'husbandry',
      priority: 'high',
      derivedFrom: 'คลอด (จุดบันทึกบังคับ)',
    },
    {
      activityCode: 'ก-12',
      title: 'ป้อนนมน้ำเหลืองลูกโค ภายใน 12 ชม.',
      dueAt: addHours(calvedAt, 12),
      toleranceDays: 0,
      assignedRole: 'farmer',
      priority: 'high',
      derivedFrom: 'คลอด + 12 ชม.',
    },
    {
      activityCode: 'ก-13',
      title: 'สูญเขาและติดเบอร์หู RFID ลูกโค',
      dueAt: addDays(calvedAt, 14),
      toleranceDays: 3,
      assignedRole: 'husbandry',
      priority: 'normal',
      derivedFrom: d(14),
    },
    {
      activityCode: 'ก-04',
      title: 'ตรวจระบบสืบพันธุ์',
      dueAt: addDays(calvedAt, p.uterusCheckDays),
      toleranceDays: 5,
      assignedRole: 'husbandry',
      priority: 'normal',
      derivedFrom: d(p.uterusCheckDays),
    },
    {
      activityCode: 'ก-05',
      title: 'ตรวจความพร้อมก่อนเข้าโปรแกรมผสม',
      dueAt: addDays(calvedAt, p.readinessCheckDays),
      toleranceDays: 5,
      assignedRole: 'husbandry',
      priority: 'normal',
      derivedFrom: d(p.readinessCheckDays),
    },
    {
      activityCode: 'ก-07',
      title: 'เริ่มเฝ้าระวังการเป็นสัด',
      dueAt: addDays(calvedAt, p.voluntaryWaitDays),
      toleranceDays: 3,
      assignedRole: 'husbandry',
      priority: 'normal',
      derivedFrom: d(p.voluntaryWaitDays),
    },
  ]
}

/** เหตุการณ์ผสม → กำหนดตรวจท้อง และวันคาดว่าจะกลับเป็นสัดถ้าไม่ติด */
export function tasksAfterInsemination(bredAt: number, p: BioParams): DerivedTask[] {
  return [
    {
      activityCode: 'ก-07',
      title: 'เฝ้าระวังการกลับเป็นสัด (ถ้าไม่ติด)',
      dueAt: addDays(bredAt, p.estrusCycleDays),
      toleranceDays: 2,
      assignedRole: 'husbandry',
      priority: 'normal',
      derivedFrom: `ผสม + ${p.estrusCycleDays} วัน (หนึ่งวงรอบ)`,
    },
    {
      activityCode: 'ก-09',
      title: 'ตรวจท้อง',
      dueAt: addDays(bredAt, p.pregnancyCheckDays),
      toleranceDays: 5,
      assignedRole: 'husbandry',
      priority: 'high',
      derivedFrom: `ผสม + ${p.pregnancyCheckDays} วัน`,
    },
  ]
}

/** ยืนยันตั้งท้อง → กำหนดเตรียมคอก และวันคลอดคาดการณ์ */
export function tasksAfterPregnancy(bredAt: number, p: BioParams): DerivedTask[] {
  const calving = addDays(bredAt, p.gestationDays)
  return [
    {
      activityCode: 'ก-03',
      title: 'ให้คะแนน BCS ช่วงตั้งท้อง',
      dueAt: addDays(bredAt, Math.round(p.gestationDays / 2)),
      toleranceDays: 10,
      assignedRole: 'husbandry',
      priority: 'low',
      derivedFrom: 'กึ่งกลางระยะตั้งท้อง',
    },
    // งานย้ายกลุ่มอาหารก่อนคลอด (ข-04) ยกไปพร้อมภาค ข ในเฟสถัดไป
    {
      activityCode: 'ก-11',
      title: 'เตรียมโคและคอกคลอด',
      dueAt: addDays(calving, -7),
      toleranceDays: 3,
      assignedRole: 'farmer',
      priority: 'high',
      derivedFrom: 'คลอดคาดการณ์ − 7 วัน',
    },
    {
      activityCode: 'ก-02',
      title: 'กำหนดคลอดคาดการณ์',
      dueAt: calving,
      toleranceDays: 7,
      assignedRole: 'husbandry',
      priority: 'high',
      derivedFrom: `ผสม + ${p.gestationDays} วัน`,
    },
  ]
}

/**
 * เกษตรกรแจ้งการคลอด (ก-01) → งานให้สัตวบาลเข้ายืนยันและบันทึกผลการคลอด
 * ถ้าไม่มีงานใบนี้ การแจ้งของเกษตรกรจะจบลงเป็นแค่ข้อความ ไม่มีใครถูกมอบหมายให้ไปดูจริง
 */
export function taskConfirmCalving(foundAt: number, reporter: string): DerivedTask {
  return {
    activityCode: 'ก-02',
    title: 'ยืนยันการคลอดและบันทึกผลการคลอด',
    dueAt: foundAt,
    toleranceDays: 1,
    assignedRole: 'husbandry',
    priority: 'high',
    derivedFrom: `เกษตรกรแจ้งการคลอด (${reporter})`,
  }
}

/**
 * เกษตรกรแจ้งอาการเป็นสัด (ก-07) → งานให้สัตวบาลยืนยันว่าเป็นสัดจริงหรือสัดหลอก
 * ที่ประชุมระบุว่าต้องมีขั้นยืนยันก่อน ไม่ใช่สร้างงานผสมจากคำแจ้งของเกษตรกรตรง ๆ
 * งานยืนยันจึงถึงกำหนดก่อนช่วงผสมที่เหมาะสมจะเริ่ม เพื่อให้ยังทันรอบนี้
 */
export function taskConfirmHeat(observedAt: number, p: BioParams, reporter: string): DerivedTask {
  return {
    activityCode: 'ก-07',
    title: 'ยืนยันอาการเป็นสัดที่เกษตรกรแจ้ง',
    dueAt: addHours(observedAt, Math.max(0, p.goldenPeriodFromHours - 2)),
    toleranceDays: 1,
    assignedRole: 'husbandry',
    priority: 'high',
    derivedFrom: `เกษตรกรแจ้งอาการเป็นสัด (${reporter})`,
  }
}

/** ยืนยันแล้วว่าเป็นสัดจริง → งานผสมภายในช่วงที่เหมาะสม */
export function taskInseminate(observedAt: number, p: BioParams): DerivedTask {
  return {
    activityCode: 'ก-08',
    title: 'ผสมเทียมภายในช่วงที่เหมาะสม',
    dueAt: addHours(observedAt, p.goldenPeriodFromHours),
    toleranceDays: 1,
    assignedRole: 'husbandry',
    priority: 'high',
    derivedFrom: `พบอาการเป็นสัด + ${p.goldenPeriodFromHours} ชม.`,
  }
}

/**
 * รหัสสีของสต๊อกน้ำเชื้อ เขียว → ส้ม → แดง (มติ [33:41])
 * เกณฑ์อยู่ใน BioParams จึงปรับได้เมื่อที่ประชุมยืนยันตัวเลขจริง
 */
export function semenTone(strawsLeft: number, p: BioParams): 'ok' | 'warn' | 'crit' {
  if (strawsLeft <= p.semenCritStraws) return 'crit'
  if (strawsLeft <= p.semenWarnStraws) return 'warn'
  return 'ok'
}

export interface GoldenPeriod {
  from: number
  to: number
  state: 'before' | 'now' | 'passed'
  hoursUntil: number
}

/**
 * ช่วงเวลาผสมที่เหมาะสมนับจากเวลาที่เริ่มแสดงอาการเป็นสัด
 * ถ้าเลยช่วงนี้ไปแล้วโอกาสผสมติดตกลงอย่างมีนัยสำคัญ
 */
export function goldenPeriod(heatAt: number, p: BioParams, now = Date.now()): GoldenPeriod {
  const from = addHours(heatAt, p.goldenPeriodFromHours)
  const to = addHours(heatAt, p.goldenPeriodToHours)
  const state = now < from ? 'before' : now <= to ? 'now' : 'passed'
  return { from, to, state, hoursUntil: Math.round((from - now) / HOUR) }
}

/** วันคาดว่าจะกลับเป็นสัดครั้งถัดไป ใช้ตั้งช่วงเฝ้าระวัง */
export function nextHeatWindow(lastHeatAt: number, p: BioParams) {
  const center = addDays(lastHeatAt, p.estrusCycleDays)
  return { from: addDays(center, -2), center, to: addDays(center, 2) }
}

/** ตรวจว่าโคตัวนี้ห้ามผสมด้วยเหตุผลใดบ้าง ใช้กันการบันทึกที่ผิดกฎ */
export function breedingBlockers(a: Animal, p: BioParams, now = Date.now()): string[] {
  const out: string[] = []
  if (a.sex !== 'female') out.push('ไม่ใช่เพศเมีย')
  if (a.stage === 'pregnant') out.push('อยู่ระหว่างตั้งท้อง')
  if (a.stage === 'culled') out.push('ถูกคัดออกแล้ว')
  if (a.stage === 'problem') out.push('อยู่ระหว่างฟื้นฟู ยังไม่ผ่านการตรวจความพร้อม')
  if (a.withdrawalUntil && a.withdrawalUntil > now) out.push('อยู่ระหว่างระยะหยุดยา')
  if (a.lastBcs !== null && a.lastBcs < p.bcsMinBeforeBreeding)
    out.push(`BCS ${a.lastBcs} ต่ำกว่าเกณฑ์ ${p.bcsMinBeforeBreeding}`)
  if (a.lastCalvingAt && now < addDays(a.lastCalvingAt, p.voluntaryWaitDays))
    out.push(`ยังไม่พ้นระยะพักหลังคลอด ${p.voluntaryWaitDays} วัน`)
  return out
}

