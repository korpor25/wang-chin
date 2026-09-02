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
  dryOffBeforeCalvingDays: 60,
  bcsScaleMax: 9,
  bcsMinBeforeBreeding: 5,
  alertLeadDays: 2,
  escalateAfterDays: 3,
}

export const PARAM_LABEL: Record<keyof BioParams, string> = {
  voluntaryWaitDays: 'ระยะพักหลังคลอดก่อนเข้าผสม',
  uterusCheckDays: 'ตรวจมดลูกหลังคลอด',
  readinessCheckDays: 'ตรวจความพร้อมก่อนเข้าโปรแกรม',
  estrusCycleDays: 'ความยาววงรอบการเป็นสัด',
  estrusWindowHours: 'ระยะเวลาที่แสดงอาการเป็นสัด',
  goldenPeriodFromHours: 'เริ่มช่วงผสมที่เหมาะสม (หลังเริ่มเป็นสัด)',
  goldenPeriodToHours: 'สิ้นสุดช่วงผสมที่เหมาะสม',
  pregnancyCheckDays: 'ตรวจครรภ์หลังผสม',
  gestationDays: 'ระยะตั้งท้อง',
  dryOffBeforeCalvingDays: 'เริ่มพักก่อนคลอด',
  bcsScaleMax: 'ค่าสูงสุดของสเกล BCS',
  bcsMinBeforeBreeding: 'BCS ต่ำสุดที่ยอมให้เข้าผสม',
  alertLeadDays: 'แจ้งเตือนล่วงหน้า',
  escalateAfterDays: 'ยกระดับเมื่อเลยกำหนดเกิน',
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
  dryOffBeforeCalvingDays: 'วัน',
  bcsScaleMax: 'คะแนน',
  bcsMinBeforeBreeding: 'คะแนน',
  alertLeadDays: 'วัน',
  escalateAfterDays: 'วัน',
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
      activityCode: 'ก-04',
      title: 'ตรวจอวัยวะสืบพันธุ์หลังคลอด',
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

/** เหตุการณ์ผสม → กำหนดตรวจครรภ์ และวันคาดว่าจะกลับเป็นสัดถ้าไม่ติด */
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
      title: 'ตรวจครรภ์',
      dueAt: addDays(bredAt, p.pregnancyCheckDays),
      toleranceDays: 5,
      assignedRole: 'husbandry',
      priority: 'high',
      derivedFrom: `ผสม + ${p.pregnancyCheckDays} วัน`,
    },
  ]
}

/** ยืนยันตั้งท้อง → กำหนดพักก่อนคลอด เตรียมคอก และวันคลอดคาดการณ์ */
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
    {
      activityCode: 'ข-04',
      title: 'ย้ายกลุ่มอาหารเข้าระยะพักก่อนคลอด',
      dueAt: addDays(calving, -p.dryOffBeforeCalvingDays),
      toleranceDays: 5,
      assignedRole: 'coop',
      priority: 'normal',
      derivedFrom: `คลอดคาดการณ์ − ${p.dryOffBeforeCalvingDays} วัน`,
    },
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

/** ดัชนีความเครียดจากความร้อน (ค-05) — สูตร THI มาตรฐาน */
export function heatStressIndex(tempC: number, humidityPct: number): number {
  return Number((0.8 * tempC + (humidityPct / 100) * (tempC - 14.4) + 46.4).toFixed(1))
}

export function heatStressLevel(thi: number): { label: string; tone: 'ok' | 'warn' | 'crit' } {
  if (thi < 72) return { label: 'ปกติ', tone: 'ok' }
  if (thi < 79) return { label: 'เครียดเล็กน้อย', tone: 'warn' }
  return { label: 'เครียดสูง เลี่ยงการผสม', tone: 'crit' }
}
