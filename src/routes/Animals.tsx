/** ทะเบียนโค — ค้นด้วย RFID/เบอร์หู กรองตามระยะของวงจรและฟาร์ม */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Download, Plus, ScanLine } from 'lucide-react'
import { Card, Chips, Empty, Note, Pill, SearchBox } from '../components/ui'
import { CYCLE_LABEL, parityLabel, type Animal, type BioParams, type CycleStage, type Farm, type Role } from '../domain/types'
import { getParams, searchAnimals } from '../data/queries'
import { ACTIVITY_BY_CODE } from '../domain/activities'
import { useAccount } from '../state/session'
import { addDays } from '../domain/rules'
import { BAND_TONE, bcsBand } from '../domain/bcs'
import { db } from '../data/db'
import { animalAge, num } from '../lib/format'
import { downloadMatrixCsv, herdMatrix } from '../data/herdMatrix'

const dayShort = (ts: number) =>
  new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

const DAY = 86_400_000

interface NextStep {
  line: string
  action: string
  /** รหัสกิจกรรมที่ควรทำต่อ — null = ไม่มีอะไรต้องบันทึก */
  code: string | null
  to: string
  tone: 'ok' | 'warn' | 'crit' | 'info' | ''
}

const form = (code: string, animalId: string) =>
  `/record/${encodeURIComponent(code)}?animal=${animalId}`

/**
 * บรรทัดสรุปและปุ่มลงมือทำของโคหนึ่งตัว
 *
 * ดีไซน์วางให้ทุกใบมีปุ่มเดียวที่ "ควรทำต่อ" ไม่ใช่เมนูยาว ๆ
 * ตัวถัดไปจึงเลือกจากระยะของวงจร ซึ่งเป็นตัวเดียวกับที่เครื่องยนต์กำหนดการใช้
 */
function nextStep(a: Animal, p: BioParams | null): NextStep {
  const days = (from: number) => Math.max(0, Math.round((Date.now() - from) / DAY))

  switch (a.stage) {
    case 'waiting': {
      const due = a.lastHeatAt ? addDays(a.lastHeatAt, p?.estrusCycleDays ?? 21) : null
      return {
        line: due
          ? `พร้อมเข้าผสม · คาดว่าจะเป็นสัดอีกครั้ง ${dayShort(due)}`
          : 'พร้อมเข้าผสม · ยังไม่เคยบันทึกวันเป็นสัด',
        action: 'บันทึกอาการเป็นสัด',
        code: 'ก-07',
        to: form('ก-07', a.id),
        tone: 'ok',
      }
    }
    case 'fresh': {
      const due = a.lastCalvingAt ? addDays(a.lastCalvingAt, p?.uterusCheckDays ?? 30) : null
      return {
        line: a.lastCalvingAt
          ? `หลังคลอด ${days(a.lastCalvingAt)} วัน · ตรวจมดลูก ${due ? dayShort(due) : '—'}`
          : 'อยู่ในระยะพักหลังคลอด',
        action: 'ตรวจระบบสืบพันธุ์',
        code: 'ก-04',
        to: form('ก-04', a.id),
        tone: 'warn',
      }
    }
    case 'bred': {
      const due = a.lastBredAt ? addDays(a.lastBredAt, p?.pregnancyCheckDays ?? 35) : null
      return {
        line: due ? `ผสมแล้ว · ตรวจท้อง ${dayShort(due)}` : 'ผสมแล้ว รอตรวจท้อง',
        action: 'บันทึกผลตรวจท้อง',
        code: 'ก-09',
        to: form('ก-09', a.id),
        tone: 'info',
      }
    }
    case 'pregnant':
      return {
        line: a.expectedCalvingAt
          ? `ตั้งท้อง · คลอดคาดการณ์ ${dayShort(a.expectedCalvingAt)}`
          : 'ตั้งท้อง · ยังไม่มีวันคลอดคาดการณ์',
        action: 'เตรียมโคและคอกคลอด',
        code: 'ก-11',
        to: form('ก-11', a.id),
        tone: 'info',
      }
    case 'problem':
      return {
        line: 'ต้องฟื้นฟูก่อนเข้าโปรแกรมผสม',
        action: 'ตรวจความพร้อม',
        code: 'ก-05',
        to: form('ก-05', a.id),
        tone: 'crit',
      }
    case 'heifer':
      return {
        line: `โคสาว อายุ ${animalAge(a.birthDate)} · ${parityLabel(a.parity)}`,
        action: 'ให้คะแนน BCS',
        code: 'ก-03',
        to: form('ก-03', a.id),
        tone: '',
      }
    default:
      return {
        line: 'คัดออกจากฝูงแล้ว',
        action: 'ดูประวัติ',
        code: null,
        to: `/animals/${a.id}`,
        tone: '',
      }
  }
}

type StageFilter = CycleStage | 'all'

const STAGE_OPTIONS: Array<{ value: StageFilter; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'waiting', label: CYCLE_LABEL.waiting },
  { value: 'bred', label: CYCLE_LABEL.bred },
  { value: 'pregnant', label: CYCLE_LABEL.pregnant },
  { value: 'fresh', label: CYCLE_LABEL.fresh },
  { value: 'heifer', label: CYCLE_LABEL.heifer },
  { value: 'problem', label: CYCLE_LABEL.problem },
]

/** ตัวกรองย่อยของโคสาว — สถานะการท้องตามจำนวนครั้ง (ไม่เคยท้อง ถึง ท้อง 6) */
const PARITY_OPTIONS: Array<{ value: number | 'all'; label: string }> = [
  { value: 'all', label: 'ทุกสถานะการท้อง' },
  ...[0, 1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: parityLabel(n) })),
]

const STAGE_TONE: Record<CycleStage, 'ok' | 'warn' | 'crit' | 'mute'> = {
  heifer: 'mute',
  fresh: 'warn',
  waiting: 'warn',
  bred: 'mute',
  pregnant: 'ok',
  problem: 'crit',
  culled: 'mute',
}

/** บทบาทนี้บันทึกกิจกรรมนั้นได้ไหม — ใช้ตัดสินว่าจะโชว์ปุ่มบันทึกหรือปุ่มดูอย่างเดียว */
function canDo(code: string | null, role: Role): boolean {
  if (!code) return false
  return ACTIVITY_BY_CODE.get(code)?.actors.includes(role) ?? false
}

export function Animals() {
  const { role, readOnly } = useAccount()
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<StageFilter>('all')
  const [parity, setParity] = useState<number | 'all'>('all')
  const [farmId, setFarmId] = useState('')
  const [rows, setRows] = useState<Animal[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [total, setTotal] = useState(0)
  const [params, setParams] = useState<BioParams | null>(null)

  useEffect(() => {
    void db.farms.toArray().then(setFarms)
    void db.animals.count().then(setTotal)
    void getParams().then(setParams)
  }, [])

  useEffect(() => {
    let alive = true
    void searchAnimals({
      q,
      stage,
      farmId: farmId || undefined,
      parity: stage === 'heifer' && parity !== 'all' ? parity : undefined,
      limit: 120,
    }).then((r) => {
      if (alive) setRows(r)
    })
    return () => {
      alive = false
    }
  }, [q, stage, farmId, parity])

  const farmName = useMemo(() => new Map(farms.map((f) => [f.id, f.name])), [farms])

  return (
    <>
      <Card
        title="ทะเบียนโค"
        hint={`ทั้งหมด ${num(total)} ตัว`}
        action={
          <div className="row tight">
            {/* เพิ่มทีละตัวเป็นงานของสัตวบาลที่ติดแท็กหน้างาน เกษตรกรแจ้งผ่านการแจ้งคลอดแทน */}
            {role !== 'farmer' && !readOnly && (
              <Link className="btn ghost mini" to="/animals/new">
                <Plus size={15} /> เพิ่มโค
              </Link>
            )}
            <button
              className="btn ghost mini"
              onClick={() => void herdMatrix().then(({ rows, sum }) => downloadMatrixCsv(rows, sum))}
            >
              <Download size={15} /> สรุปรายฟาร์ม
            </button>
          </div>
        }
      >
        <SearchBox value={q} onChange={setQ} placeholder="ค้นด้วย RFID เบอร์หู หรือสายพันธุ์" />
        <Chips value={stage} options={STAGE_OPTIONS} onChange={setStage} />
        {stage === 'heifer' && <Chips value={parity} options={PARITY_OPTIONS} onChange={setParity} />}
        <label className="field">
          <span>ฟาร์ม</span>
          <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
            <option value="">ทุกฟาร์ม</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} · {f.name}
              </option>
            ))}
          </select>
        </label>
        <Note>
          <ScanLine size={14} className="ic-inline" /> สแกน RFID หรือพิมพ์หมายเลขเพื่อค้นหา
        </Note>
      </Card>

      <Card title={`ผลลัพธ์ ${num(rows.length)} ตัว`} hint={rows.length >= 120 ? 'แสดง 120 รายการแรก' : undefined}>
        {rows.length === 0 ? (
          <Empty>ไม่พบโคที่ตรงกับเงื่อนไข</Empty>
        ) : (
          rows.map((a, i) => {
            const tone = STAGE_TONE[a.stage]
            const next = nextStep(a, params)
            return (
              <div className="beast" key={a.id}>
                <div className="beast-head">
                  <span className="beast-no">{i + 1}</span>
                  <Link className="beast-tag" to={`/animals/${a.id}`}>
                    {a.tagNo}
                  </Link>
                  <Pill tone={tone}>{CYCLE_LABEL[a.stage]}</Pill>
                  <span className="beast-bcs">
                    {/* สีเดียวกับตารางให้คะแนนในฟอร์ม ก-03 — แดงผอม เขียวสมบูรณ์ น้ำเงินอ้วน */}
                    <Pill tone={a.lastBcs !== null ? BAND_TONE[bcsBand(a.lastBcs)] : 'mute'}>
                      {a.lastBcs !== null ? `BCS ${a.lastBcs.toFixed(1)}` : 'ยังไม่ประเมิน'}
                    </Pill>
                  </span>
                </div>

                <div className="beast-name">
                  {a.breed} {a.bloodPct}% · {animalAge(a.birthDate)} · {parityLabel(a.parity)} ·{' '}
                  {farmName.get(a.farmId) ?? a.farmId}
                </div>

                <div className={`beast-strip ${next.tone}`}>{next.line}</div>

                {/* SEC-05 — ปุ่มบันทึกโผล่เฉพาะกิจกรรมที่บทบาทนี้ทำได้จริง
                    ไม่งั้นเกษตรกรจะได้ปุ่มพาไปฟอร์มของสัตวบาล */}
                <div className="row snug">
                  {canDo(next.code, role) ? (
                    <Link className={`btn ${next.tone === 'ok' ? '' : next.tone}`.trim()} to={next.to}>
                      {next.action} <span className="go">→</span>
                    </Link>
                  ) : (
                    <Link className="btn ghost" to={`/animals/${a.id}`}>
                      ดูทะเบียนโค <span className="go">→</span>
                    </Link>
                  )}
                </div>
              </div>
            )
          })
        )}
      </Card>
    </>
  )
}
