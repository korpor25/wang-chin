/** ทะเบียนโค — ค้นด้วย RFID/เบอร์หู กรองตามระยะของวงจรและฟาร์ม */
import { useEffect, useMemo, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { Card, Chips, Empty, List, Note, Pill, Row, SearchBox } from '../components/ui'
import { CYCLE_LABEL, type Animal, type CycleStage, type Farm } from '../domain/types'
import { searchAnimals } from '../data/queries'
import { db } from '../data/db'
import { num } from '../lib/format'

type StageFilter = CycleStage | 'all'

const STAGE_OPTIONS: Array<{ value: StageFilter; label: string }> = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'waiting', label: CYCLE_LABEL.waiting },
  { value: 'bred', label: CYCLE_LABEL.bred },
  { value: 'pregnant', label: CYCLE_LABEL.pregnant },
  { value: 'fresh', label: CYCLE_LABEL.fresh },
  { value: 'dry', label: CYCLE_LABEL.dry },
  { value: 'heifer', label: CYCLE_LABEL.heifer },
  { value: 'problem', label: CYCLE_LABEL.problem },
]

const STAGE_TONE: Record<CycleStage, 'ok' | 'warn' | 'crit' | 'mute'> = {
  heifer: 'mute',
  fresh: 'warn',
  waiting: 'warn',
  bred: 'mute',
  pregnant: 'ok',
  dry: 'ok',
  problem: 'crit',
  culled: 'mute',
}

export function Animals() {
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<StageFilter>('all')
  const [farmId, setFarmId] = useState('')
  const [rows, setRows] = useState<Animal[]>([])
  const [farms, setFarms] = useState<Farm[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    void db.farms.toArray().then(setFarms)
    void db.animals.count().then(setTotal)
  }, [])

  useEffect(() => {
    let alive = true
    void searchAnimals({ q, stage, farmId: farmId || undefined, limit: 120 }).then((r) => {
      if (alive) setRows(r)
    })
    return () => {
      alive = false
    }
  }, [q, stage, farmId])

  const farmName = useMemo(() => new Map(farms.map((f) => [f.id, f.name])), [farms])

  return (
    <>
      <Card title="ทะเบียนโค" hint={`ทั้งหมด ${num(total)} ตัว`}>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นด้วย RFID เบอร์หู หรือสายพันธุ์" />
        <Chips value={stage} options={STAGE_OPTIONS} onChange={setStage} />
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
          <ScanLine size={14} style={{ verticalAlign: -2 }} /> สแกน RFID จากเครื่องอ่าน
          หรือพิมพ์หมายเลขก็ได้ ระบบจะเปิดทะเบียนของตัวที่ตรงกันให้ทันที
        </Note>
      </Card>

      <Card title={`ผลลัพธ์ ${num(rows.length)} ตัว`} hint={rows.length >= 120 ? 'แสดง 120 รายการแรก' : undefined}>
        {rows.length === 0 ? (
          <Empty>ไม่พบโคที่ตรงกับเงื่อนไข</Empty>
        ) : (
          <List>
            {rows.map((a) => (
              <Row
                key={a.id}
                to={`/animals/${a.id}`}
                badge={<Pill tone={STAGE_TONE[a.stage]}>{CYCLE_LABEL[a.stage]}</Pill>}
                title={`${a.tagNo} · ${a.breed} ${a.bloodPct}%`}
                sub={`${a.rfid} · ${farmName.get(a.farmId) ?? a.farmId} · ท้องที่ ${a.parity}`}
                side={a.lastBcs !== null ? `BCS ${a.lastBcs}` : ''}
              />
            ))}
          </List>
        )}
      </Card>
    </>
  )
}
