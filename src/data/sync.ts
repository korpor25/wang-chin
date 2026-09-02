/**
 * คิวซิงค์ตาม requirement ข้อ 4
 *
 * ยังไม่มี backend จริง ตัวส่งจึงเป็นตัวจำลองที่สุ่มสำเร็จ/ล้มเหลว/ขัดแย้ง
 * เพื่อให้ทดสอบ UX ของทุกเส้นทางได้ครบ เมื่อมี API จริงให้แทนที่เฉพาะ pushOne()
 *
 * หลักการที่ยึด
 *   - เขียนลงเครื่องก่อนเสมอ แล้วค่อยเข้าคิว ผู้ใช้ไม่ต้องรอเน็ต
 *   - ตัวนับรายการค้างเก็บแยก ไม่ count() สด (ผลวัดจริง: 500k แถว = 5.1 วินาที)
 *   - ข้อมูลบนเครื่องไม่ใช่สำเนาเดียว จึงลบของเก่าที่ซิงค์แล้วออกตามนโยบาย
 */
import { bumpCounter, db, getSetting, newLocalId, setSetting } from './db'
import type { ActivityRecord, OutboxItem, SyncStatus } from '../domain/types'

const DAY = 86_400_000

/** ตั้งค่านโยบายเก็บข้อมูลออฟไลน์ */
export interface RetentionPolicy {
  /** เก็บบันทึกที่ซิงค์แล้วไว้กี่วัน */
  keepSyncedDays: number
  /** ลบรูปที่ส่งขึ้นเซิร์ฟเวอร์แล้วทันทีหรือไม่ */
  dropPhotosAfterSync: boolean
  /** เตือนเมื่อมีรายการค้างเกินจำนวนนี้ */
  warnPendingOver: number
  /** เตือนเมื่อมีรายการค้างนานเกินกี่ชั่วโมง */
  warnAgeHours: number
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  keepSyncedDays: 30,
  dropPhotosAfterSync: true,
  warnPendingOver: 50,
  warnAgeHours: 48,
}

export const getRetention = () => getSetting('retention', DEFAULT_RETENTION)
export const setRetention = (p: RetentionPolicy) => setSetting('retention', p)

// ── การเข้าคิว ────────────────────────────────────────────────────────────

export async function enqueue(
  table: OutboxItem['table'],
  op: OutboxItem['op'],
  refLocalId: string,
  bytes: number,
) {
  await db.outbox.add({
    localId: newLocalId('ob'),
    table,
    op,
    refLocalId,
    bytes,
    attempts: 0,
    nextAttemptAt: Date.now(),
    lastError: null,
    createdAt: Date.now(),
  })
  await bumpCounter('outbox.size', 1)
}

/** บันทึกกิจกรรมลงเครื่องแล้วเข้าคิว — เส้นทางหลักที่ทุกฟอร์มเรียก */
export async function saveRecord(rec: Omit<ActivityRecord, 'id'>) {
  await db.records.add(rec as ActivityRecord)
  await bumpCounter('records.pending', 1)
  await enqueue('records', 'create', rec.localId, roughBytes(rec))
  return rec.localId
}

function roughBytes(rec: Omit<ActivityRecord, 'id'>) {
  try {
    return new Blob([JSON.stringify(rec)]).size
  } catch {
    return 500
  }
}

// ── ตัวส่ง ────────────────────────────────────────────────────────────────

export interface SyncOutcome {
  attempted: number
  succeeded: number
  failed: number
  conflicts: number
  bytes: number
  ms: number
  stoppedBecauseOffline: boolean
}

/** หน่วงเวลาแบบ exponential backoff มีเพดาน 30 นาที */
function backoffMs(attempts: number) {
  return Math.min(30 * 60_000, 2 ** attempts * 1000)
}

/**
 * จุดเดียวที่ต้องเปลี่ยนเมื่อมี API จริง
 * ตอนนี้จำลองผลลัพธ์ตามสัดส่วนที่ใกล้เคียงงานภาคสนาม
 */
async function pushOne(item: OutboxItem): Promise<'ok' | 'conflict' | 'error'> {
  // หน่วงตามขนาดข้อมูลเล็กน้อย ให้ใกล้เคียงการส่งจริงบนเน็ตมือถือ
  await new Promise((r) => setTimeout(r, 60 + Math.min(400, item.bytes / 2000) + Math.random() * 120))
  const roll = Math.random()
  if (roll < 0.08) return 'error'
  if (roll < 0.11) return 'conflict'
  return 'ok'
}

export async function runSync(limit = 50): Promise<SyncOutcome> {
  const t0 = performance.now()
  const out: SyncOutcome = {
    attempted: 0, succeeded: 0, failed: 0, conflicts: 0,
    bytes: 0, ms: 0, stoppedBecauseOffline: false,
  }

  if (!navigator.onLine) {
    out.stoppedBecauseOffline = true
    out.ms = performance.now() - t0
    return out
  }

  const now = Date.now()
  const due = await db.outbox.where('nextAttemptAt').belowOrEqual(now).limit(limit).toArray()

  for (const item of due) {
    if (!navigator.onLine) {
      out.stoppedBecauseOffline = true
      break
    }
    out.attempted++
    const result = await pushOne(item)

    if (result === 'ok') {
      await markRecord(item.refLocalId, 'synced')
      await db.outbox.delete(item.id!)
      await bumpCounter('outbox.size', -1)
      await bumpCounter('records.pending', -1)
      out.succeeded++
      out.bytes += item.bytes
    } else if (result === 'conflict') {
      await markRecord(item.refLocalId, 'conflict')
      await db.outbox.delete(item.id!)
      await bumpCounter('outbox.size', -1)
      await bumpCounter('records.pending', -1)
      await bumpCounter('records.conflict', 1)
      out.conflicts++
    } else {
      const attempts = item.attempts + 1
      await db.outbox.update(item.id!, {
        attempts,
        nextAttemptAt: Date.now() + backoffMs(attempts),
        lastError: 'ส่งไม่สำเร็จ เครือข่ายขัดข้อง',
      })
      // เกิน 5 ครั้งถือว่าล้มเหลว ต้องให้คนเข้ามาดู
      if (attempts >= 5) {
        await markRecord(item.refLocalId, 'failed')
        await bumpCounter('records.failed', 1)
      }
      out.failed++
    }
  }

  await setSetting('lastSyncAt', Date.now())
  out.ms = performance.now() - t0
  return out
}

async function markRecord(localId: string, status: SyncStatus) {
  const rec = await db.records.where('localId').equals(localId).first()
  if (!rec?.id) return
  await db.records.update(rec.id, { syncStatus: status, lastModified: Date.now() })
}

// ── ความขัดแย้ง ──────────────────────────────────────────────────────────

export type ConflictChoice = 'keep-local' | 'take-server'

export async function resolveConflict(recordId: number, choice: ConflictChoice) {
  const rec = await db.records.get(recordId)
  if (!rec) return
  if (choice === 'take-server' && rec.serverPayload) {
    await db.records.update(recordId, {
      payload: rec.serverPayload,
      serverPayload: null,
      syncStatus: 'synced',
      lastModified: Date.now(),
    })
  } else {
    await db.records.update(recordId, {
      serverPayload: null,
      syncStatus: 'pending',
      lastModified: Date.now(),
    })
    await enqueue('records', 'update', rec.localId, roughBytes(rec))
    await bumpCounter('records.pending', 1)
  }
  await bumpCounter('records.conflict', -1)
}

// ── นโยบายเก็บย้อนหลัง ───────────────────────────────────────────────────

export interface PruneResult {
  recordsRemoved: number
  photosRemoved: number
  bytesFreed: number
}

/**
 * ลบข้อมูลที่ซิงค์แล้วและเก่ากว่านโยบาย
 * เหตุผลไม่ใช่พื้นที่ไม่พอ (โควตา 13 GB เทียบกับ 5 MB/ปี) แต่เพราะ
 * ยิ่งค้างในเครื่องนานยิ่งเสี่ยงหายไปพร้อมเครื่อง และเสี่ยงข้อมูลรั่วถ้าเครื่องหาย
 */
export async function pruneOldData(): Promise<PruneResult> {
  const policy = await getRetention()
  const cutoff = Date.now() - policy.keepSyncedDays * DAY
  const res: PruneResult = { recordsRemoved: 0, photosRemoved: 0, bytesFreed: 0 }

  const old = await db.records
    .where('occurredAt')
    .below(cutoff)
    .filter((r) => r.syncStatus === 'synced')
    .toArray()

  for (const rec of old) {
    if (policy.dropPhotosAfterSync) {
      const photos = await db.photos.where('recordLocalId').equals(rec.localId).toArray()
      for (const p of photos) {
        if (p.syncStatus !== 'synced') continue
        res.bytesFreed += p.bytes
        res.photosRemoved++
        await db.photos.delete(p.id!)
      }
    }
    await db.records.delete(rec.id!)
    res.recordsRemoved++
  }
  await setSetting('lastPruneAt', Date.now())
  return res
}

// ── สรุปสถานะสำหรับหน้า UI ───────────────────────────────────────────────

export interface SyncSnapshot {
  pending: number
  failed: number
  conflict: number
  outbox: number
  oldestPendingAt: number | null
  lastSyncAt: number | null
  online: boolean
}

export async function syncSnapshot(): Promise<SyncSnapshot> {
  const [pending, failed, conflict, outbox, oldest, lastSyncAt] = await Promise.all([
    db.counters.get('records.pending'),
    db.counters.get('records.failed'),
    db.counters.get('records.conflict'),
    db.counters.get('outbox.size'),
    db.outbox.orderBy('id').first(),
    getSetting<number | null>('lastSyncAt', null),
  ])
  return {
    pending: pending?.value ?? 0,
    failed: failed?.value ?? 0,
    conflict: conflict?.value ?? 0,
    outbox: outbox?.value ?? 0,
    oldestPendingAt: oldest?.createdAt ?? null,
    lastSyncAt,
    online: navigator.onLine,
  }
}
