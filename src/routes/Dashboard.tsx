/**
 * หน้าแรก — เนื้อหาเปลี่ยนตามบทบาท เพราะแต่ละกลุ่มเปิดแอปมาด้วยคำถามคนละข้อ
 *   เกษตรกร  : "วันนี้ฉันต้องทำอะไรกับโคของฉัน"
 *   สัตวบาล  : "วันนี้ต้องออกไปที่ไหน ตัวไหนใกล้พลาดช่วงผสม"
 *   สหกรณ์   : "มีอะไรค้าง คลังพอไหม"
 *   กรรมการ  : "ตัวเลขเดือนนี้เป็นยังไง"
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AlarmClock, CalendarClock, Droplets, Thermometer, TriangleAlert } from 'lucide-react'
import { Card, Empty, KpiCard, List, Pill, Row, Spark } from '../components/ui'
import { CYCLE_LABEL, type Kpi, type Task } from '../domain/types'
import { computeKpis, getParams, heatStress, heatWatch, taskBuckets, type HeatWatchRow } from '../data/queries'
import { heatStressLevel } from '../domain/rules'
import { useAccount } from '../state/session'
import { db } from '../data/db'

const timeOnly = (ts: number) =>
  new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

const dayShort = (ts: number) =>
  new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

const dayFull = (ts: number) =>
  new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export function Dashboard() {
  const { role, isAdmin } = useAccount()
  const [buckets, setBuckets] = useState<Awaited<ReturnType<typeof taskBuckets>> | null>(null)
  const [heat, setHeat] = useState<{ inGolden: HeatWatchRow[]; expected: HeatWatchRow[] } | null>(null)
  const [kpis, setKpis] = useState<Kpi[]>([])
  const [tankAlert, setTankAlert] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const params = await getParams()
      const farmIds =
        role === 'farmer' ? ((await db.users.get('u_farmer'))?.farmIds ?? []) : undefined
      const [b, h, k, tanks] = await Promise.all([
        taskBuckets(role, farmIds, isAdmin),
        heatWatch(params, farmIds),
        computeKpis(),
        db.tanks.toArray(),
      ])
      if (!alive) return
      setBuckets(b)
      setHeat(h)
      setKpis(k)
      const bad = tanks.find((t) => t.status === 'critical')
      setTankAlert(bad ? `${bad.code} ระดับไนโตรเจนเหลือ ${bad.levelCm} ซม.` : null)
    })()
    return () => {
      alive = false
    }
  }, [role, isAdmin])

  const thi = heatStress(14)
  const today = thi[thi.length - 1]
  const level = heatStressLevel(today.thi)

  return (
    <>
      {/* งานเร่งด่วน */}
      {buckets && (buckets.overdue.length > 0 || buckets.today.length > 0) && (
        <Card
          title="งานวันนี้"
          hint={`เลยกำหนด ${buckets.overdue.length} · ถึงกำหนดวันนี้ ${buckets.today.length}`}
          action={<Link to="/tasks" style={{ fontSize: 13, color: 'var(--brand)' }}>ดูทั้งหมด</Link>}
        >
          <List>
            {[...buckets.overdue.slice(0, 4), ...buckets.today.slice(0, 4)].map((k) => (
              <TaskRow key={k.localId} task={k} />
            ))}
          </List>
          {buckets.overdue.length + buckets.today.length === 0 && <Empty>ไม่มีงานค้างวันนี้</Empty>}
        </Card>
      )}

      {/* การเฝ้าระวังการเป็นสัด — หัวใจของสัตวบาลและเกษตรกร */}
      {(role === 'husbandry' || role === 'farmer') && heat && (
        <Card
          title="เฝ้าระวังการเป็นสัด"
          hint="ตัวที่อยู่ในช่วงผสมที่เหมาะสม (Golden Period) ต้องรีบก่อน"
        >
          {heat.inGolden.length === 0 && heat.expected.length === 0 && (
            <Empty>ยังไม่มีตัวที่ต้องเฝ้าระวังในช่วงนี้</Empty>
          )}

          {heat.inGolden.length > 0 && (
            <List>
              {heat.inGolden.slice(0, 6).map(({ animal, golden }) => (
                <Row
                  key={animal.id}
                  to={`/animals/${animal.id}`}
                  badge={
                    golden?.state === 'now' ? (
                      <Pill tone="crit">ผสมได้ตอนนี้</Pill>
                    ) : (
                      <Pill tone="warn">อีก {golden?.hoursUntil} ชม.</Pill>
                    )
                  }
                  title={`${animal.tagNo} · ${animal.breed}`}
                  sub={
                    golden
                      ? `ช่วงเหมาะสม ${timeOnly(golden.from)} – ${timeOnly(golden.to)} น.`
                      : undefined
                  }
                  side={CYCLE_LABEL[animal.stage]}
                />
              ))}
            </List>
          )}

          {heat.expected.length > 0 && (
            <>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12 }}>
                คาดว่าจะเป็นสัดช่วงนี้ ({heat.expected.length} ตัว) — ให้สังเกตอาการ
              </p>
              <List>
                {heat.expected.slice(0, 5).map(({ animal, window }) => (
                  <Row
                    key={animal.id}
                    to={`/animals/${animal.id}`}
                    badge={<AlarmClock size={15} style={{ color: 'var(--warn)' }} />}
                    title={`${animal.tagNo} · ${animal.breed}`}
                    sub={window ? `คาดการณ์ ${dayShort(window.from)} – ${dayShort(window.to)}` : undefined}
                  />
                ))}
              </List>
            </>
          )}
        </Card>
      )}

      {/* ความเครียดจากความร้อน (ค-05) */}
      <Card title="ดัชนีความเครียดจากความร้อน" hint="THI 14 วันล่าสุด · ค่าสูงกดอัตราการผสมติด">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 27, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
            {today.thi}
          </span>
          <Pill tone={level.tone}>{level.label}</Pill>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', marginLeft: 'auto' }}>
            <Thermometer size={13} style={{ verticalAlign: -2 }} /> {today.tempMax}°C ·{' '}
            <Droplets size={13} style={{ verticalAlign: -2 }} /> {today.humidity}%
          </span>
        </div>
        <Spark
          values={thi.map((d) => d.thi)}
          tones={thi.map((d) => heatStressLevel(d.thi).tone)}
          labels={thi.map((d) => `${dayShort(d.at)} THI ${d.thi}`)}
        />
      </Card>

      {/* คลังที่ต้องรีบดู */}
      {role === 'coop' && tankAlert && (
        <Card title="คลังต้องดูด่วน">
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <TriangleAlert size={17} style={{ color: 'var(--crit)', flex: 'none' }} />
            {tankAlert}
          </p>
          <div className="row">
            <Link className="btn" to="/inventory">
              ไปหน้าคลัง
            </Link>
          </div>
        </Card>
      )}

      {/* ตัวชี้วัด */}
      {role === 'coop' && kpis.length > 0 && (
        <Card
          title="ตัวชี้วัดด้านการสืบพันธุ์"
          hint="คำนวณจากบันทึกในระบบ (ค-06)"
          action={<Link to="/reports" style={{ fontSize: 13, color: 'var(--brand)' }}>รายงาน</Link>}
        >
          <div className="stats">
            {kpis.slice(0, 4).map((k) => (
              <KpiCard
                key={k.label}
                label={k.label}
                value={k.value}
                unit={k.unit}
                target={k.target}
                higherIsBetter={k.label !== 'ครั้งผสมต่อการติด' && k.label !== 'ระยะห่างการให้ลูก'}
              />
            ))}
          </div>
        </Card>
      )}

      {/* งานถัดไป */}
      {buckets && buckets.soon.length > 0 && (
        <Card title="สัปดาห์นี้" hint={`${buckets.soon.length} รายการ`}>
          <List>
            {buckets.soon.slice(0, 6).map((k) => (
              <TaskRow key={k.localId} task={k} />
            ))}
          </List>
        </Card>
      )}
    </>
  )
}

export function TaskRow({ task }: { task: Task }) {
  const overdue = task.status === 'overdue' || task.dueAt < Date.now() - task.toleranceDays * 86_400_000
  return (
    <Row
      to={`/record/${encodeURIComponent(task.activityCode)}?task=${task.localId}${
        task.animalId ? `&animal=${task.animalId}` : ''
      }`}
      badge={
        overdue ? (
          <Pill tone="crit">เลยกำหนด</Pill>
        ) : task.priority === 'high' ? (
          <Pill tone="warn">สำคัญ</Pill>
        ) : (
          <span className="code">{task.activityCode}</span>
        )
      }
      title={task.title}
      sub={
        <>
          <CalendarClock size={12} style={{ verticalAlign: -2 }} /> {dayFull(task.dueAt)} ·{' '}
          {task.derivedFrom}
        </>
      }
    />
  )
}
