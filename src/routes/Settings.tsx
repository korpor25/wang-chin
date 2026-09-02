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
import { dateTime, num } from '../lib/format'
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
  'dryOffBeforeCalvingDays',
  'bcsScaleMax',
  'bcsMinBeforeBreeding',
  'alertLeadDays',
  'escalateAfterDays',
  'estrusWindowHours',
]

/** คอลัมน์ที่ระบบรองรับตอนนำเข้าจากสเปรดชีต */
const IMPORT_TARGETS = [
  { key: 'rfid', label: 'RFID', required: true },
  { key: 'tagNo', label: 'เบอร์หู', required: true },
  { key: 'breed', label: 'สายพันธุ์', required: false },
  { key: 'bloodPct', label: 'เปอร์เซ็นต์สายเลือด', required: false },
  { key: 'birthDate', label: 'วันเกิด', required: false },
  { key: 'farmCode', label: 'รหัสฟาร์ม', required: true },
  { key: 'parity', label: 'ท้องที่', required: false },
  { key: 'lastCalvingAt', label: 'วันคลอดล่าสุด', required: false },
  { key: 'lastBcs', label: 'BCS ล่าสุด', required: false },
]

export function Settings() {
  const [tab, setTab] = useState<Tab>('params')
  const [params, setParams] = useState<BioParams | null>(null)
  const [saved, setSaved] = useState(false)
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [csv, setCsv] = useState('')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getParams().then(setParams)
    void db.audit.orderBy('at').reverse().limit(50).toArray().then(setAudit)
    void (async () => {
      const [farms, animals, records, tasks, alerts, photos] = await Promise.all([
        db.farms.count(), db.animals.count(), db.records.count(),
        db.tasks.count(), db.alerts.count(), db.photos.count(),
      ])
      setCounts({ farms, animals, records, tasks, alerts, photos })
    })()
  }, [tab])

  async function save() {
    if (!params) return
    const before = await getParams()
    await saveParams(params)
    // การเปลี่ยนพารามิเตอร์ต้องเก็บค่าเดิมไว้เสมอ เพื่อเทียบผลก่อน/หลังตาม ง-02
    await writeAudit({
      actor: 'ผู้ดูแลระบบ',
      action: 'แก้ไขค่าพารามิเตอร์ชีววิทยา',
      target: 'bioParams',
      before,
      after: params,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function parseCsv(text: string) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean)
    if (lines.length === 0) return setPreview(null)
    const split = (l: string) => l.split(/[,\t]/).map((s) => s.trim())
    const headers = split(lines[0])
    const rows = lines.slice(1, 6).map(split)
    setPreview({ headers, rows })
    // เดาการจับคู่คอลัมน์อัตโนมัติจากชื่อหัวตาราง
    const auto: Record<string, string> = {}
    for (const t of IMPORT_TARGETS) {
      const hit = headers.find(
        (h) => h.toLowerCase() === t.key.toLowerCase() || h === t.label,
      )
      if (hit) auto[t.key] = hit
    }
    setMapping(auto)
  }

  if (!params) return <Skeleton rows={5} />

  return (
    <>
      <PageHeader title="ตั้งค่า" sub="พารามิเตอร์ การนำเข้า และประวัติการแก้ไข" />
      <Card>
        <Chips value={tab} options={TABS} onChange={setTab} />
      </Card>

      {tab === 'params' && (
        <Card
          title="ค่าพารามิเตอร์ชีววิทยา"
          hint="เปลี่ยนแล้วมีผลกับการคำนวณกำหนดการทั้งระบบทันที"
        >
          <Note>
            ค่าพวกนี้คือสิ่งที่ที่ประชุมปรับได้ตาม ง-02 ทุกการเปลี่ยนจะถูกบันทึกค่าเดิมไว้
            เพื่อให้เทียบผลก่อนและหลังได้ว่ามาตรการไหนได้ผลจริง
          </Note>
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

      {tab === 'import' && (
        <>
          <Card
            title="นำเข้าข้อมูลจากสเปรดชีต"
            hint="วางข้อมูลจาก Excel / Google Sheets / CSV แล้วจับคู่คอลัมน์"
          >
            <Field label="วางข้อมูลที่นี่" hint="บรรทัดแรกคือหัวตาราง">
              <textarea
                rows={5}
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value)
                  parseCsv(e.target.value)
                }}
                placeholder="rfid,tagNo,breed,farmCode&#10;900100000001,WC0001,บราห์มัน,WC-001"
                style={{
                  width: '100%',
                  borderRadius: 11,
                  border: '1px solid var(--rule)',
                  background: 'var(--panel)',
                  color: 'var(--ink)',
                  padding: '8px 12px',
                  font: 'inherit',
                  fontFamily: 'var(--mono)',
                  fontSize: 12.5,
                }}
              />
            </Field>
          </Card>

          {preview && (
            <>
              <Card title="จับคู่คอลัมน์" hint={`พบ ${preview.headers.length} คอลัมน์ในไฟล์`}>
                {IMPORT_TARGETS.map((t) => (
                  <Field key={t.key} label={t.required ? `${t.label} *` : t.label}>
                    <select
                      value={mapping[t.key] ?? ''}
                      onChange={(e) => setMapping({ ...mapping, [t.key]: e.target.value })}
                    >
                      <option value="">— ไม่นำเข้า —</option>
                      {preview.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
                <div className="row">
                  <button className="btn" disabled>
                    ตรวจสอบและนำเข้า
                  </button>
                </div>
                <Note>
                  ระบบตรวจความถูกต้องก่อนนำเข้าเสมอ ทั้งรูปแบบวันที่ ช่วงค่า BCS 1–9
                  และรหัสฟาร์มที่มีอยู่จริง จากนั้นออกรายงานว่าแถวไหนสำเร็จ แถวไหนผิดพลาดเพราะอะไร
                </Note>
              </Card>

              <Card title="ตัวอย่างข้อมูล" hint="5 แถวแรก">
                <div className="tablewrap">
                  <table className="data">
                    <thead>
                      <tr>
                        {preview.headers.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}

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
          <div className="row">
            <button
              className="btn ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await seedIfEmpty(true)
                setBusy(false)
                location.reload()
              }}
            >
              รีเซ็ตข้อมูลในเครื่อง
            </button>
          </div>
          <Note>
            การรีเซ็ตจะลบข้อมูลบนเครื่องนี้แล้วดึงชุดตั้งต้นมาใหม่ ใช้เมื่อข้อมูลในเครื่องเสียหาย
            บันทึกที่ยังไม่ได้ส่งขึ้นระบบจะหายไปด้วย
          </Note>
        </Card>
      )}
    </>
  )
}
