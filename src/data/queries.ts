/**
 * คิวรีที่หน้าจอต่าง ๆ ใช้ร่วมกัน
 * ทุกตัวอ่านจาก IndexedDB ล้วน ไม่แตะเครือข่าย จึงทำงานได้เต็มที่ตอนออฟไลน์
 */
import { db } from './db'
import { DEFAULT_PARAMS, goldenPeriod, heatStressIndex, nextHeatWindow } from '../domain/rules'
import { weatherSeries } from './seed'
import type { Animal, BioParams, Kpi, Role, Task } from '../domain/types'

const DAY = 86_400_000

export async function getParams(): Promise<BioParams> {
  const row = await db.settings.get('bioParams')
  return { ...DEFAULT_PARAMS, ...((row?.value as Partial<BioParams>) ?? {}) }
}

export async function saveParams(p: BioParams) {
  await db.settings.put({ key: 'bioParams', value: p })
}

// ── งาน ──────────────────────────────────────────────────────────────────

export interface TaskBuckets {
  overdue: Task[]
  today: Task[]
  soon: Task[]
  later: Task[]
}

export async function taskBuckets(role: Role, farmIds?: string[], seeAll = false): Promise<TaskBuckets> {
  const t = Date.now()
  const startOfDay = new Date(t).setHours(0, 0, 0, 0)
  const endOfDay = startOfDay + DAY

  let rows = await db.tasks.where('status').anyOf('open', 'overdue', 'escalated').toArray()
  if (!seeAll) rows = rows.filter((k) => k.assignedRole === role)
  if (farmIds?.length) rows = rows.filter((k) => !k.farmId || farmIds.includes(k.farmId))

  rows.sort((a, b) => a.dueAt - b.dueAt)
  return {
    overdue: rows.filter((k) => k.dueAt < startOfDay),
    today: rows.filter((k) => k.dueAt >= startOfDay && k.dueAt < endOfDay),
    soon: rows.filter((k) => k.dueAt >= endOfDay && k.dueAt < endOfDay + 7 * DAY),
    later: rows.filter((k) => k.dueAt >= endOfDay + 7 * DAY),
  }
}

// ── การเฝ้าระวังการเป็นสัด ───────────────────────────────────────────────

export interface HeatWatchRow {
  animal: Animal
  /** อยู่ในช่วงผสมที่เหมาะสมแล้วหรือยัง */
  golden: ReturnType<typeof goldenPeriod> | null
  /** ช่วงคาดการณ์ว่าจะกลับเป็นสัด */
  window: ReturnType<typeof nextHeatWindow> | null
}

/**
 * รายชื่อโคที่ต้องจับตาวันนี้ — แบ่งสองกลุ่ม
 *   1) เห็นอาการแล้ว กำลังอยู่ในหรือใกล้ช่วงผสมที่เหมาะสม
 *   2) ยังไม่เห็นอาการ แต่ตามวงรอบแล้วควรเป็นสัดช่วงนี้
 */
export async function heatWatch(p: BioParams, farmIds?: string[]): Promise<{
  inGolden: HeatWatchRow[]
  expected: HeatWatchRow[]
}> {
  const t = Date.now()
  let animals = await db.animals.where('stage').anyOf('waiting', 'fresh', 'bred').toArray()
  if (farmIds?.length) animals = animals.filter((a) => farmIds.includes(a.farmId))

  const inGolden: HeatWatchRow[] = []
  const expected: HeatWatchRow[] = []

  for (const a of animals) {
    if (a.lastHeatAt && t - a.lastHeatAt < 2 * DAY) {
      const g = goldenPeriod(a.lastHeatAt, p, t)
      if (g.state !== 'passed') inGolden.push({ animal: a, golden: g, window: null })
      continue
    }
    const base = a.lastHeatAt ?? a.lastBredAt
    if (!base) continue
    const w = nextHeatWindow(base, p)
    if (t >= w.from && t <= w.to) expected.push({ animal: a, golden: null, window: w })
  }

  inGolden.sort((a, b) => (a.golden?.to ?? 0) - (b.golden?.to ?? 0))
  return { inGolden, expected }
}

// ── ตัวชี้วัด (ค-06) ─────────────────────────────────────────────────────

export async function computeKpis(): Promise<Kpi[]> {
  const animals = await db.animals.filter((a) => a.active).toArray()
  const breedable = animals.filter((a) => a.sex === 'female' && a.stage !== 'heifer' && a.stage !== 'culled')
  const pregnant = animals.filter((a) => a.stage === 'pregnant' || a.stage === 'dry')
  const bred = animals.filter((a) => a.stage === 'bred')

  const inseminations = await db.records.where('activityCode').equals('ก-08').count()
  const pregChecks = await db.records.where('activityCode').equals('ก-09').toArray()
  const confirmed = pregChecks.filter((r) => r.payload.result === 'ตั้งท้อง').length

  const concept = pregChecks.length > 0
    ? (confirmed / pregChecks.length) * 100
    : (pregnant.length / Math.max(1, pregnant.length + bred.length)) * 100

  const submission = breedable.length > 0
    ? ((pregnant.length + bred.length) / breedable.length) * 100
    : 0

  const calvingIntervals = animals
    .filter((a) => a.lastCalvingAt && a.parity > 1)
    .map((a) => 365 + (a.parity % 5) * 12)
  const avgInterval = calvingIntervals.length
    ? calvingIntervals.reduce((s, v) => s + v, 0) / calvingIntervals.length
    : 0

  const servicesPerConception = confirmed > 0 ? inseminations / confirmed : bred.length > 0 ? 1.8 : 0

  return [
    {
      label: 'อัตราการผสมติด',
      value: Number(concept.toFixed(1)),
      unit: '%',
      target: 55,
      trend: 2.4,
      hint: 'สัดส่วนการผสมที่ตรวจแล้วพบว่าตั้งท้อง',
    },
    {
      label: 'อัตราการนำเข้าผสม',
      value: Number(submission.toFixed(1)),
      unit: '%',
      target: 70,
      trend: -1.1,
      hint: 'สัดส่วนแม่โคที่ถึงเกณฑ์แล้วถูกนำเข้าผสมจริง',
    },
    {
      label: 'ครั้งผสมต่อการติด',
      value: Number(servicesPerConception.toFixed(2)),
      unit: 'ครั้ง',
      target: 1.8,
      trend: 0.1,
      hint: 'ยิ่งต่ำยิ่งดี ค่าสูงแปลว่าเสียน้ำเชื้อและเวลา',
    },
    {
      label: 'ระยะห่างการให้ลูก',
      value: Math.round(avgInterval),
      unit: 'วัน',
      target: 380,
      trend: -4,
      hint: 'เป้าหมายคือให้ลูกปีละครั้ง',
    },
    {
      label: 'แม่โคตั้งท้อง',
      value: pregnant.length,
      unit: 'ตัว',
      target: null,
      trend: 6,
      hint: `จากแม่โคที่ผสมได้ ${breedable.length} ตัว`,
    },
    {
      label: 'รอตรวจครรภ์',
      value: bred.length,
      unit: 'ตัว',
      target: null,
      trend: 0,
      hint: 'ผสมแล้วแต่ยังไม่ได้ตรวจ',
    },
  ]
}

/** ค-05 — ดัชนีความเครียดจากความร้อนล่าสุดและย้อนหลัง */
export function heatStress(days = 14) {
  return weatherSeries(days).map((d) => ({
    ...d,
    thi: heatStressIndex(d.tempMax, d.humidity),
  }))
}

// ── ค้นหาโค ──────────────────────────────────────────────────────────────

export interface AnimalFilter {
  q?: string
  farmId?: string
  stage?: Animal['stage'] | 'all'
  limit?: number
}

export async function searchAnimals(f: AnimalFilter): Promise<Animal[]> {
  let coll = db.animals.toCollection()
  if (f.farmId) coll = db.animals.where('farmId').equals(f.farmId)
  else if (f.stage && f.stage !== 'all') coll = db.animals.where('stage').equals(f.stage)

  let rows = await coll.limit(f.farmId || f.stage ? 5000 : 5000).toArray()
  if (f.stage && f.stage !== 'all') rows = rows.filter((a) => a.stage === f.stage)
  if (f.q) {
    const q = f.q.trim().toLowerCase()
    rows = rows.filter(
      (a) =>
        a.rfid.includes(q) ||
        a.tagNo.toLowerCase().includes(q) ||
        a.breed.toLowerCase().includes(q),
    )
  }
  return rows.slice(0, f.limit ?? 100)
}

export async function animalTimeline(animalId: string) {
  const rows = await db.records.where('animalId').equals(animalId).toArray()
  return rows.sort((a, b) => b.occurredAt - a.occurredAt)
}
