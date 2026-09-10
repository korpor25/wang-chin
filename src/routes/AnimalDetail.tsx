/** โครายตัว — ทะเบียน วงจรปัจจุบัน ไทม์ไลน์เหตุการณ์ และปุ่มบันทึกกิจกรรมที่เกี่ยวข้อง */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ActRow, Card, Chips, Empty, KeyValues, List, Note, PageHeader, Pill, Row, Skeleton } from '../components/ui'
import { ACTIVITY_BY_CODE, activitiesForRole } from '../domain/activities'
import { activityIcon } from '../components/activityIcon'
import { CowModel } from '../components/CowModel'
import { CYCLE_LABEL, type ActivityRecord, type Animal, type Farm, type Task } from '../domain/types'
import { animalTimeline, getParams } from '../data/queries'
import { breedingBlockers, goldenPeriod, nextHeatWindow } from '../domain/rules'
import { BAND_TONE, bcsBand } from '../domain/bcs'
import { db } from '../data/db'
import { age, animalAge, dateTime } from '../lib/format'
import { useAccount } from '../state/session'
import type { BioParams } from '../domain/types'

type Tab = 'overview' | 'timeline' | 'repro' | 'health'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'overview', label: 'ภาพรวม' },
  { value: 'timeline', label: 'ไทม์ไลน์' },
  { value: 'repro', label: 'การสืบพันธุ์' },
  { value: 'health', label: 'สุขภาพ' },
]

const dayShort = (ts: number) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

export function AnimalDetail() {
  const { id = '' } = useParams()
  const { role } = useAccount()
  const [tab, setTab] = useState<Tab>('overview')
  const [animal, setAnimal] = useState<Animal | null>(null)
  const [farm, setFarm] = useState<Farm | null>(null)
  const [records, setRecords] = useState<ActivityRecord[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [params, setParams] = useState<BioParams | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const a = await db.animals.get(id)
      if (!alive || !a) return setAnimal(null)
      const [f, recs, tk, p] = await Promise.all([
        db.farms.get(a.farmId),
        animalTimeline(id),
        db.tasks.where('animalId').equals(id).toArray(),
        getParams(),
      ])
      if (!alive) return
      setAnimal(a)
      setFarm(f ?? null)
      setRecords(recs)
      setTasks(tk.filter((k) => k.status === 'open' || k.status === 'overdue').sort((x, y) => x.dueAt - y.dueAt))
      setParams(p)
    })()
    return () => {
      alive = false
    }
  }, [id])

  if (!animal || !params)
    return (
      <>
        <PageHeader title="ข้อมูลโค" />
        {!animal && params ? <Empty>ไม่พบข้อมูลโคตัวนี้</Empty> : <Skeleton rows={4} />}
      </>
    )

  const blockers = breedingBlockers(animal, params)
  const golden = animal.lastHeatAt ? goldenPeriod(animal.lastHeatAt, params) : null
  const window = animal.lastHeatAt || animal.lastBredAt
    ? nextHeatWindow(animal.lastHeatAt ?? animal.lastBredAt!, params)
    : null

  const allowed = activitiesForRole(role).filter((a) => a.needsAnimal)
  const bcsRecords = records.filter((r) => r.activityCode === 'ก-03')
  const healthRecords = records.filter((r) => r.activityCode === 'ก-10' || r.activityCode === 'ก-04')
  const reproRecords = records.filter((r) => ['ก-06', 'ก-07', 'ก-08', 'ก-09', 'ก-02'].includes(r.activityCode))

  return (
    <>
      <PageHeader title={animal.tagNo} sub={`${animal.rfid} · ${farm?.name ?? ''}`} />
      <Card
        title={`${animal.tagNo} · ${animal.breed} ${animal.bloodPct}%`}
        hint={`${animal.rfid} · ${farm?.name ?? animal.farmId}`}
        action={<Pill tone={animal.stage === 'problem' ? 'crit' : 'ok'}>{CYCLE_LABEL[animal.stage]}</Pill>}
      >
        <Chips value={tab} options={TABS} onChange={setTab} />
      </Card>

      {tab === 'overview' && (
        <>
          <Card title="ทะเบียน">
            <KeyValues
              items={[
                ['เบอร์หู', animal.tagNo],
                ['RFID', animal.rfid],
                ['สายพันธุ์', `${animal.breed} ${animal.bloodPct}%`],
                ['พ่อพันธุ์', animal.sireCode ?? '—'],
                ['อายุ', animalAge(animal.birthDate)],
                ['ท้องที่', String(animal.parity)],
                ['ฟาร์ม', farm ? `${farm.code} · ${farm.owner}` : animal.farmId],
                ['ตำบล/อำเภอ', farm ? `${farm.subdistrict} / ${farm.district}` : '—'],
                ['BCS ล่าสุด', animal.lastBcs !== null ? `${animal.lastBcs} / ${params.bcsScaleMax}` : 'ยังไม่เคยประเมิน'],
              ]}
            />
            <CowModel label={animal.tagNo} />
          </Card>

          {blockers.length > 0 && (
            <Card title="ยังผสมไม่ได้">
              <ul className="blocker-list">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <Note>ระบบจะเตือนก่อนบันทึกการผสม แต่ไม่ห้ามขาด เพราะหน้างานอาจมีเหตุจำเป็น</Note>
            </Card>
          )}

          {tasks.length > 0 && (
            <Card title="งานที่ค้างของตัวนี้" hint={`${tasks.length} รายการ`}>
              <List>
                {tasks.map((k) => (
                  <Row
                    key={k.localId}
                    to={`/record/${encodeURIComponent(k.activityCode)}?task=${k.localId}&animal=${animal.id}`}
                    badge={<span className="code">{k.activityCode}</span>}
                    title={k.title}
                    sub={`กำหนด ${dateTime(k.dueAt)} · ${k.derivedFrom}`}
                  />
                ))}
              </List>
            </Card>
          )}

          <Card title="บันทึกกิจกรรมให้ตัวนี้" hint={`กิจกรรมที่บทบาทของคุณทำได้ ${allowed.length} รายการ`}>
            {allowed.map((a) => (
              <ActRow
                key={a.code}
                to={`/record/${encodeURIComponent(a.code)}?animal=${animal.id}`}
                Icon={activityIcon(a.code)}
                code={a.code}
                name={a.name}
                sub={a.trigger}
              />
            ))}
          </Card>
        </>
      )}

      {tab === 'timeline' && (
        <Card title="ไทม์ไลน์เหตุการณ์" hint={`${records.length} รายการ`}>
          {records.length === 0 ? (
            <Empty>ยังไม่มีบันทึกของโคตัวนี้ — ลองบันทึกกิจกรรมดู</Empty>
          ) : (
            <ul className="timeline">
              {records.map((r) => {
                const spec = ACTIVITY_BY_CODE.get(r.activityCode)
                return (
                  <li key={r.localId}>
                    <div className="row-title">
                      <span className="code">{r.activityCode}</span>
                      {spec?.name ?? r.activityCode}
                      {r.syncStatus !== 'synced' && <Pill tone="warn">รอซิงค์</Pill>}
                    </div>
                    <div className="row-sub">
                      {dateTime(r.occurredAt)} · {r.recordedBy}
                      {r.note && ` · ${r.note}`}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'repro' && (
        <>
          <Card title="สถานะการสืบพันธุ์">
            <KeyValues
              items={[
                ['ระยะปัจจุบัน', CYCLE_LABEL[animal.stage]],
                ['คลอดล่าสุด', animal.lastCalvingAt ? `${dayShort(animal.lastCalvingAt)} (${age(animal.lastCalvingAt)})` : '—'],
                ['เป็นสัดล่าสุด', animal.lastHeatAt ? `${dateTime(animal.lastHeatAt)}` : '—'],
                ['ผสมล่าสุด', animal.lastBredAt ? `${dayShort(animal.lastBredAt)} (${age(animal.lastBredAt)})` : '—'],
                ['คลอดคาดการณ์', animal.expectedCalvingAt ? dayShort(animal.expectedCalvingAt) : '—'],
              ]}
            />
            {golden && golden.state !== 'passed' && (
              <Note>
                ช่วงผสมที่เหมาะสม {new Date(golden.from).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {new Date(golden.to).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                {golden.state === 'now' ? ' — ผสมได้ตอนนี้' : ` — อีก ${golden.hoursUntil} ชั่วโมง`}
              </Note>
            )}
            {window && (
              <Note>
                คาดว่าจะกลับเป็นสัดช่วง {dayShort(window.from)} – {dayShort(window.to)} (วงรอบ{' '}
                {params.estrusCycleDays} วัน)
              </Note>
            )}
            <div className="row">
              <Link className="btn" to={`/record/${encodeURIComponent('ก-07')}?animal=${animal.id}`}>
                บันทึกอาการเป็นสัด <span className="go">→</span>
              </Link>
              <Link className="btn ghost" to={`/record/${encodeURIComponent('ก-08')}?animal=${animal.id}`}>
                บันทึกการผสม <span className="go">→</span>
              </Link>
            </div>
          </Card>

          <Card title="ประวัติการผสมและตรวจ" hint={`${reproRecords.length} รายการ`}>
            {reproRecords.length === 0 ? (
              <Empty>ยังไม่มีประวัติ</Empty>
            ) : (
              <List>
                {reproRecords.map((r) => (
                  <Row
                    key={r.localId}
                    badge={<span className="code">{r.activityCode}</span>}
                    title={ACTIVITY_BY_CODE.get(r.activityCode)?.name ?? r.activityCode}
                    sub={dateTime(r.occurredAt)}
                    side={String(r.payload.result ?? r.payload.method ?? '')}
                  />
                ))}
              </List>
            )}
          </Card>
        </>
      )}

      {tab === 'health' && (
        <>
          <Card title="คะแนนสภาพร่างกาย (BCS)" hint={`${bcsRecords.length} ครั้ง`}>
            {animal.lastBcs !== null && (
              <p className={`hero-num t-${BAND_TONE[bcsBand(animal.lastBcs ?? 0)]}`}>
                {animal.lastBcs}
                <small className="hero-unit"> / {params.bcsScaleMax}</small>
              </p>
            )}
            {animal.lastBcs !== null && animal.lastBcs < params.bcsMinBeforeBreeding && (
              <Note>ต่ำกว่าเกณฑ์ {params.bcsMinBeforeBreeding} — ควรปรับสูตรอาหารก่อนเข้าโปรแกรมผสม</Note>
            )}
            <div className="row">
              <Link className="btn ghost" to={`/record/${encodeURIComponent('ก-03')}?animal=${animal.id}`}>
                ให้คะแนน BCS
              </Link>
            </div>
          </Card>

          <Card title="ประวัติสุขภาพ" hint={`${healthRecords.length} รายการ`}>
            {animal.withdrawalUntil && animal.withdrawalUntil > Date.now() && (
              <Note>อยู่ระหว่างระยะหยุดยา ถึง {dayShort(animal.withdrawalUntil)}</Note>
            )}
            {healthRecords.length === 0 ? (
              <Empty>ยังไม่มีประวัติ</Empty>
            ) : (
              <List>
                {healthRecords.map((r) => (
                  <Row
                    key={r.localId}
                    badge={<span className="code">{r.activityCode}</span>}
                    title={String(r.payload.condition ?? ACTIVITY_BY_CODE.get(r.activityCode)?.name ?? '')}
                    sub={dateTime(r.occurredAt)}
                  />
                ))}
              </List>
            )}
          </Card>
        </>
      )}
    </>
  )
}
