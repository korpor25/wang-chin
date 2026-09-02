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
  }
}

export const db = new WangchinDb()

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

export async function getCounter(key: string): Promise<number> {
  return (await db.counters.get(key))?.value ?? 0
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
