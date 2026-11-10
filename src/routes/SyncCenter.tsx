/**
 * ศูนย์ซิงค์ — ตอบคำถามเดียวให้ชัด: "ตอนนี้มีอะไรที่ยังไม่ขึ้นเซิร์ฟเวอร์บ้าง"
 *
 * เหตุผลที่หน้านี้สำคัญกว่าที่คิด: ข้อมูลบนเครื่องคือสำเนาชั่วคราว
 * ถ้าเครื่องหายก่อนซิงค์ งานที่บันทึกไว้หายตามไปด้วย
 * ยิ่งค้างนานยิ่งเสี่ยง จึงต้องเห็นอายุของรายการที่ค้างเสมอ
 */
import { useCallback, useEffect, useState } from 'react'
import { CloudOff, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { Card, Empty, Field, KeyValues, List, Note, PageHeader, Pill, Skeleton, Stat, Stats } from '../components/ui'
import { db, rebuildCounters } from '../data/db'
import { toast } from '../components/Toast'
import {
  claimLegacyOutbox,
  countLegacyOutbox,
  discardLegacyOutbox,
  getRetention,
  pruneOldData,
  resolveConflict,
  resolveQueueConflict,
  retryFailedRecords,
  runSync,
  setRetention,
  syncSnapshot,
  type RetentionPolicy,
  type SyncOutcome,
  type SyncSnapshot,
} from '../data/sync'
import { estimate } from '../lib/storage'
import { ACTIVITY_BY_CODE } from '../domain/activities'
import { age, bytes, dateTime, duration, num } from '../lib/format'
import type { ActivityRecord, OutboxItem } from '../domain/types'
import { useAccount } from '../state/session'

export function SyncCenter() {
  const { userId } = useAccount()
  const [snap, setSnap] = useState<SyncSnapshot | null>(null)
  const [queue, setQueue] = useState<OutboxItem[]>([])
  const [conflicts, setConflicts] = useState<ActivityRecord[]>([])
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null)
  const [quota, setQuota] = useState<{ quota: number; usage: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState<SyncOutcome | null>(null)
  const [pruned, setPruned] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [s, q, c, p, e] = await Promise.all([
      syncSnapshot(),
      db.outbox.orderBy('nextAttemptAt').toArray().then((items) =>
        items.filter((item) => item.ownerUserId === userId || item.ownerUserId === undefined).slice(0, 50),
      ),
      db.records.where('syncStatus').equals('conflict').limit(30).toArray(),
      getRetention(),
      estimate(),
    ])
    setSnap(s)
    setQueue(q)
    setConflicts(c)
    setPolicy(p)
    setQuota({ quota: e.quota, usage: e.usage })
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  async function doSync() {
    setBusy(true)
    setLast(await runSync())
    await load()
    setBusy(false)
  }

  async function doPrune() {
    setBusy(true)
    const r = await pruneOldData()
    setPruned(
      `ลบบันทึกเก่าที่ซิงค์แล้ว ${num(r.recordsRemoved)} รายการ · รูป ${num(r.photosRemoved)} รูป · คืนพื้นที่ ${bytes(r.bytesFreed)}`,
    )
    await load()
    setBusy(false)
  }

  async function fixCounters() {
    setBusy(true)
    await rebuildCounters()
    await load()
    setBusy(false)
  }

  async function retryOrphanedRecords() {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      const retried = await retryFailedRecords()
      if (retried > 0) {
        toast.info(`นำบันทึก ${num(retried)} รายการกลับเข้าคิวแล้ว · เลือกผูกคิวเก่ากับบัญชีก่อนส่ง`)
      } else {
        toast.info('ไม่มีบันทึกล้มเหลวที่ขาดคิวส่ง')
      }
      await load()
    } catch (error) {
      setActionError(`นำบันทึกกลับเข้าคิวไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function manageLegacyQueue(action: 'claim' | 'discard') {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      const count = await countLegacyOutbox()
      if (count === 0) {
        await load()
        return
      }
      if (action === 'claim') {
        if (!userId || !window.confirm(
          `ผูกคิวเก่า ${num(count)} รายการกับบัญชีที่กำลังใช้อยู่ แล้วส่งในชื่อบัญชีนี้หรือไม่?`,
        )) return
        const claimed = await claimLegacyOutbox(userId)
        toast.ok(`ผูกคิวเก่า ${num(claimed)} รายการกับบัญชีนี้แล้ว`)
      } else {
        if (!window.confirm(
          `ลบคิวเก่า ${num(count)} รายการหรือไม่? ข้อมูลงาน/รูปในเครื่องจะยังอยู่ แต่จะไม่ถูกส่ง`,
        )) return
        const discarded = await discardLegacyOutbox()
        toast.info(`ลบคิวเก่า ${num(discarded)} รายการแล้ว โดยเก็บข้อมูลในเครื่องไว้`)
      }
      await load()
    } catch (error) {
      setActionError(`จัดการคิวเก่าไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function resolveQueueItem(q: OutboxItem, choice: 'retry' | 'discard') {
    if (busy || q.id === undefined) return
    if (choice === 'discard' && !window.confirm(
      'ลบคิวส่งนี้หรือไม่? ข้อมูลในเครื่องจะยังอยู่และจะไม่ถูกส่งขึ้นเซิร์ฟเวอร์',
    )) return
    setBusy(true)
    setActionError(null)
    try {
      const resolved = await resolveQueueConflict(q.id, choice)
      if (resolved) {
        toast.info(choice === 'retry' ? 'นำคิวกลับไปรอส่งแล้ว' : 'ลบคิวแล้ว โดยเก็บข้อมูลในเครื่องไว้')
      }
      await load()
    } catch (error) {
      setActionError(`จัดการคิวขัดแย้งไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  if (!snap || !policy) return <Skeleton rows={5} />

  const totalPending = snap.pending + snap.failed + snap.conflict

  return (
    <>
      <PageHeader title="ศูนย์ซิงค์" sub="ข้อมูลที่ยังไม่ขึ้นระบบ" />
      <Card title="สถานะการซิงค์">
        <Stats quad>
          <Stat label="รอส่ง" value={snap.pending} sub="รายการ" tone={snap.pending > 0 ? 'warn' : 'ok'} />
          <Stat label="ล้มเหลว" value={snap.failed} sub="รายการ" tone={snap.failed > 0 ? 'crit' : undefined} />
          <Stat label="ขัดแย้ง" value={snap.conflict} sub="รายการ" tone={snap.conflict > 0 ? 'crit' : undefined} />
          <Stat label="เครือข่าย" value={snap.online ? 'ออนไลน์' : 'ออฟไลน์'} tone={snap.online ? 'ok' : 'warn'} />
        </Stats>
        <KeyValues
          items={[
            ['เครือข่าย', snap.online ? 'ออนไลน์' : 'ออฟไลน์'],
            ['ซิงค์ล่าสุด', snap.lastSyncAt ? `${dateTime(snap.lastSyncAt)} (${age(snap.lastSyncAt)})` : 'ยังไม่เคย'],
            ['รายการเก่าสุดที่ค้าง', snap.oldestPendingAt ? age(snap.oldestPendingAt) : '—'],
            ['พื้นที่ที่ใช้', quota ? `${bytes(quota.usage)} จากโควตา ${bytes(quota.quota)}` : '—'],
          ]}
        />

        {!snap.online && (
          <Note>
            <CloudOff size={14} className="ic-inline" /> ออฟไลน์อยู่ — บันทึกต่อได้ตามปกติ
          </Note>
        )}
        {snap.blockedOutbox > snap.legacyOutbox && (
          <Note>
            มีคิว {num(snap.blockedOutbox - snap.legacyOutbox)} รายการที่ผูกกับบัญชีอื่นหรือไม่ได้กำหนดเจ้าของไว้
            จึงพักไว้และจะไม่ส่งด้วยบัญชีนี้
          </Note>
        )}
        {snap.legacyOutbox > 0 && (
          <div className="advice warn">
            <div>
              <b>พบคิวเก่าที่ยังไม่มีเจ้าของ</b>
              มี {num(snap.legacyOutbox)} รายการ — เลือกผูกกับบัญชีนี้ หรือทิ้งเฉพาะคิวโดยเก็บข้อมูลในเครื่องไว้
              <div className="row snug">
                <button
                  className="btn ghost"
                  disabled={busy || !userId}
                  onClick={() => void manageLegacyQueue('claim')}
                >
                  ผูกกับบัญชีนี้
                </button>
                <button
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => void manageLegacyQueue('discard')}
                >
                  ทิ้งคิวเก่า
                </button>
              </div>
            </div>
          </div>
        )}
        {snap.failed > 0 && (
          <Note>
            มีบันทึกที่ส่งไม่สำเร็จ {num(snap.failed)} รายการ
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => void retryOrphanedRecords()}
              style={{ marginInlineStart: 10 }}
            >
              นำกลับเข้าคิวส่ง
            </button>
          </Note>
        )}

        {/* OFF-07 — เตือนสองเกณฑ์: ค้างมากเกินไป และค้างนานเกินไป */}
        {snap.pending > policy.warnPendingOver && (
          <div className="advice warn">
            <TriangleAlert size={17} className="ic" />
            <div>
              <b>ค้างส่งเกินเกณฑ์</b>
              มี {num(snap.pending)} รายการรอส่ง เกินเกณฑ์ {num(policy.warnPendingOver)} รายการ —
              ยิ่งค้างมาก ยิ่งเสี่ยงหายพร้อมเครื่อง
            </div>
          </div>
        )}

        {snap.oldestPendingAt &&
          Date.now() - snap.oldestPendingAt > policy.warnAgeHours * 3_600_000 && (
            <div className="advice crit">
              <TriangleAlert size={17} className="ic" />
              <div>
                <b>ค้างนานเกินเกณฑ์</b>
                รายการเก่าสุดค้างมา {age(snap.oldestPendingAt)} เกินเกณฑ์ {policy.warnAgeHours} ชั่วโมง —
                ถ้าเครื่องหายหรือพังตอนนี้ ข้อมูลส่วนนี้จะหายไปด้วย ควรหาสัญญาณแล้วกดส่ง
              </div>
            </div>
          )}

        <div className="row">
          <button className="btn" onClick={() => void doSync()} disabled={busy || !snap.online}>
            <RefreshCw size={16} /> {busy ? 'กำลังส่ง…' : 'ซิงค์เดี๋ยวนี้'}
          </button>
          <button className="btn ghost" onClick={() => void fixCounters()} disabled={busy}>
            คำนวณตัวนับใหม่
          </button>
        </div>

        {last && (
          <Note>
            ส่ง {num(last.attempted)} รายการ · สำเร็จ {num(last.succeeded)} · ล้มเหลว {num(last.failed)} ·
            ขัดแย้ง {num(last.conflicts)} · ใช้เวลา {duration(last.ms)} · ปริมาณ {bytes(last.bytes)}
            {last.stoppedBecauseOffline && ' · หยุดกลางคันเพราะขาดสัญญาณ'}
          </Note>
        )}
        {actionError && <Note>{actionError}</Note>}
      </Card>

      {conflicts.length > 0 && (
        <Card
          title="ต้องเลือกว่าจะเก็บฉบับไหน"
          hint="เกิดเมื่อข้อมูลเดียวกันถูกแก้ทั้งบนเครื่องและบนเซิร์ฟเวอร์"
        >
          <List>
            {conflicts.map((r) => (
              <li key={r.localId}>
                <div className="feed-item">
                  <div className="row-title">
                    <span className="code">{r.activityCode}</span>
                    {ACTIVITY_BY_CODE.get(r.activityCode)?.name ?? r.activityCode}
                    <Pill tone="crit">ขัดแย้ง</Pill>
                  </div>
                  <div className="row-sub">
                    {dateTime(r.occurredAt)} · บันทึกโดย {r.recordedBy}
                  </div>
                  <div className="row snug">
                    <button
                      className="btn ghost"
                      onClick={() => void resolveConflict(r.id!, 'keep-local').then(load)}
                    >
                      เก็บฉบับในเครื่อง
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => void resolveConflict(r.id!, 'take-server').then(load)}
                    >
                      ใช้ฉบับจากเซิร์ฟเวอร์
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </List>
        </Card>
      )}

      <Card title="คิวส่ง" hint={`${num(queue.length)} รายการแรก`}>
        {queue.length === 0 ? (
          <Empty>คิวว่าง — ส่งขึ้นเซิร์ฟเวอร์ครบแล้ว</Empty>
        ) : (
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>รายการ</th>
                  <th>ขนาด</th>
                  <th>ลองแล้ว</th>
                  <th>ลองใหม่</th>
                  <th>ข้อผิดพลาด</th>
                  <th>การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((q) => (
                  <tr key={q.localId}>
                    <td>
                      {q.op} · {q.table}
                      {q.status === 'conflict' && <Pill tone="crit">ขัดแย้ง · พักส่ง</Pill>}
                      {q.ownerUserId === undefined && <Pill tone="warn">คิวเก่า · ไม่มีเจ้าของ</Pill>}
                    </td>
                    <td className="num">{bytes(q.bytes)}</td>
                    <td className="num">{q.attempts}</td>
                    <td className="num">
                      {q.nextAttemptAt > Date.now()
                        ? `อีก ${duration(q.nextAttemptAt - Date.now())}`
                        : 'พร้อมส่ง'}
                    </td>
                    <td>{q.lastError ?? '—'}</td>
                    <td>
                      {q.status === 'conflict' ? (
                        <div className="row snug">
                          <button
                            className="btn ghost"
                            disabled={busy}
                            onClick={() => void resolveQueueItem(q, 'retry')}
                          >
                            ส่งอีกครั้ง
                          </button>
                          <button
                            className="btn ghost"
                            disabled={busy}
                            onClick={() => void resolveQueueItem(q, 'discard')}
                          >
                            ทิ้งคิว
                          </button>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="นโยบายเก็บข้อมูลบนเครื่อง">
        <Field label="เก็บบันทึกที่ซิงค์แล้วไว้" hint="วัน">
          <input
            type="number"
            min={1}
            max={365}
            value={policy.keepSyncedDays}
            onChange={(e) => setPolicy({ ...policy, keepSyncedDays: Number(e.target.value) })}
          />
        </Field>
        <Field label="เตือนเมื่อค้างเกิน" hint="รายการ">
          <input
            type="number"
            min={1}
            value={policy.warnPendingOver}
            onChange={(e) => setPolicy({ ...policy, warnPendingOver: Number(e.target.value) })}
          />
        </Field>
        <Field label="เตือนเมื่อค้างนานเกิน" hint="ชั่วโมง">
          <input
            type="number"
            min={1}
            value={policy.warnAgeHours}
            onChange={(e) => setPolicy({ ...policy, warnAgeHours: Number(e.target.value) })}
          />
        </Field>
        <label className="field check">
          <input
            type="checkbox"
            checked={policy.dropPhotosAfterSync}
            onChange={(e) => setPolicy({ ...policy, dropPhotosAfterSync: e.target.checked })}
          />
          <span>
            ลบรูปออกจากเครื่องทันทีที่ส่งขึ้นเซิร์ฟเวอร์แล้ว
          </span>
        </label>

        <div className="row">
          <button className="btn" onClick={() => void setRetention(policy)} disabled={busy}>
            บันทึกนโยบาย
          </button>
          <button className="btn danger" onClick={() => void doPrune()} disabled={busy}>
            <Trash2 size={16} /> ล้างข้อมูลเก่าเดี๋ยวนี้
          </button>
        </div>
        {pruned && <Note>{pruned}</Note>}
      </Card>

      {totalPending === 0 && (
        <Card>
          <Empty>ทุกอย่างซิงค์เรียบร้อย ไม่มีข้อมูลค้างอยู่บนเครื่องนี้</Empty>
        </Card>
      )}
    </>
  )
}
