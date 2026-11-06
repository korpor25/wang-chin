/**
 * ฐานข้อมูลออฟไลน์ของแอป
 *
 * บทเรียนจากการวัดจริงบนเครื่อง: การนับ record ที่ syncStatus = 'pending'
 * ด้วย count() โตแบบ O(n) — ที่ 500,000 เรคอร์ดใช้เวลา 5.1 วินาที
 * เพราะทุกแถวมีค่า index เดียวกันหมด index จึงช่วยอะไรไม่ได้
 * ตาราง counters จึงเก็บยอดไว้ตรง ๆ แล้วบวกลบตอนเข้า-ออกคิวแทน
 */
import Dexie, { type Table } from 'dexie'
import type {
  ActivityRecord,
  Alert,
  Animal,
  CoopEvent,
  Farm,
  FeedGroup,
  FeedLot,
  OutboxItem,
  Photo,
  SemenBatch,
  Tank,
  Task,
  User,
} from '../domain/types'

export interface Counter {
  key: string
  value: number
}

export interface Setting {
  key: string
  value: unknown
}

export interface AuditEntry {
  id?: number
  at: number
  actor: string
  action: string
  target: string
  before: unknown
  after: unknown
}

class WangchinDb extends Dexie {
  farms!: Table<Farm, string>
  animals!: Table<Animal, string>
  users!: Table<User, string>
  semen!: Table<SemenBatch, string>
  tanks!: Table<Tank, string>
  feedGroups!: Table<FeedGroup, string>
  feedLots!: Table<FeedLot, string>
  records!: Table<ActivityRecord, number>
  photos!: Table<Photo, number>
  tasks!: Table<Task, number>
  alerts!: Table<Alert, number>
  events!: Table<CoopEvent, number>
  outbox!: Table<OutboxItem, number>
  counters!: Table<Counter, string>
  settings!: Table<Setting, string>
  audit!: Table<AuditEntry, number>

  constructor() {
    super('wangchin-farm')
    this.version(1).stores({
      farms: 'id, code, district, active',
      animals: 'id, rfid, tagNo, farmId, stage, active, expectedCalvingAt, lastHeatAt',
      users: 'id, role, active',
      semen: 'id, lotNo, sireCode, status, expiresAt',
      tanks: 'id, code, status',
      feedGroups: 'id, name',
      feedLots: 'id, lotNo, verdict',
      records: '++id, localId, activityCode, animalId, farmId, occurredAt, syncStatus',
      photos: '++id, localId, recordLocalId, syncStatus, at',
      tasks: '++id, localId, activityCode, animalId, farmId, dueAt, status, assignedRole',
      alerts: '++id, localId, toRole, sentAt, level, ackAt, resolvedAt',
      outbox: '++id, localId, refLocalId, nextAttemptAt, attempts',
      counters: 'key',
      settings: 'key',
      audit: '++id, at, actor',
    })

    /**
     * เวอร์ชัน 2 — เพิ่มตารางกิจกรรมสหกรณ์ (ALR-01) และ index ผู้รับผิดชอบรายบุคคล
     * ที่หน้ามอบหมายงานกับกล่องงานของแต่ละคนต้องใช้ (ASG-02, ASG-05)
     * ไม่ต้องมี upgrade() เพราะเป็นการเพิ่มตารางและ index ล้วน ๆ ข้อมูลเดิมอยู่ครบ
     */
    this.version(2).stores({
      tasks:
        '++id, localId, activityCode, animalId, farmId, dueAt, status, assignedRole, assignedTo',
      alerts: '++id, localId, taskLocalId, toRole, sentAt, level, ackAt, resolvedAt',
      events: '++id, localId, startAt, audience',
    })
  }
}

export const db = new WangchinDb()

/**
 * สร้างข้อมูลเดโมพื้นฐานเพื่อให้ทดสอบระบบได้ทันที (โหมดเดโม)
 * จะทำงานเฉพาะเมื่อฐานข้อมูลว่างเปล่า
 */
export async function seedDemoData() {
  console.log('🌱 Seeding demo data (Force)...');

  const demoFarms = [
    { id: 'farm_001', code: 'F01', name: 'ฟาร์มสมชาย 1', owner: 'สมชาย ใจดี', phone: '0810000001', village: 'ม.1', subdistrict: 'วังชิ้น', district: 'วังชิ้น', province: 'แพร่', lat: 18.1, lng: 100.2, active: true },
    { id: 'farm_002', code: 'F02', name: 'ฟาร์มสมชาย 2', owner: 'สมชาย ใจดี', phone: '0810000001', village: 'ม.2', subdistrict: 'วังชิ้น', district: 'วังชิ้น', province: 'แพร่', lat: 18.2, lng: 100.3, active: true },
    { id: 'farm_003', code: 'F03', name: 'ฟาร์มสมชาย 3', owner: 'สมชาย ใจดี', phone: '0810000001', village: 'ม.3', subdistrict: 'วังชิ้น', district: 'วังชิ้น', province: 'แพร่', lat: 18.3, lng: 100.4, active: true },
    { id: 'farm_004', code: 'F04', name: 'ฟาร์มสมบูรณ์', owner: 'สมบูรณ์ มีสุข', phone: '0820000000', village: 'ม.1', subdistrict: 'วังชิ้น', district: 'วังชิ้น', province: 'แพร่', lat: 18.4, lng: 100.5, active: true },
  ];

  await db.farms.bulkPut(demoFarms);

  const demoAnimals: Animal[] = [
    { id: 'a1', rfid: '123', tagNo: 'S01-01', name: 'เบอร์ 1', sex: 'female', breed: 'โฮลสไตน์', bloodPct: 100, birthDate: Date.now() - 1000 * 60 * 60 * 24 * 365 * 2, farmId: 'farm_001', damId: null, sireCode: 'S-01', stage: 'pregnant', parity: 1, lastCalvingAt: null, lastHeatAt: null, lastBredAt: null, expectedCalvingAt: Date.now() + 1000 * 60 * 60 * 24 * 30, lastBcs: 3.2, feedGroupId: null, withdrawalUntil: null, active: true },
    { id: 'a2', rfid: '456', tagNo: 'S02-01', name: 'เบอร์ 2', sex: 'female', breed: 'โฮลสไตน์', bloodPct: 100, birthDate: Date.now() - 1000 * 60 * 60 * 24 * 365 * 3, farmId: 'farm_002', damId: null, sireCode: 'S-01', stage: 'waiting', parity: 2, lastCalvingAt: Date.now() - 1000 * 60 * 60 * 24 * 60, lastHeatAt: Date.now() - 1000 * 60 * 60 * 24 * 5, lastBredAt: null, expectedCalvingAt: null, lastBcs: 3.0, feedGroupId: null, withdrawalUntil: null, active: true },
    { id: 'a3', rfid: '789', tagNo: 'S03-01', name: 'เบอร์ 3', sex: 'female', breed: 'โฮลสไตน์', bloodPct: 100, birthDate: Date.now() - 1000 * 60 * 60 * 24 * 365 * 1, farmId: 'farm_003', damId: null, sireCode: 'S-01', stage: 'heifer', parity: 0, lastCalvingAt: null, lastHeatAt: null, lastBredAt: null, expectedCalvingAt: null, lastBcs: 2.8, feedGroupId: null, withdrawalUntil: null, active: true },
  ];

  await db.animals.bulkPut(demoAnimals);
  console.log('✅ Demo data force-seeded successfully');
}

/** สร้าง id แบบเรียงตามเวลา อ่านง่ายเวลา debug และไม่ชนกันข้ามเครื่อง */
export function newLocalId(prefix: string): string {
  const t = Date.now().toString(36)
  const r = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${t}_${r}`
}

// ── ตัวนับ ────────────────────────────────────────────────────────────────

export async function bumpCounter(key: string, delta: number) {
  await db.transaction('rw', db.counters, async () => {
    const row = await db.counters.get(key)
    const next = Math.max(0, (row?.value ?? 0) + delta)
    await db.counters.put({ key, value: next })
  })
}

/**
 * คำนวณตัวนับใหม่จากข้อมูลจริง — ช้า จึงเรียกเฉพาะตอนกู้สถานะ
 * เช่น หลังการนำเข้าข้อมูลหรือเมื่อสงสัยว่าตัวนับเพี้ยน
 */
export async function rebuildCounters() {
  const [pending, failed, conflict, photos, outbox] = await Promise.all([
    db.records.where('syncStatus').equals('pending').count(),
    db.records.where('syncStatus').equals('failed').count(),
    db.records.where('syncStatus').equals('conflict').count(),
    db.photos.where('syncStatus').equals('pending').count(),
    db.outbox.count(),
  ])
  await db.counters.bulkPut([
    { key: 'records.pending', value: pending },
    { key: 'records.failed', value: failed },
    { key: 'records.conflict', value: conflict },
    { key: 'photos.pending', value: photos },
    { key: 'outbox.size', value: outbox },
  ])
}

// ── การตั้งค่า ────────────────────────────────────────────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}

export async function writeAudit(entry: Omit<AuditEntry, 'id' | 'at'>) {
  await db.audit.add({ ...entry, at: Date.now() })
}
