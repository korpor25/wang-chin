/**
 * ข้อมูลตัวอย่างสำหรับเดโม UX — ยังไม่มี backend จึงสร้างขึ้นในเครื่อง
 * ตัวเลขอิงบริบทจริงของสหกรณ์โคขุนวังชิ้น อ.วังชิ้น จ.แพร่
 */
import { db, bumpCounter, newLocalId, rebuildCounters } from './db'
import { DEFAULT_PARAMS, addDays, tasksAfterCalving, tasksAfterInsemination } from '../domain/rules'
import type { Alert, Animal, Farm, FeedGroup, SemenBatch, Tank, Task, User } from '../domain/types'

const DAY = 86_400_000
const now = () => Date.now()

const VILLAGES = [
  ['บ้านวังชิ้น', 'วังชิ้น'],
  ['บ้านนาพูน', 'นาพูน'],
  ['บ้านสรอย', 'สรอย'],
  ['บ้านแม่เกิ๋ง', 'แม่เกิ๋ง'],
  ['บ้านป่าสัก', 'ป่าสัก'],
  ['บ้านแม่ป้าก', 'แม่ป้าก'],
]

const OWNERS = [
  'สมชาย ใจดี', 'บุญมา ศรีวงศ์', 'ประทีป คำแสน', 'จันทร์ทิพย์ วงศ์ษา',
  'ทองสุข ปันแก้ว', 'เสาร์แก้ว มูลเมือง', 'อินสม ต๊ะวงศ์', 'คำปัน สุยะ',
  'มานพ อินต๊ะ', 'ศรีนวล กันทะ',
]

const BREEDS = ['บราห์มัน', 'ชาโรเล่ส์', 'แองกัส', 'วากิว', 'ลูกผสมพื้นเมือง']
const SIRES = [
  ['B-114', 'บราห์มันแดง 114', 'บราห์มัน'],
  ['C-207', 'ชาโรเล่ส์ 207', 'ชาโรเล่ส์'],
  ['A-331', 'แองกัสดำ 331', 'แองกัส'],
  ['W-058', 'วากิว 058', 'วากิว'],
]

const pick = <T>(arr: T[], i: number) => arr[i % arr.length]

/**
 * ป้องกันการ seed ซ้อน
 *
 * seed() เช็คว่าฐานว่างก่อนแล้วค่อยเขียน ระหว่างสอง step นั้น await คั่นอยู่
 * ผู้เรียกรายที่สองจึงแทรกเข้ามาเห็นฐานว่างได้เหมือนกัน แล้วเขียนซ้อนจนชน
 * primary key เป็น BulkError
 *
 * เกิดจริงทุกครั้งที่เปิดแอปครั้งแรกตอน dev เพราะ StrictMode รัน effect ซ้ำสองรอบ
 * แต่เป็นการแข่งกันเขียนที่เกิดได้เสมอ ไม่ใช่เรื่องเฉพาะ StrictMode
 * จึงกันที่ตัวฟังก์ชัน ไม่ใช่ที่ผู้เรียก
 */
let inFlight: Promise<boolean> | null = null

export function seedIfEmpty(force = false): Promise<boolean> {
  // ผู้เรียกธรรมดาที่มาระหว่างรอบที่วิ่งอยู่ ใช้ผลของรอบนั้นร่วมกันได้
  if (inFlight && !force) return inFlight

  // ส่วน force คือปุ่ม "สร้างข้อมูลใหม่" ในหน้าตั้งค่า ต้องได้ล้างและเขียนจริงเสมอ
  // จึงต่อท้ายรอบที่ค้างอยู่แทนการรับผลของรอบนั้นมา ไม่งั้นผู้ใช้กดแล้วเงียบ
  const prev = inFlight ?? Promise.resolve(false)
  const run = prev.then(
    () => seed(force),
    () => seed(force),
  )
  inFlight = run
  void run.finally(() => {
    if (inFlight === run) inFlight = null
  })
  return run
}

async function seed(force = false) {
  const count = await db.farms.count()
  if (count > 0 && !force) return false
  if (force) {
    await Promise.all([
      db.farms.clear(), db.animals.clear(), db.users.clear(), db.semen.clear(),
      db.tanks.clear(), db.feedGroups.clear(), db.records.clear(), db.tasks.clear(),
      db.alerts.clear(), db.outbox.clear(), db.counters.clear(),
    ])
  }

  const t = now()

  // ── ฟาร์ม 30 แห่ง ตามจำนวนสมาชิกที่ตั้งไว้ ──
  const farms: Farm[] = Array.from({ length: 30 }, (_, i) => {
    const [village, subdistrict] = pick(VILLAGES, i)
    return {
      id: `farm_${i + 1}`,
      code: `WC-${String(i + 1).padStart(3, '0')}`,
      name: `ฟาร์ม${pick(OWNERS, i).split(' ')[0]} ${i + 1}`,
      owner: pick(OWNERS, i),
      phone: `08${(10000000 + i * 137911).toString().slice(0, 8)}`,
      village,
      subdistrict,
      district: 'วังชิ้น',
      province: 'แพร่',
      lat: 17.86 + (i % 20) / 200,
      lng: 99.62 + (i % 17) / 200,
      active: true,
    }
  })

  // ── ผู้ใช้ ──
  const allFarms = farms.map((f) => f.id)
  const users: User[] = [
    { id: 'u_farmer', name: 'สมชาย ใจดี', role: 'farmer', phone: '0810000001', farmIds: ['farm_1'], readOnly: false, isAdmin: false, active: true },
    { id: 'u_husb', name: 'อนุชา วงศ์ใหญ่', role: 'husbandry', phone: '0810000002', farmIds: allFarms, readOnly: false, isAdmin: false, active: true },
    { id: 'u_coop', name: 'วิไล ศรีบุญเรือง', role: 'coop', phone: '0810000003', farmIds: allFarms, readOnly: false, isAdmin: true, active: true },
    { id: 'u_board', name: 'ประสิทธิ์ คำมูล', role: 'coop', phone: '0810000004', farmIds: allFarms, readOnly: true, isAdmin: false, active: true },
  ]

  // ── โค 500 ตัว กระจายตามระยะของวงจร ──
  const stages: Animal['stage'][] = ['heifer', 'fresh', 'waiting', 'bred', 'pregnant', 'dry', 'problem']
  const stageWeight = [60, 70, 90, 80, 150, 40, 10] // รวม 500
  const animals: Animal[] = []
  let idx = 0
  stages.forEach((stage, si) => {
    for (let k = 0; k < stageWeight[si]; k++) {
      const i = idx++
      const farmId = `farm_${(i % 30) + 1}`
      const ageDays = 400 + (i % 2200)
      const lastCalving =
        stage === 'heifer' ? null : t - (10 + ((i * 7) % 200)) * DAY
      const lastBred =
        stage === 'bred' || stage === 'pregnant' || stage === 'dry'
          ? t - (20 + ((i * 5) % 240)) * DAY
          : null
      animals.push({
        id: `animal_${i + 1}`,
        rfid: `900${String(100000000 + i).padStart(12, '0')}`,
        tagNo: `WC${String(i + 1).padStart(4, '0')}`,
        name: '',
        sex: 'female',
        breed: pick(BREEDS, i),
        bloodPct: [50, 75, 87.5, 100][i % 4],
        birthDate: t - ageDays * DAY,
        farmId,
        damId: null,
        sireCode: pick(SIRES, i)[0],
        stage,
        parity: stage === 'heifer' ? 0 : 1 + (i % 5),
        lastCalvingAt: lastCalving,
        lastHeatAt:
          stage === 'waiting' ? t - ((i % 20) + 1) * DAY * 0.5 : null,
        lastBredAt: lastBred,
        expectedCalvingAt:
          stage === 'pregnant' || stage === 'dry'
            ? (lastBred ?? t) + DEFAULT_PARAMS.gestationDays * DAY
            : null,
        lastBcs: stage === 'problem' ? 3 + (i % 2) : 4 + (i % 4),
        feedGroupId: `fg_${(i % 4) + 1}`,
        withdrawalUntil: i % 97 === 0 ? t + 5 * DAY : null,
        active: true,
      })
    }
  })

  // ── น้ำเชื้อ ──
  const semen: SemenBatch[] = SIRES.flatMap(([code, name, breed], i) =>
    [0, 1].map((j) => {
      const collected = t - (60 + i * 90 + j * 200) * DAY
      const used = 20 + ((i * 13 + j * 7) % 90)
      const strawsIn = 120
      const expires = collected + 1460 * DAY
      return {
        id: `semen_${i}_${j}`,
        lotNo: `${code}-L${2400 + i * 10 + j}`,
        sireCode: code,
        sireName: name,
        breed,
        bloodPct: 100,
        collectedAt: collected,
        expiresAt: expires,
        tankId: `tank_${(i % 2) + 1}`,
        canister: `กระบอก ${(i % 6) + 1}`,
        strawsIn,
        strawsUsed: used,
        motilityCert: 60 + (i % 3) * 5,
        motilityLast: j === 1 ? 38 : 55 + (i % 4),
        lastQcAt: t - (30 + i * 20) * DAY,
        nextQcAt: t + (150 - i * 40) * DAY,
        status: j === 1 && i === 1 ? 'watch' : 'ok',
      } satisfies SemenBatch
    }),
  )

  const tanks: Tank[] = [
    {
      id: 'tank_1', code: 'ถัง A', location: 'สำนักงานสหกรณ์', capacityL: 35,
      levelCm: 22, lastFilledAt: t - 21 * DAY, lastCheckAt: t - 5 * DAY,
      evaporationCmPerWeek: 1.8, status: 'ok',
    },
    {
      id: 'tank_2', code: 'ถัง B', location: 'รถออกหน่วย', capacityL: 20,
      levelCm: 6, lastFilledAt: t - 34 * DAY, lastCheckAt: t - 12 * DAY,
      evaporationCmPerWeek: 4.1, status: 'critical',
    },
  ]

  const feedGroups: FeedGroup[] = [
    { id: 'fg_1', name: 'กลุ่มหลังคลอด', formula: 'สูตร A โปรตีน 16%', kgPerHeadPerDay: 6, supplements: 'แร่ธาตุก้อน + วิตามิน ADE', startedAt: t - 120 * DAY },
    { id: 'fg_2', name: 'กลุ่มรอผสม', formula: 'สูตร B โปรตีน 14%', kgPerHeadPerDay: 5, supplements: 'แร่ธาตุก้อน', startedAt: t - 120 * DAY },
    { id: 'fg_3', name: 'กลุ่มตั้งท้อง', formula: 'สูตร C โปรตีน 13%', kgPerHeadPerDay: 5.5, supplements: 'แร่ธาตุก้อน + ซีลีเนียม', startedAt: t - 90 * DAY },
    { id: 'fg_4', name: 'กลุ่มพักก่อนคลอด', formula: 'สูตร D โปรตีน 12%', kgPerHeadPerDay: 4.5, supplements: 'แคลเซียมต่ำ', startedAt: t - 60 * DAY },
  ]

  // ── งานที่ระบบสร้างจากเหตุการณ์จริงของโคแต่ละตัว (ค-01) ──
  const tasks: Task[] = []
  const pushTasks = (a: Animal, derived: ReturnType<typeof tasksAfterCalving>) => {
    for (const d of derived) {
      // เก็บเฉพาะงานในกรอบ −21 ถึง +45 วัน ให้ปฏิทินไม่บวมเกินจำเป็น
      if (d.dueAt < t - 21 * DAY || d.dueAt > t + 45 * DAY) continue
      // งานที่เลยกำหนดมานานถือว่าปิดไปแล้ว เหลือค้างเฉพาะที่เพิ่งเลยกำหนดจริง ๆ
      const done = d.dueAt < t - 3 * DAY
      const overdue = !done && d.dueAt < t - d.toleranceDays * DAY
      tasks.push({
        localId: newLocalId('task'),
        activityCode: d.activityCode,
        animalId: a.id,
        farmId: a.farmId,
        title: d.title,
        dueAt: d.dueAt,
        toleranceDays: d.toleranceDays,
        assignedRole: d.assignedRole,
        assignedTo: d.assignedRole === 'husbandry' ? 'u_husb' : null,
        priority: d.priority,
        status: done ? 'done' : overdue ? 'overdue' : 'open',
        derivedFrom: d.derivedFrom,
        doneAt: done ? d.dueAt + DAY : null,
        doneRecordLocalId: null,
      })
    }
  }
  for (const a of animals) {
    if (a.lastCalvingAt) pushTasks(a, tasksAfterCalving(a.lastCalvingAt, DEFAULT_PARAMS))
    if (a.lastBredAt) pushTasks(a, tasksAfterInsemination(a.lastBredAt, DEFAULT_PARAMS))
  }

  // งานคลังตามรอบทรัพย์สิน (ค-02)
  tasks.push(
    {
      localId: newLocalId('task'), activityCode: 'ข-03', animalId: null, farmId: null,
      title: 'วัดระดับไนโตรเจนเหลว ถัง B', dueAt: t - 5 * DAY, toleranceDays: 2,
      assignedRole: 'coop', assignedTo: 'u_coop', priority: 'high', status: 'overdue',
      derivedFrom: 'รอบ 2 สัปดาห์ · ระเหยเร็วผิดปกติ', doneAt: null, doneRecordLocalId: null,
    },
    {
      localId: newLocalId('task'), activityCode: 'ข-02', animalId: null, farmId: null,
      title: 'ตรวจคุณภาพน้ำเชื้อ ล็อต C-207-L2411', dueAt: t + 3 * DAY, toleranceDays: 7,
      assignedRole: 'coop', assignedTo: 'u_coop', priority: 'normal', status: 'open',
      derivedFrom: 'ครบรอบ 6 เดือน', doneAt: null, doneRecordLocalId: null,
    },
    {
      localId: newLocalId('task'), activityCode: 'ข-07', animalId: null, farmId: null,
      title: 'อบรมสอบเทียบผู้ให้คะแนน BCS ประจำปี', dueAt: t + 20 * DAY, toleranceDays: 14,
      assignedRole: 'coop', assignedTo: 'u_coop', priority: 'low', status: 'open',
      derivedFrom: 'รอบปีละครั้ง', doneAt: null, doneRecordLocalId: null,
    },
  )

  // ── แจ้งเตือน (ค-03) จากงานที่ใกล้ถึงกำหนดและที่เลยกำหนด ──
  const alerts: Alert[] = tasks
    .filter((k) => k.dueAt < t + DEFAULT_PARAMS.alertLeadDays * DAY)
    .slice(0, 40)
    .map((k, i) => ({
      localId: newLocalId('alert'),
      taskLocalId: k.localId,
      animalId: k.animalId,
      farmId: k.farmId,
      title: k.title,
      body: `${k.derivedFrom} · กำหนด ${new Date(k.dueAt).toLocaleDateString('th-TH')}`,
      level: k.status === 'overdue' ? 'critical' : k.priority === 'high' ? 'warn' : 'info',
      channel: k.assignedRole === 'farmer' ? 'line' : 'in-app',
      toRole: k.assignedRole,
      sentAt: k.dueAt - DEFAULT_PARAMS.alertLeadDays * DAY,
      readAt: i % 3 === 0 ? t - 2 * DAY : null,
      ackAt: i % 5 === 0 ? t - DAY : null,
      escalatedAt: k.status === 'overdue' && i % 4 === 0 ? t - DAY : null,
      resolvedAt: null,
    }))

  await db.transaction(
    'rw',
    [db.farms, db.animals, db.users, db.semen, db.tanks, db.feedGroups, db.tasks, db.alerts],
    async () => {
      await db.farms.bulkAdd(farms)
      await db.animals.bulkAdd(animals)
      await db.users.bulkAdd(users)
      await db.semen.bulkAdd(semen)
      await db.tanks.bulkAdd(tanks)
      await db.feedGroups.bulkAdd(feedGroups)
      await db.tasks.bulkAdd(tasks)
      await db.alerts.bulkAdd(alerts)
    },
  )

  await rebuildCounters()
  await bumpCounter('seed.version', 1)
  return true
}

/** ข้อมูลสภาพอากาศจำลอง 14 วันย้อนหลัง สำหรับ ค-05 */
export function weatherSeries(days = 14) {
  const t = now()
  return Array.from({ length: days }, (_, i) => {
    const at = addDays(t, -(days - 1 - i))
    const tempMax = 31 + ((i * 7) % 9)
    const tempMin = 22 + ((i * 3) % 5)
    const humidity = 62 + ((i * 11) % 25)
    return { at, tempMax, tempMin, humidity }
  })
}
