/**
 * ตั้งค่า — ค่าพารามิเตอร์ชีววิทยา (ง-02) การนำเข้าข้อมูล (requirement ข้อ 3)
 * และบันทึกการแก้ไขข้อมูลสำคัญ (requirement ข้อ 8)
 */
import { useEffect, useState } from 'react'
import { Card, Chips, Empty, Field, List, Note, PageHeader, Pill, Row, Skeleton, Stat, Stats } from '../components/ui'
import { DEFAULT_PARAMS, PARAM_LABEL, PARAM_UNIT } from '../domain/rules'
import { getParams, saveParams } from '../data/queries'
import { db, writeAudit, type AuditEntry } from '../data/db'
import { seedIfEmpty } from '../data/seed'
import { HerdImport } from '../components/HerdImport'
import { EMPTY_ESTIMATE, estimate, isPersisted, requestPersist, type Estimate } from '../lib/storage'
import { useAccount } from '../state/session'
import { bytes, dateTime, num } from '../lib/format'
import { ROLE_LABEL } from '../domain/types'
import type { BioParams } from '../domain/types'

type Tab = 'params' | 'import' | 'audit' | 'data'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'params', label: 'พารามิเตอร์' },
  { value: 'import', label: 'นำเข้าข้อมูล' },
  { value: 'audit', label: 'บันทึกการแก้ไข' },
  { value: 'data', label: 'ข้อมูลในเครื่อง' },
]

const PARAM_ORDER: Array<keyof BioParams> = [
  'voluntaryWaitDays',
  'uterusCheckDays',
  'readinessCheckDays',
  'estrusCycleDays',
  'goldenPeriodFromHours',
  'goldenPeriodToHours',
  'pregnancyCheckDays',
  'gestationDays',
  'bcsScaleMax',
  'bcsMinBeforeBreeding',
  'alertLeadDays',
  'escalateAfterDays',
  'estrusWindowHours',
  'semenWarnStraws',
  'semenCritStraws',
]

export function Settings() {
  const account = useAccount()
  const [tab, setTab] = useState<Tab>('params')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [space, setSpace] = useState<Estimate>(EMPTY_ESTIMATE)
  const [params, setParams] = useState<BioParams | null>(null)
  const [saved, setSaved] = useState(false)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [resetPending, setResetPending] = useState<{ queued: number; records: number } | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getParams().then(setParams)
    void db.audit.orderBy('at').reverse().limit(50).toArray().then(setAudit)
    void (async () => {
      setResetPending(null)
      const [farms, animals, records, tasks, alerts, photos, queued, pendingRecords] = await Promise.all([
        db.farms.count(), db.animals.count(), db.records.count(),
        db.tasks.count(), db.alerts.count(), db.photos.count(),
        db.outbox.count(),
        db.records.where('syncStatus').anyOf('pending', 'failed', 'conflict').count(),
      ])
      setCounts({ farms, animals, records, tasks, alerts, photos })
      setResetPending({ queued, records: pendingRecords })
    })()
    void isPersisted().then(setPersisted)
    void estimate().then(setSpace)
  }, [tab])

  async function save() {
    if (!params) return
    const before = await getParams()
    await saveParams(params)
    // การเปลี่ยนพารามิเตอร์ต้องเก็บค่าเดิมไว้เสมอ เพื่อเทียบผลก่อน/หลังตาม ง-02
    await writeAudit({
      actor: `${account.name} (${ROLE_LABEL[account.role]})`,
      action: 'แก้ไขค่าพารามิเตอร์ชีววิทยา',
      target: 'bioParams',
      before,
      after: params,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function resetLocalData() {
    if (busy) return
    setBusy(true)
    setResetError(null)
    try {
      const [queued, records] = await Promise.all([
        db.outbox.count(),
        db.records.where('syncStatus').anyOf('pending', 'failed', 'conflict').count(),
      ])
      setResetPending({ queued, records })
      if (queued + records > 0) return
      if (!window.confirm('ต้องการรีเซ็ตข้อมูลในเครื่องหรือไม่?')) return
      await seedIfEmpty(true)
      location.reload()
    } catch (error) {
      setResetError(`รีเซ็ตไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  if (!params) return <Skeleton rows={5} />

  return (
    <>
      <PageHeader title="ตั้งค่า" />
      <Card>
        <Chips value={tab} options={TABS} onChange={setTab} />
      </Card>

      {tab === 'params' && (
        <Card
          title="ค่าพารามิเตอร์ชีววิทยา"
          hint="เปลี่ยนแล้วมีผลกับการคำนวณกำหนดการทั้งระบบทันที"
        >
          {PARAM_ORDER.map((k) => (
            <Field key={k} label={PARAM_LABEL[k]} hint={PARAM_UNIT[k]}>
              <input
                type="number"
                value={params[k]}
                onChange={(e) => setParams({ ...params, [k]: Number(e.target.value) })}
              />
            </Field>
          ))}
          <div className="row">
            <button className="btn" onClick={() => void save()}>
              บันทึกค่า
            </button>
            <button className="btn ghost" onClick={() => setParams({ ...DEFAULT_PARAMS })}>
              คืนค่าเริ่มต้น
            </button>
          </div>
          {saved && <Note>บันทึกแล้ว · กำหนดการที่สร้างใหม่จะใช้ค่าชุดนี้</Note>}
        </Card>
      )}

      {tab === 'import' && <HerdImport />}

      {tab === 'audit' && (
        <Card title="บันทึกการแก้ไขข้อมูลสำคัญ" hint={`${num(audit.length)} รายการล่าสุด`}>
          {audit.length === 0 ? (
            <Empty>ยังไม่มีการแก้ไขที่ถูกบันทึก</Empty>
          ) : (
            <List>
              {audit.map((a) => (
                <Row
                  key={a.id}
                  badge={<Pill tone="mute">{a.target}</Pill>}
                  title={a.action}
                  sub={`${dateTime(a.at)} · โดย ${a.actor}`}
                />
              ))}
            </List>
          )}
        </Card>
      )}

      {tab === 'data' && (
        <Card title="ข้อมูลในเครื่องนี้">
          <Stats>
            <Stat label="ฟาร์ม" value={num(counts.farms ?? 0)} />
            <Stat label="โค" value={num(counts.animals ?? 0)} />
            <Stat label="บันทึกกิจกรรม" value={num(counts.records ?? 0)} />
            <Stat label="งาน" value={num(counts.tasks ?? 0)} />
            <Stat label="แจ้งเตือน" value={num(counts.alerts ?? 0)} />
            <Stat label="รูป" value={num(counts.photos ?? 0)} />
          </Stats>

          {/* OFF-08 — ถ้าไม่ได้สิทธิ์นี้ ระบบลบข้อมูลงานทิ้งเองได้เมื่อพื้นที่ใกล้เต็ม */}
          <Stats>
            <Stat
              label="การเก็บข้อมูลถาวร"
              value={persisted === null ? '—' : persisted ? 'ได้รับสิทธิ์' : 'ยังไม่ได้'}
            />
            <Stat label="ใช้พื้นที่ไป" value={space.supported ? bytes(space.usage) : '—'} />
            <Stat label="โควตาของเครื่อง" value={space.supported ? bytes(space.quota) : '—'} />
          </Stats>
          {persisted === false && (
            <div className="row">
              <button
                className="btn ghost"
                onClick={async () => {
                  const ok = await requestPersist()
                  setPersisted(ok)
                }}
              >
                ขอสิทธิ์เก็บข้อมูลถาวร
              </button>
            </div>
          )}
          <Note>ถ้ายังไม่ได้สิทธิ์นี้ ข้อมูลที่ยังไม่ส่งอาจถูกลบเมื่อพื้นที่เครื่องใกล้เต็ม</Note>

          <div className="row">
            <button
              className="btn ghost"
              disabled={busy || resetPending === null || resetPending.queued + resetPending.records > 0}
              onClick={() => void resetLocalData()}
            >
              รีเซ็ตข้อมูลในเครื่อง
            </button>
          </div>
          {resetPending && resetPending.queued + resetPending.records > 0 ? (
            <Note>
              ส่งหรือแก้ไขข้อมูลที่ค้างก่อนจึงจะรีเซ็ตได้ · คิว {num(resetPending.queued)} รายการ /
              บันทึกที่รอส่ง ล้มเหลว หรือขัดแย้ง {num(resetPending.records)} รายการ
            </Note>
          ) : (
            <Note>ลบข้อมูลทั้งหมดบนเครื่องนี้ รวมบันทึกที่ซิงค์แล้ว</Note>
          )}
          {resetError && <Note>{resetError}</Note>}
        </Card>
      )}
    </>
  )
}
