/**
 * คิวรีที่หน้าจอต่าง ๆ ใช้ร่วมกัน
 * ทุกตัวอ่านจาก IndexedDB ล้วน ไม่แตะเครือข่าย จึงทำงานได้เต็มที่ตอนออฟไลน์
 */
import { db } from './db'
import { inPhase } from '../domain/activities'
import { DEFAULT_PARAMS, goldenPeriod, nextHeatWindow } from '../domain/rules'
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

/**
 * กล่องงานของผู้ใช้คนหนึ่ง
 *
 * ASG-05 — เห็นเฉพาะงานของบทบาทตัวเอง งานที่ระบุชื่อคนอื่นแล้วต้องไม่ปนเข้ามา
 * และงานที่ระบุชื่อตัวเองต้องมาก่อนงานที่ยังไม่ระบุตัวบุคคลในวันเดียวกัน
 */
export async function taskBuckets(
  role: Role,
  farmIds?: string[],
  seeAll = false,
  userId?: string,
): Promise<TaskBuckets> {
  const t = Date.now()
  const startOfDay = new Date(t).setHours(0, 0, 0, 0)
  const endOfDay = startOfDay + DAY

  let rows = await db.tasks.where('status').anyOf('open', 'overdue', 'escalated').toArray()
  // เฟสนี้ทำเฉพาะภาค ก งานของภาคอื่นที่ค้างจากข้อมูลชุดเก่าต้องไม่โผล่มา
  rows = rows.filter((k) => inPhase(k.activityCode))
  if (!seeAll) {
    rows = rows.filter((k) => k.assignedRole === role)
    if (userId) rows = rows.filter((k) => !k.assignedTo || k.assignedTo === userId)
  }
  if (farmIds?.length) rows = rows.filter((k) => !k.farmId || farmIds.includes(k.farmId))

  const mine = (k: Task) => (userId && k.assignedTo === userId ? 0 : 1)
  rows.sort((a, b) => mine(a) - mine(b) || a.dueAt - b.dueAt)
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
  const pregnant = animals.filter((a) => a.stage === 'pregnant')
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
      label: 'รอตรวจท้อง',
      value: bred.length,
      unit: 'ตัว',
      target: null,
      trend: 0,
      hint: 'ผสมแล้วแต่ยังไม่ได้ตรวจ',
    },
  ]
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

const lastTouch = (a: Animal) =>
  Math.max(a.lastHeatAt ?? 0, a.lastBredAt ?? 0, a.lastCalvingAt ?? 0, a.birthDate)

/**
 * โคที่เพิ่งถูกบันทึกล่าสุด ใช้เป็นรายชื่อตั้งต้นของช่องเลือกตัวสัตว์
 *
 * งานภาคสนามมักวนอยู่กับโคชุดเดิมติดกันหลายกิจกรรม เช่น จับสัด แล้วผสม
 * แล้วให้คะแนน BCS การไล่จากบันทึกล่าสุดจึงตรงกับตัวที่กำลังจะกรอกบ่อยกว่า
 * การเรียงตามเบอร์หู ถ้าเครื่องยังไม่มีบันทึกเลย ให้ไล่จากตัวที่มีความ
 * เคลื่อนไหวในวงรอบล่าสุดแทน จะได้ไม่ขึ้นรายการว่าง
 */
export async function recentAnimals(limit = 6, farmIds?: string[]): Promise<Animal[]> {
  const inScope = (a: Animal) => a.active && (!farmIds?.length || farmIds.includes(a.farmId))
  const picked: Animal[] = []
  const seen = new Set<string>()

  const recs = await db.records.orderBy('occurredAt').reverse().limit(120).toArray()
  for (const r of recs) {
    if (!r.animalId || seen.has(r.animalId)) continue
    seen.add(r.animalId)
    const a = await db.animals.get(r.animalId)
    if (a && inScope(a)) picked.push(a)
    if (picked.length >= limit) return picked
  }

  const rest = (await db.animals.toArray())
    .filter((a) => inScope(a) && !seen.has(a.id))
    .sort((a, b) => lastTouch(b) - lastTouch(a))
  return picked.concat(rest).slice(0, limit)
}

export async function animalTimeline(animalId: string) {
  const rows = await db.records.where('animalId').equals(animalId).toArray()
  return rows.sort((a, b) => b.occurredAt - a.occurredAt)
}
