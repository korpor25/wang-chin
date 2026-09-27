/**
 * หน้าแรก — เนื้อหาเปลี่ยนตามบทบาท เพราะแต่ละกลุ่มเปิดแอปมาด้วยคำถามคนละข้อ
 *   เกษตรกร  : "วันนี้ฉันต้องทำอะไรกับโคของฉัน"
 *   สัตวบาล  : "วันนี้ต้องออกไปที่ไหน ตัวไหนใกล้พลาดช่วงผสม"
 *   สหกรณ์   : "มีอะไรค้าง คลังพอไหม"
 *   กรรมการ  : "ตัวเลขเดือนนี้เป็นยังไง"
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AlarmClock, CalendarClock } from 'lucide-react'
import { ActRow, Card, Empty, List, Pill, Row, Stat, Stats } from '../components/ui'
import { activityIcon } from '../components/activityIcon'
import { activitiesForRole } from '../domain/activities'
import { CYCLE_LABEL, type Task } from '../domain/types'
import { getParams, heatWatch, taskBuckets, type HeatWatchRow } from '../data/queries'
import { useAccount } from '../state/session'
import { daysPast } from '../lib/format'
import { db } from '../data/db'

const timeOnly = (ts: number) =>
  new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

const dayShort = (ts: number) =>
  new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

const dayFull = (ts: number) =>
  new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export function Dashboard() {
  const { userId, role, isAdmin } = useAccount()
  const [buckets, setBuckets] = useState<Awaited<ReturnType<typeof taskBuckets>> | null>(null)
  const [heat, setHeat] = useState<{ inGolden: HeatWatchRow[]; expected: HeatWatchRow[] } | null>(null)
  const [herd, setHerd] = useState<{ total: number; nearCalving: number } | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const params = await getParams()
      // SEC-01 — เกษตรกรเห็นเฉพาะฟาร์มของบัญชีตัวเอง ไม่ใช่บัญชีตัวอย่างที่ผูกไว้ตายตัว
      const farmIds = role === 'farmer' ? ((await db.users.get(userId))?.farmIds ?? []) : undefined
      const [b, h, animals] = await Promise.all([
        taskBuckets(role, farmIds, isAdmin, userId),
        heatWatch(params, farmIds),
        db.animals.toArray(),
      ])
      if (!alive) return
      setBuckets(b)
      setHeat(h)

      // ตัวเลขสรุปฝูงบนหัวหน้าแรก — เกษตรกรนับเฉพาะฟาร์มตัวเอง
      const mine = farmIds?.length ? animals.filter((a) => farmIds.includes(a.farmId)) : animals
      const soon = Date.now() + 30 * 86_400_000
      setHerd({
        total: mine.filter((a) => a.active).length,
        nearCalving: mine.filter((a) => a.expectedCalvingAt && a.expectedCalvingAt <= soon).length,
      })
    })()
    return () => {
      alive = false
    }
  }, [userId, role, isAdmin])

  const steps = activitiesForRole(role)
  // ใบที่ระบบชี้ว่าควรทำก่อน = กิจกรรมของงานที่ใกล้ถึงกำหนดที่สุด
  const nextCode = buckets?.overdue[0]?.activityCode ?? buckets?.today[0]?.activityCode ?? null

  return (
    <>
      {/* ตัวเลขสรุป — เอาเฉพาะที่มาจากกิจกรรมภาค ก และกำหนดการที่ระบบสร้าง */}
      {herd && buckets && (
        <Card title="ภาพรวมวันนี้">
          <Stats quad>
            <Stat label="โคทั้งหมด" value={herd.total} sub="ตัว" />
            <Stat label="ใกล้คลอด" value={herd.nearCalving} sub="ตัว" tone="warn" />
            <Stat label="งานวันนี้" value={buckets.today.length} sub="งาน" tone="info" />
            <Stat
              label="เลยกำหนด"
              value={buckets.overdue.length}
              sub="งาน"
              tone={buckets.overdue.length > 0 ? 'crit' : 'ok'}
            />
          </Stats>
        </Card>
      )}

      {/* ขั้นตอนปฏิบัติการของบทบาทนี้ */}
      {steps.length > 0 && (
        <Card
          title="ขั้นตอนปฏิบัติการปศุสัตว์"
          action={
            <Link to="/record" className="link-more">
              ดูทั้งหมด
            </Link>
          }
        >
          {steps.slice(0, 3).map((a) => (
            <ActRow
              key={a.code}
              to={`/record/${encodeURIComponent(a.code)}`}
              Icon={activityIcon(a.code)}
              code={a.code}
              name={a.name}
              sub={a.trigger}
              active={a.code === nextCode}
            />
          ))}
        </Card>
      )}

      {/* งานเร่งด่วน */}
      {buckets && (buckets.overdue.length > 0 || buckets.today.length > 0) && (
        <Card
          title="งานวันนี้"
          hint={`เลยกำหนด ${buckets.overdue.length} · ถึงกำหนดวันนี้ ${buckets.today.length}`}
          action={<Link to="/tasks" className="link-more">ดูทั้งหมด</Link>}
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
              <p className="subhead">
                คาดว่าจะเป็นสัดช่วงนี้ ({heat.expected.length} ตัว) — ให้สังเกตอาการ
              </p>
              <List>
                {heat.expected.slice(0, 5).map(({ animal, window }) => (
                  <Row
                    key={animal.id}
                    to={`/animals/${animal.id}`}
                    badge={<AlarmClock size={15} className="ic-warn" />}
                    title={`${animal.tagNo} · ${animal.breed}`}
                    sub={window ? `คาดการณ์ ${dayShort(window.from)} – ${dayShort(window.to)}` : undefined}
                  />
                ))}
              </List>
            </>
          )}
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

/**
 * งานหนึ่งใบตามดีไซน์ — วงกลมบอกความเร่งด่วน ชื่องาน ป้ายสถานะ และปุ่มลงมือทำ
 * วงกลมไม่ใช่ช่องติ๊ก เพราะงานปิดได้ทางเดียวคือบันทึกผลของกิจกรรมนั้นจริง (ASG-07)
 */
export function TaskRow({ task }: { task: Task }) {
  const { userId } = useAccount()
  const overdue = task.status === 'overdue' || task.dueAt < Date.now() - task.toleranceDays * 86_400_000
  const mine = task.assignedTo === userId

  const tone = task.status === 'escalated' || overdue ? 'crit' : task.priority === 'high' ? 'warn' : 'mute'
  // บอกเป็นจำนวนวันไปเลย คนหน้างานจะได้รู้ทันทีว่าช้าแค่ไหน ไม่ต้องไปเปิดดูวันนัด
  const late = daysPast(task.dueAt)
  const label =
    task.status === 'escalated'
      ? `ค้างนาน ${late} วัน`
      : overdue
        ? `เลยกำหนด ${late} วัน`
        : task.priority === 'high'
          ? 'ด่วน'
          : 'ตามกำหนด'

  return (
    <li className="task-item">
      <span className={`task-mark ${tone}`} aria-hidden="true" />
      <div className="task-body">
        <div className="task-head">
          <div className="task-title">{task.title}</div>
          <Pill tone={tone}>{label}</Pill>
        </div>
        <div className="task-sub">
          <span className="code">{task.activityCode}</span>{' '}
          <CalendarClock size={12} className="ic-inline" /> {dayFull(task.dueAt)} · {task.derivedFrom}
          {mine && ' · มอบหมายให้คุณ'}
        </div>
        <div className="row snug">
          <Link
            className={`btn chiplike ${tone === 'mute' ? '' : tone}`.trim()}
            to={`/record/${encodeURIComponent(task.activityCode)}?task=${task.localId}${
              task.animalId ? `&animal=${task.animalId}` : ''
            }`}
          >
            บันทึกผล <span className="go">→</span>
          </Link>
        </div>
      </div>
    </li>
  )
}
