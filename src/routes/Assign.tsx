/**
 * มอบหมายงาน (ASG-01…ASG-04) — หน้าของเจ้าหน้าที่สหกรณ์เท่านั้น
 *
 * ที่ประชุมสรุปว่าเจ้าหน้าที่ไม่ได้เป็นคนกรอกกิจกรรมภาค ก เลยสักรายการ
 * บทบาทคือ "มอบหมายและติดตาม" หน้านี้จึงแยกจากหน้ากรอกข้อมูลของอีกสองบทบาท
 * และทำงานได้ตอนออฟไลน์เหมือนกัน เพราะเขียนลงเครื่องแล้วเข้าคิวเหมือนบันทึกอื่น
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, UserRoundCheck } from 'lucide-react'
import {
  Card,
  Chips,
  Empty,
  Field,
  PageHeader,
  Pill,
  SearchBox,
  Skeleton,
  Stat,
  Stats,
} from '../components/ui'
import { AnimalPicker } from '../components/ActivityForm'
import { toast } from '../components/Toast'
import { ROLES, ROLE_LABEL } from '../domain/types'
import type { Animal, Farm, Role, User } from '../domain/types'
import { PHASE_ACTIVITIES } from '../domain/activities'
import {
  assignTasks,
  assignableUsers,
  boardTasks,
  createAdHocTask,
  type TaskWithContext,
} from '../data/tasks'
import { db } from '../data/db'
import { useAccount } from '../state/session'
import { daysPast, num } from '../lib/format'

type View = 'unassigned' | 'overdue' | 'open'

const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'unassigned', label: 'ยังไม่ระบุผู้รับ' },
  { value: 'overdue', label: 'เลยกำหนด / ค้างนาน' },
  { value: 'open', label: 'งานที่เปิดอยู่ทั้งหมด' },
]

const dayFull = (ts: number) =>
  new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

const localDate = (ts: number) => {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function Assign() {
  const account = useAccount()
  const actor = { userId: account.userId, name: account.name, role: account.role }

  const [view, setView] = useState<View>('unassigned')
  const [role, setRole] = useState<Role | 'all'>('all')
  const [farmId, setFarmId] = useState<string>('all')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<TaskWithContext[] | null>(null)
  const [farms, setFarms] = useState<Farm[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [assignee, setAssignee] = useState('')
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)

  const load = useCallback(async () => {
    const list = await boardTasks({ view, role, farmId, q })
    setRows(list)
    setPicked((prev) => new Set([...prev].filter((id) => list.some((r) => r.task.localId === id))))
  }, [view, role, farmId, q])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void db.farms.toArray().then((f) => setFarms(f.sort((a, b) => a.code.localeCompare(b.code))))
    void assignableUsers().then(setUsers)
  }, [])

  const counts = useMemo(() => {
    const list = rows ?? []
    return {
      total: list.length,
      unassigned: list.filter((r) => !r.task.assignedTo).length,
      escalated: list.filter((r) => r.task.status === 'escalated').length,
    }
  }, [rows])

  function toggle(localId: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(localId)) next.delete(localId)
      else next.add(localId)
      return next
    })
  }

  async function doAssign(target: string | null) {
    if (picked.size === 0) return
    setBusy(true)
    try {
      const res = await assignTasks([...picked], target, actor)
      const who = users.find((u) => u.id === target)
      toast.ok(
        target
          ? `มอบหมาย ${res.updated} รายการให้ ${who?.name ?? 'ผู้รับผิดชอบ'} แล้ว`
          : `ยกเลิกการระบุผู้รับผิดชอบ ${res.updated} รายการ`,
      )
      setPicked(new Set())
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!rows) return <Skeleton rows={6} />

  return (
    <>
      <PageHeader title="มอบหมายงาน" />

      <Card>
        <Stats quad>
          <Stat label="ในรายการนี้" value={counts.total} sub="งาน" />
          <Stat label="ยังไม่ระบุผู้รับ" value={counts.unassigned} sub="งาน" tone="warn" />
          <Stat label="ค้างนาน" value={counts.escalated} sub="งาน" tone="crit" />
          <Stat label="เลือกไว้" value={picked.size} sub="งาน" tone="info" />
        </Stats>
        <Chips value={view} options={VIEWS} onChange={setView} />
        <div className="grid2">
          <Field label="บทบาทผู้รับผิดชอบ">
            <select value={role} onChange={(e) => setRole(e.target.value as Role | 'all')}>
              <option value="all">ทุกบทบาท</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ฟาร์ม">
            <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
              <option value="all">ทุกฟาร์ม</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.code} · {f.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="ค้นจากชื่องาน รหัสกิจกรรม เบอร์หู หรือฟาร์ม" />
      </Card>

      <Card
        title={VIEWS.find((v) => v.value === view)?.label}
        hint={`${num(rows.length)} รายการ · เลือกไว้ ${num(picked.size)}`}
        action={
          rows.length > 0 ? (
            <button
              className="btn ghost mini"
              onClick={() =>
                setPicked(
                  picked.size === rows.length
                    ? new Set()
                    : new Set(rows.map((r) => r.task.localId)),
                )
              }
            >
              {picked.size === rows.length ? 'ล้างที่เลือก' : 'เลือกทั้งหมด'}
            </button>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <Empty>ไม่มีงานในเงื่อนไขนี้</Empty>
        ) : (
          rows.map(({ task, animalTag, farmName, assigneeName }) => {
            const on = picked.has(task.localId)
            const tone =
              task.status === 'escalated' ? 'crit' : task.status === 'overdue' ? 'warn' : 'mute'
            const late = daysPast(task.dueAt)
            const label =
              task.status === 'escalated'
                ? `ค้างนาน ${late} วัน`
                : task.status === 'overdue'
                  ? `เลยกำหนด ${late} วัน`
                  : task.priority === 'high'
                    ? 'ด่วน'
                    : 'ตามกำหนด'
            return (
              <label className={on ? 'pick on' : 'pick'} key={task.localId}>
                <input type="checkbox" checked={on} onChange={() => toggle(task.localId)} />
                <span className="pick-main">
                  <span className="pick-head">
                    <span className="code">{task.activityCode}</span>
                    <Pill tone={tone}>{label}</Pill>
                    <span className="pick-due">
                      <CalendarClock size={12} className="ic-inline" /> {dayFull(task.dueAt)}
                    </span>
                  </span>

                  <span className="pick-title">{task.title}</span>
                  <span className="pick-meta">
                    {animalTag ? `${animalTag} · ` : ''}
                    {farmName ? `${farmName} · ` : ''}
                    {task.derivedFrom}
                  </span>

                  <span className={assigneeName ? 'owner-strip' : 'owner-strip none'}>
                    <UserRoundCheck size={13} className="ic" />
                    {ROLE_LABEL[task.assignedRole]} ·{' '}
                    {assigneeName ?? 'ยังไม่ระบุตัวบุคคล — เลือกเพื่อมอบหมาย'}
                  </span>
                </span>
              </label>
            )
          })
        )}
      </Card>

      {account.readOnly && (
        <Card>
          <Empty>บัญชีนี้มีสิทธิ์ดูอย่างเดียว จึงมอบหมายงานหรือสร้างงานใหม่ไม่ได้</Empty>
        </Card>
      )}

      {picked.size > 0 && !account.readOnly && (
        <div className="bulkbar">
          <div className="count">เลือกไว้ {num(picked.size)} รายการ</div>
          <Field label="มอบหมายให้">
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">— เลือกผู้รับผิดชอบ —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {ROLE_LABEL[u.role]}
                </option>
              ))}
            </select>
          </Field>
          <div className="row">
            <button className="btn" disabled={!assignee || busy} onClick={() => void doAssign(assignee)}>
              {busy ? 'กำลังบันทึก…' : 'มอบหมาย'} <span className="go">→</span>
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => void doAssign(null)}>
              ล้างผู้รับผิดชอบ
            </button>
            <button className="btn ghost fit" onClick={() => setPicked(new Set())}>
              ยกเลิกที่เลือก
            </button>
          </div>
        </div>
      )}

      <Card
        title="สร้างงานเฉพาะกิจ"
        action={
          account.readOnly ? undefined : (
            <button
              className="btn ghost mini"
              onClick={() => setComposing((v) => !v)}
            >
              {composing ? 'ปิด' : 'สร้างงาน'}
            </button>
          )
        }
      >
        {composing && !account.readOnly ? (
          <AdHocForm
            users={users}
            farms={farms}
            onCreated={() => {
              setComposing(false)
              void load()
            }}
          />
        ) : null}
      </Card>
    </>
  )
}

/** ฟอร์มสร้างงานเฉพาะกิจ — เลือกกิจกรรมภาค ก + โค + วันครบกำหนด + ผู้รับผิดชอบ */
function AdHocForm({
  users,
  farms,
  onCreated,
}: {
  users: User[]
  farms: Farm[]
  onCreated: () => void
}) {
  const account = useAccount()
  // เฟสนี้มอบหมายได้เฉพาะกิจกรรมภาค ก ที่มีฟอร์มให้กรอกจริง
  const fieldActivities = useMemo(() => PHASE_ACTIVITIES.filter((a) => a.fields.length > 0), [])

  const [code, setCode] = useState('ก-07')
  const [title, setTitle] = useState('')
  const [animal, setAnimal] = useState<Animal | null>(null)
  const [farmId, setFarmId] = useState('')
  const [due, setDue] = useState(localDate(Date.now()))
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const spec = fieldActivities.find((a) => a.code === code)

  async function submit() {
    const who = users.find((u) => u.id === assignee) ?? null
    if (!spec) return setError('เลือกกิจกรรมก่อน')
    if (spec.needsAnimal && !animal) return setError('กิจกรรมนี้ต้องระบุตัวโค')
    const dueAt = Date.parse(`${due}T08:00`)
    if (Number.isNaN(dueAt)) return setError('วันครบกำหนดไม่ถูกต้อง')
    setError('')
    setBusy(true)
    try {
      await createAdHocTask(
        {
          activityCode: code,
          title: title.trim() || spec.name,
          animalId: animal?.id ?? null,
          farmId: animal?.farmId ?? (farmId || null),
          dueAt,
          assignedRole: who?.role ?? (spec.actors[0] ?? 'husbandry'),
          assignedTo: who?.id ?? null,
          priority,
          note,
        },
        { userId: account.userId, name: account.name, role: account.role },
      )
      toast.ok(who ? `สร้างงานและมอบหมายให้ ${who.name} แล้ว` : 'สร้างงานแล้ว รอระบุผู้รับผิดชอบ')
      setTitle('')
      setNote('')
      setAnimal(null)
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Field label="กิจกรรม *">
        <select
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setAnimal(null)
          }}
        >
          {fieldActivities.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="ชื่องาน" hint="เว้นว่างได้ ระบบใช้ชื่อกิจกรรมแทน">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={spec?.name} />
      </Field>

      {spec?.needsAnimal ? (
        <Field label="ตัวโค *">
          {animal ? (
            <div className="picked">
              <div className="picked-main">
                <div className="row-title">
                  {animal.tagNo} · {animal.breed}
                </div>
                <div className="row-sub">{animal.rfid}</div>
              </div>
              <button className="btn ghost fit" onClick={() => setAnimal(null)}>
                เปลี่ยน
              </button>
            </div>
          ) : (
            <AnimalPicker open onPick={setAnimal} />
          )}
        </Field>
      ) : (
        <Field label="ฟาร์มที่เกี่ยวข้อง">
          <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} · {f.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid2">
        <Field label="วันครบกำหนด *">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="ความเร่งด่วน">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high')}
          >
            <option value="high">สำคัญ</option>
            <option value="normal">ปกติ</option>
            <option value="low">ไม่เร่ง</option>
          </select>
        </Field>
      </div>

      <Field label="ผู้รับผิดชอบ" hint="เว้นว่างไว้ก่อนได้ แล้วค่อยมอบหมายทีหลัง">
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">— ยังไม่ระบุ —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {ROLE_LABEL[u.role]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="เหตุผลหรือคำสั่งเพิ่มเติม">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ตรวจซ้ำตามมติที่ประชุม" />
      </Field>

      {error && <p className="err">{error}</p>}

      <div className="row">
        <button className="btn" disabled={busy} onClick={() => void submit()}>
          {busy ? 'กำลังสร้าง…' : 'สร้างงาน'}
        </button>
      </div>
    </>
  )
}
