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
import { bumpCounter, db, getSetting, newLocalId, setSetting } from './db.ts'
import type { ActivityRecord, OutboxItem, SyncStatus } from '../domain/types'
import { forceSignOut, useSession } from '../state/session.ts'

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
    ownerUserId: useSession.getState().account?.userId ?? null,
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

/** ปลายทางจริง ตั้งผ่าน VITE_API_URL — ไม่ตั้งไว้ = ใช้ตัวจำลองสำหรับเดโมและทดสอบ UX */
const API_URL = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

/** ตัวข้อมูลจริงที่ต้องส่งไปกับรายการในคิว */
async function payloadFor(item: OutboxItem): Promise<unknown> {
  if (item.table === 'records') return db.records.where('localId').equals(item.refLocalId).first()
  if (item.table === 'tasks') return db.tasks.where('localId').equals(item.refLocalId).first()
  if (item.table === 'photos') return db.photos.where('localId').equals(item.refLocalId).first()
  if (item.table === 'farms') return db.farms.get(item.refLocalId)
  return db.animals.get(item.refLocalId)
}

/**
 * จุดเดียวที่ต้องแตะเมื่อเปลี่ยน backend
 *
 * เมื่อมี VITE_API_URL จะส่งจริงและแปลผลตามรหัสสถานะ
 *   409  = ข้อมูลฝั่งเซิร์ฟเวอร์ใหม่กว่า ถือเป็นความขัดแย้ง ให้ผู้ใช้เลือกเอง (OFF-03)
 *   4xx  = คำขอผิดรูป ลองใหม่ก็ไม่หาย แต่ยังนับเป็น error เพื่อให้คนเข้ามาดูหลังครบ 5 ครั้ง
 *   5xx / เครือข่ายล้ม = error แล้วเข้ารอบ backoff ตามปกติ
 * ถ้าไม่ตั้งค่าไว้ จะจำลองผลลัพธ์ตามสัดส่วนที่ใกล้เคียงงานภาคสนามเหมือนเดิม
 */
async function pushOne(item: OutboxItem, token: string | null): Promise<'ok' | 'conflict' | 'error'> {
  if (!API_URL || useSession.getState().account?.demo) {
    // หน่วงตามขนาดข้อมูลเล็กน้อย ให้ใกล้เคียงการส่งจริงบนเน็ตมือถือ
    await new Promise((r) => setTimeout(r, 60 + Math.min(400, item.bytes / 2000) + Math.random() * 120))
    const roll = Math.random()
    if (roll < 0.08) return 'error'
    if (roll < 0.11) return 'conflict'
    return 'ok'
  }

  try {
    const body = await payloadFor(item)
    if (!body) return 'ok' // ของถูกลบไปแล้ว ไม่มีอะไรต้องส่ง
    // รูปส่งเป็น multipart — ไฟล์ไบนารีส่งผ่าน JSON ไม่ได้ (อัปขึ้น object storage ที่เซิร์ฟเวอร์)
    if (item.table === 'photos') {
      const photo = body as {
        localId: string
        recordLocalId: string | null
        blob: Blob
        width: number
        height: number
        at: number
      }
      const fd = new FormData()
      fd.append('op', item.op)
      fd.append('localId', photo.localId)
      fd.append('recordLocalId', photo.recordLocalId ?? '')
      fd.append('width', String(photo.width ?? 0))
      fd.append('height', String(photo.height ?? 0))
      fd.append('at', String(photo.at ?? 0))
      if (item.op !== 'delete' && photo.blob) fd.append('file', photo.blob, `${photo.localId}.jpg`)
      // ไม่ตั้ง content-type เอง — เบราว์เซอร์จะใส่ boundary ของ multipart ให้
      const pres = await fetch(`${API_URL}/sync/photos`, {
        method: 'POST',
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: fd,
      })
      if (pres.status === 401) {
        forceSignOut()
        return 'error'
      }
      if (pres.status === 409) return 'conflict'
      return pres.ok ? 'ok' : 'error'
    }

    const res = await fetch(`${API_URL}/sync/${item.table}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // แนบ JWT ที่ได้จาก /auth/login — เซิร์ฟเวอร์บังคับยืนยันตัวตน (SEC-06)
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ op: item.op, localId: item.refLocalId, data: body }),
    })
    // โทเคนหมดอายุ/ไม่ถูกต้อง — ออกจากระบบให้ผู้ใช้เข้าใหม่ แล้วค่อยลองส่งรอบหน้า
    if (res.status === 401) {
      forceSignOut()
      return 'error'
    }
    if (res.status === 409) {
      // เก็บฉบับของเซิร์ฟเวอร์ไว้ให้หน้าจอเทียบ ห้ามทับเงียบ ๆ
      const server = await res.json().catch(() => null)
      if (item.table === 'records' && server && typeof server === 'object') {
        const rec = await db.records.where('localId').equals(item.refLocalId).first()
        if (rec?.id)
          await db.records.update(rec.id, {
            serverPayload: (server as { payload?: Record<string, unknown> }).payload ?? server,
          })
      }
      return 'conflict'
    }
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

/**
 * @param force ส่งทุกรายการในคิวทันทีโดยไม่รอรอบ backoff — ใช้ตอนผู้ใช้กดปุ่มส่งเอง
 *              เพราะคนกดคาดหวังว่าจะส่งตอนนี้ ไม่ใช่อีก 10 นาที
 */
export async function runSync(limit = 50, force = false): Promise<SyncOutcome> {
  return withSyncLock(() => performSync(limit, force))
}

let syncInFlight: Promise<SyncOutcome> | null = null

function withSyncLock(operation: () => Promise<SyncOutcome>): Promise<SyncOutcome> {
  if (syncInFlight) return syncInFlight
  const run = operation()
  syncInFlight = run
  void run.then(
    () => {
      if (syncInFlight === run) syncInFlight = null
    },
    () => {
      if (syncInFlight === run) syncInFlight = null
    },
  )
  return run
}

async function performSync(limit: number, force: boolean): Promise<SyncOutcome> {
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

  const account = useSession.getState().account
  const userId = account?.userId
  if (!userId) {
    out.ms = performance.now() - t0
    return out
  }
  const now = Date.now()
  const due = (force
    ? await db.outbox.orderBy('id').toArray()
    : await db.outbox.where('nextAttemptAt').belowOrEqual(now).toArray())
    .filter((item) => item.ownerUserId === userId && item.status !== 'conflict')
    .slice(0, limit)

  for (const item of due) {
    if (useSession.getState().account?.userId !== userId) break
    if (!navigator.onLine) {
      out.stoppedBecauseOffline = true
      break
    }
    out.attempted++
    const isRecord = item.table === 'records'
    const record = isRecord
      ? await db.records.where('localId').equals(item.refLocalId).first()
      : undefined
    const result = await pushOne(item, account?.token || null)

    if (result === 'ok') {
      if (isRecord) {
        await markRecord(item.refLocalId, 'synced')
        if (record?.syncStatus === 'pending') await bumpCounter('records.pending', -1)
        if (record?.syncStatus === 'failed') await bumpCounter('records.failed', -1)
      } else if (item.table === 'photos') {
        await markPhoto(item.refLocalId, 'synced')
      }
      await db.outbox.delete(item.id!)
      await bumpCounter('outbox.size', -1)
      out.succeeded++
      out.bytes += item.bytes
    } else if (result === 'conflict') {
      if (isRecord) {
        await markRecord(item.refLocalId, 'conflict')
        if (record?.syncStatus === 'pending') await bumpCounter('records.pending', -1)
        if (record?.syncStatus === 'failed') await bumpCounter('records.failed', -1)
        await bumpCounter('records.conflict', 1)
        await db.outbox.delete(item.id!)
        await bumpCounter('outbox.size', -1)
      } else {
        if (item.table === 'photos') await markPhoto(item.refLocalId, 'conflict')
        await db.outbox.update(item.id!, {
          status: 'conflict',
          lastError: 'ข้อมูลขัดแย้งกับเซิร์ฟเวอร์ · คิวถูกพักไว้ ไม่ส่งซ้ำอัตโนมัติ',
        })
      }
      out.conflicts++
    } else {
      const attempts = item.attempts + 1
      await db.outbox.update(item.id!, {
        attempts,
        nextAttemptAt: Date.now() + backoffMs(attempts),
        lastError: 'ส่งไม่สำเร็จ เครือข่ายขัดข้อง',
      })
      // ครบ 5 ครั้งถือว่าล้มเหลว ต้องให้คนเข้ามาดู — นับครั้งเดียวตอนข้ามเกณฑ์
      // ไม่งั้นทุกรอบถัดไปจะบวกตัวนับซ้ำจนยอด "ล้มเหลว" ในศูนย์ซิงค์เพี้ยน
      if (attempts >= 5 && isRecord && record?.syncStatus === 'pending') {
        await markRecord(item.refLocalId, 'failed')
        await bumpCounter('records.pending', -1)
        await bumpCounter('records.failed', 1)
      }
      out.failed++
    }
  }

  await setSetting('lastSyncAt', Date.now())
  out.ms = performance.now() - t0
  return out
}

/** ส่งทั้งคิวเป็นชุด ๆ จนหมดหรือไม่มีความคืบหน้า — สำหรับปุ่ม "ส่งข้อมูล" */
export async function runSyncAll(maxItems = 1000): Promise<SyncOutcome> {
  return withSyncLock(() => performSyncAll(maxItems))
}

async function performSyncAll(maxItems: number): Promise<SyncOutcome> {
  const total: SyncOutcome = {
    attempted: 0, succeeded: 0, failed: 0, conflicts: 0,
    bytes: 0, ms: 0, stoppedBecauseOffline: false,
  }
  const seen = new Set<number>()
  while (total.attempted < maxItems) {
    const out = await performSync(50, true)
    total.attempted += out.attempted
    total.succeeded += out.succeeded
    total.failed += out.failed
    total.conflicts += out.conflicts
    total.bytes += out.bytes
    total.ms += out.ms
    total.stoppedBecauseOffline = out.stoppedBecauseOffline
    // หยุดเมื่อคิวหมด ขาดสัญญาณ หรือรอบนี้ไม่มีอะไรออกจากคิวเลย (ล้มทุกรายการ จะวนซ้ำไม่จบ)
    if (out.stoppedBecauseOffline || out.attempted === 0 || out.succeeded + out.conflicts === 0) break
    const userId = useSession.getState().account?.userId
    const left = userId
      ? await db.outbox.filter((item) => item.ownerUserId === userId && item.status !== 'conflict').count()
      : 0
    if (left === 0 || seen.has(left)) break
    seen.add(left)
  }
  return total
}

async function markRecord(localId: string, status: SyncStatus) {
  const rec = await db.records.where('localId').equals(localId).first()
  if (!rec?.id) return
  await db.records.update(rec.id, { syncStatus: status, lastModified: Date.now() })
}

async function markPhoto(localId: string, status: SyncStatus) {
  const photo = await db.photos.where('localId').equals(localId).first()
  if (!photo?.id) return
  await db.photos.update(photo.id, { syncStatus: status })
}

async function updateCounter(key: string, delta: number) {
  const row = await db.counters.get(key)
  await db.counters.put({ key, value: Math.max(0, (row?.value ?? 0) + delta) })
}

/** จำนวนคิวจากรุ่นเก่าที่ยังไม่มีเจ้าของ — คิวที่ตั้งใจให้เป็น null จะไม่นับรวม */
export async function countLegacyOutbox(): Promise<number> {
  return db.outbox.filter((item) => item.ownerUserId === undefined).count()
}

/** ผูกคิวเก่ากับบัญชีที่ผู้ใช้เลือกเอง */
export async function claimLegacyOutbox(userId: string): Promise<number> {
  if (!userId) return 0
  return db.transaction('rw', db.outbox, async () =>
    db.outbox.filter((item) => item.ownerUserId === undefined).modify({ ownerUserId: userId }),
  )
}

/**
 * ลบเฉพาะคิวเก่าที่ไม่มีเจ้าของ โดยเก็บข้อมูลในเครื่องและทำเครื่องหมายรายการที่เกี่ยวข้อง
 * ว่าไม่ซิงค์สำเร็จ เพื่อไม่ให้การทิ้งคิวดูเหมือนข้อมูลขึ้นเซิร์ฟเวอร์แล้ว
 */
export async function discardLegacyOutbox(): Promise<number> {
  return db.transaction('rw', db.outbox, db.records, db.photos, db.counters, async () => {
    const items = await db.outbox.filter((item) => item.ownerUserId === undefined).toArray()
    if (items.length === 0) return 0

    const recordIds = new Set(items.filter((item) => item.table === 'records').map((item) => item.refLocalId))
    const photoIds = new Set(items.filter((item) => item.table === 'photos').map((item) => item.refLocalId))
    let pendingRecords = 0
    let failedRecords = 0
    let pendingPhotos = 0

    for (const localId of recordIds) {
      const record = await db.records.where('localId').equals(localId).first()
      if (record?.id && record.syncStatus === 'pending') {
        await db.records.update(record.id, { syncStatus: 'failed' })
        pendingRecords++
        failedRecords++
      }
    }

    for (const localId of photoIds) {
      const photo = await db.photos.where('localId').equals(localId).first()
      if (photo?.id && photo.syncStatus === 'pending') {
        await db.photos.update(photo.id, { syncStatus: 'failed' })
        pendingPhotos++
      }
    }

    await db.outbox.bulkDelete(items.flatMap((item) => item.id === undefined ? [] : [item.id]))
    await updateCounter('outbox.size', -items.length)
    if (pendingRecords) {
      await updateCounter('records.pending', -pendingRecords)
      await updateCounter('records.failed', failedRecords)
    }
    if (pendingPhotos) await updateCounter('photos.pending', -pendingPhotos)
    return items.length
  })
}

/** สร้างคิวใหม่ให้บันทึกที่ล้มเหลว โดยคิวเก่าที่ไม่มีเจ้าของยังต้องให้ผู้ใช้เลือกบัญชีเอง */
export async function retryFailedRecords(): Promise<number> {
  return db.transaction('rw', db.records, db.outbox, db.counters, async () => {
    const records = await db.records.where('syncStatus').equals('failed').toArray()
    const userId = useSession.getState().account?.userId
    let retried = 0
    let newQueueItems = 0

    for (const record of records) {
      const existing = await db.outbox
        .where('refLocalId')
        .equals(record.localId)
        .filter((item) => item.table === 'records')
        .first()

      if (existing) {
        if (
          existing.ownerUserId !== undefined &&
          existing.ownerUserId !== userId
        ) continue
        await db.outbox.update(existing.id!, {
          status: undefined,
          attempts: 0,
          nextAttemptAt: Date.now(),
          lastError: null,
        })
      } else {
        const item: Omit<OutboxItem, 'id'> = {
          localId: newLocalId('ob'),
          table: 'records',
          op: record.serverId ? 'update' : 'create',
          refLocalId: record.localId,
          bytes: roughBytes(record),
          attempts: 0,
          nextAttemptAt: Date.now(),
          lastError: null,
          createdAt: Date.now(),
        }
        await db.outbox.add(item)
        newQueueItems++
      }

      await db.records.update(record.id!, { syncStatus: 'pending', lastModified: Date.now() })
      retried++
    }

    if (retried > 0) {
      await updateCounter('records.failed', -retried)
      await updateCounter('records.pending', retried)
    }
    if (newQueueItems > 0) await updateCounter('outbox.size', newQueueItems)
    return retried
  })
}

/** แก้คิวขัดแย้งที่ไม่ใช่บันทึกกิจกรรม (เช่น งาน/รูป) โดยไม่ทิ้งข้อมูลในเครื่อง */
export async function resolveQueueConflict(
  outboxId: number,
  choice: 'retry' | 'discard',
): Promise<boolean> {
  return db.transaction('rw', db.outbox, db.photos, db.counters, async () => {
    const item = await db.outbox.get(outboxId)
    if (!item || item.status !== 'conflict' || item.table === 'records') return false

    if (choice === 'retry') {
      await db.outbox.update(outboxId, {
        status: undefined,
        attempts: 0,
        nextAttemptAt: Date.now(),
        lastError: null,
      })
      if (item.table === 'photos') {
        const photo = await db.photos.where('localId').equals(item.refLocalId).first()
        if (photo?.id) {
          if (photo.syncStatus === 'conflict') await updateCounter('photos.pending', 1)
          await db.photos.update(photo.id, { syncStatus: 'pending' })
        }
      }
      return true
    }

    await db.outbox.delete(outboxId)
    await updateCounter('outbox.size', -1)
    if (item.table === 'photos') {
      const photo = await db.photos.where('localId').equals(item.refLocalId).first()
      if (photo?.id) await db.photos.update(photo.id, { syncStatus: 'failed' })
    }
    return true
  })
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
  blockedOutbox: number
  legacyOutbox: number
  oldestPendingAt: number | null
  lastSyncAt: number | null
  online: boolean
}

export async function syncSnapshot(): Promise<SyncSnapshot> {
  const userId = useSession.getState().account?.userId
  const [pending, failed, recordConflict, items, lastSyncAt] = await Promise.all([
    db.counters.get('records.pending'),
    db.counters.get('records.failed'),
    db.counters.get('records.conflict'),
    db.outbox.toArray(),
    getSetting<number | null>('lastSyncAt', null),
  ])
  const owned = items.filter((item) => item.ownerUserId === userId && userId !== undefined)
  const oldest = owned.filter((item) => item.status !== 'conflict').reduce<OutboxItem | undefined>(
    (old, item) => (!old || item.createdAt < old.createdAt ? item : old),
    undefined,
  )
  return {
    pending: pending?.value ?? 0,
    failed: failed?.value ?? 0,
    conflict: (recordConflict?.value ?? 0) +
      owned.filter((item) => item.status === 'conflict').length,
    outbox: owned.filter((item) => item.status !== 'conflict').length,
    blockedOutbox: items.filter((item) => !userId || item.ownerUserId !== userId).length,
    legacyOutbox: items.filter((item) => item.ownerUserId === undefined).length,
    oldestPendingAt: oldest?.createdAt ?? null,
    lastSyncAt,
    online: navigator.onLine,
  }
}
