/**
 * ศูนย์บริหารงาน — รวบรวมการติดตามงานและการมอบหมายงานไว้ที่เดียว
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, UserRoundCheck, ClipboardCheck, ClipboardPlus } from 'lucide-react'
import {
  Card,
  Chips,
  Empty,
  Field,
  List,
  PageHeader,
  Pill,
  SearchBox,
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
import { TaskRow } from './Dashboard'
import { taskBuckets } from '../data/queries'
import { inPhase } from '../domain/activities'
import type { Task } from '../domain/types'

type View = 'unassigned' | 'overdue' | 'open'
type TaskBucket = 'overdue' | 'today' | 'soon' | 'later' | 'done'

const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'unassigned', label: 'ยังไม่ระบุผู้รับ' },
  { value: 'overdue', label: 'เลยกำหนด / ค้างนาน' },
  { value: 'open', label: 'งานที่เปิดอยู่ทั้งหมด' },
]

const BUCKETS: Array<{ value: TaskBucket; label: string }> = [
  { value: 'overdue', label: 'เลยกำหนด' },
  { value: 'today', label: 'วันนี้' },
  { value: 'soon', label: '7 วันข้างหน้า' },
  { value: 'later', label: 'ถัดไป' },
  { value: 'done', label: 'เสร็จแล้ว' },
]

const dayFull = (ts: number) =>
  new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

const localDate = (ts: number) => {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function TaskCenter() {
  const { userId, role, isAdmin } = useAccount()
  const account = useAccount()
  const actor = { userId: account.userId, name: account.name, role: account.role }

  const [activeTab, setActiveTab] = useState<'track' | 'assign'>('track')

  // State สำหรับส่วนติดตามงาน (Tasks)
  const [bucket, setBucket] = useState<TaskBucket>('today')
  const [taskData, setTaskData] = useState<Awaited<ReturnType<typeof taskBuckets>> | null>(null)
  const [doneRows, setDoneRows] = useState<Task[]>([])

  // State สำหรับส่วนมอบหมายงาน (Assign)
  const [assignView, setAssignView] = useState<View>('unassigned')
  const [assignRole, setAssignRole] = useState<Role | 'all'>('all')
  const [assignFarmId, setAssignFarmId] = useState<string>('all')
  const [assignQ, setAssignQ] = useState('')
  const [assignRows, setAssignRows] = useState<TaskWithContext[] | null>(null)
  const [farms, setFarms] = useState<Farm[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [assignee, setAssignee] = useState('')
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)

  // --- Logic สำหรับติดตามงาน ---
  useEffect(() => {
    let alive = true
    void (async () => {
      const farmIds = role === 'farmer' ? ((await db.users.get(userId))?.farmIds ?? []) : undefined
      const [b, d] = await Promise.all([
        taskBuckets(role, farmIds, isAdmin, userId),
        db.tasks.where('status').equals('done').reverse().limit(200).toArray(),
      ])
      if (!alive) return
      setTaskData(b)
      setDoneRows(
        d.filter((k) => inPhase(k.activityCode)).sort((x, y) => (y.doneAt ?? 0) - (x.doneAt ?? 0)).slice(0, 50),
      )
    })()
    return () => { alive = false }
  }, [userId, role, isAdmin, bucket])

  // --- Logic สำหรับมอบหมายงาน ---
  const loadAssign = useCallback(async () => {
    const list = await boardTasks({ view: assignView, role: assignRole, farmId: assignFarmId, q: assignQ })
    setAssignRows(list)
    setPicked((prev) => new Set([...prev].filter((id) => list.some((r) => r.task.localId === id))))
  }, [assignView, assignRole, assignFarmId, assignQ])

  useEffect(() => {
    void loadAssign()
  }, [loadAssign])

  useEffect(() => {
    void db.farms.toArray().then((f) => setFarms(f.sort((a, b) => a.code.localeCompare(b.code))))
    void assignableUsers().then(setUsers)
  }, [])

  const taskRows = bucket === 'done' ? doneRows : (taskData ? taskData[bucket] : [])

  function togglePick(localId: string) {
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
      toast.ok(target ? `มอบหมาย ${res.updated} รายการให้ ${who?.name ?? 'ผู้รับผิดชอบ'} แล้ว` : `ยกเลิกผู้รับผิดชอบ ${res.updated} รายการ`)
      setPicked(new Set())
      await loadAssign()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="ศูนย์บริหารงาน" />

      <div className="row tight" style={{ marginBottom: 'var(--sp-4)' }}>
        <button
          className={`btn ${activeTab === 'track' ? '' : 'ghost'}`}
          onClick={() => setActiveTab('track')}
        >
          <ClipboardCheck size={16} /> ติดตามงาน
        </button>
        {role !== 'farmer' && (
          <button
            className={`btn ${activeTab === 'assign' ? '' : 'ghost'}`}
            onClick={() => setActiveTab('assign')}
          >
            <ClipboardPlus size={16} /> มอบหมาย
          </button>
        )}
      </div>

      {activeTab === 'track' ? (
        <div className="tab-content">
          <Card title="งานของฉัน">
            <Stats>
              <Stat label="เลยกำหนด" value={num(taskData?.overdue.length ?? 0)} sub="รายการ" />
              <Stat label="วันนี้" value={num(taskData?.today.length ?? 0)} sub="รายการ" />
              <Stat label="7 วันข้างหน้า" value={num(taskData?.soon.length ?? 0)} sub="รายการ" />
            </Stats>
            <Chips value={bucket} options={BUCKETS} onChange={setBucket} />
          </Card>
          <Card title={BUCKETS.find((o) => o.value === bucket)?.label} hint={`${num(taskRows.length)} รายการ`}>
            {taskRows.length === 0 ? <Empty>ไม่มีรายการในช่วงนี้</Empty> : (
              <List>
                {taskRows.slice(0, 100).map((k) => <TaskRow key={k.localId} task={k} />)}
              </List>
            )}
          </Card>
        </div>
      ) : (
        <div className="tab-content">
          <Card>
            <Chips value={assignView} options={VIEWS} onChange={setAssignView} />
            <div className="grid2">
              <Field label="บทบาทผู้รับผิดชอบ">
                <select value={assignRole} onChange={(e) => setAssignRole(e.target.value as Role | 'all')}>
                  <option value="all">ทุกบทบาท</option>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </Field>
              <Field label="ฟาร์ม">
                <select value={assignFarmId} onChange={(e) => setAssignFarmId(e.target.value)}>
                  <option value="all">ทุกฟาร์ม</option>
                  {farms.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
                </select>
              </Field>
            </div>
            <SearchBox value={assignQ} onChange={setAssignQ} placeholder="ค้นหางาน..." />
          </Card>

          <Card title={VIEWS.find((v) => v.value === assignView)?.label} hint={`${num(assignRows?.length ?? 0)} รายการ · เลือกไว้ ${num(picked.size)}`}>
            {(!assignRows || assignRows.length === 0) ? <Empty>ไม่มีงานในเงื่อนไขนี้</Empty> : (
              assignRows.map(({ task, animalTag, farmName, assigneeName }) => {
                const on = picked.has(task.localId)
                const tone = task.status === 'escalated' ? 'crit' : task.status === 'overdue' ? 'warn' : 'mute'
                const late = daysPast(task.dueAt)
                const label = task.status === 'escalated' ? `ค้างนาน ${late} วัน` : task.status === 'overdue' ? `เลยกำหนด ${late} วัน` : task.priority === 'high' ? 'ด่วน' : 'ตามกำหนด'
                return (
                  <label className={on ? 'pick on' : 'pick'} key={task.localId}>
                    <input type="checkbox" checked={on} onChange={() => togglePick(task.localId)} />
                    <span className="pick-main">
                      <span className="pick-head">
                        <span className="code">{task.activityCode}</span>
                        <Pill tone={tone}>{label}</Pill>
                        <span className="pick-due"><CalendarClock size={12} className="ic-inline" /> {dayFull(task.dueAt)}</span>
                      </span>
                      <span className="pick-title">{task.title}</span>
                      <span className="pick-meta">{animalTag ? `${animalTag} · ` : ''}{farmName ? `${farmName} · ` : ''}{task.derivedFrom}</span>
                      <span className={assigneeName ? 'owner-strip' : 'owner-strip none'}>
                        <UserRoundCheck size={13} className="ic" />
                        {ROLE_LABEL[task.assignedRole]} · {assigneeName ?? 'ยังไม่ระบุตัวบุคคล'}
                      </span>
                    </span>
                  </label>
                )
              })
            )}
          </Card>

          {picked.size > 0 && !account.readOnly && (
            <div className="bulkbar">
              <div className="count">เลือกไว้ {num(picked.size)} รายการ</div>
              <Field label="มอบหมายให้">
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">— เลือกผู้รับผิดชอบ —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}</option>)}
                </select>
              </Field>
              <div className="row">
                <button className="btn" disabled={!assignee || busy} onClick={() => void doAssign(assignee)}>
                  {busy ? 'กำลังบันทึก…' : 'มอบหมาย'} <span className="go">→</span>
                </button>
                <button className="btn ghost" disabled={busy} onClick={() => void doAssign(null)}>ล้างผู้รับผิดชอบ</button>
                <button className="btn ghost fit" onClick={() => setPicked(new Set())}>ยกเลิก</button>
              </div>
            </div>
          )}

          <Card title="สร้างงานเฉพาะกิจ" action={account.readOnly ? undefined : <button className="btn ghost mini" onClick={() => setComposing(v => !v)}>{composing ? 'ปิด' : 'สร้างงาน'}</button>}>
            {composing && !account.readOnly && <AdHocForm users={users} farms={farms} onCreated={() => { setComposing(false); void loadAssign(); }} />}
          </Card>
        </div>
      )}
    </>
  )
}

function AdHocForm({ users, farms, onCreated }: { users: User[]; farms: Farm[]; onCreated: () => void }) {
  const account = useAccount()
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
      await createAdHocTask({
        activityCode: code,
        title: title.trim() || spec.name,
        animalId: animal?.id ?? null,
        farmId: animal?.farmId ?? (farmId || null),
        dueAt,
        assignedRole: who?.role ?? (spec.actors[0] ?? 'husbandry'),
        assignedTo: who?.id ?? null,
        priority,
        note,
      }, { userId: account.userId, name: account.name, role: account.role })
      toast.ok(who ? `สร้างงานและมอบหมายให้ ${who.name} แล้ว` : 'สร้างงานแล้ว รอระบุผู้รับผิดชอบ')
      setTitle(''); setNote(''); setAnimal(null); onCreated()
    } finally { setBusy(false) }
  }

  return (
    <>
      <Field label="กิจกรรม *">
        <select value={code} onChange={(e) => { setCode(e.target.value); setAnimal(null); }}>
          {fieldActivities.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
        </select>
      </Field>
      <Field label="ชื่องาน" hint="เว้นว่างได้"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={spec?.name} /></Field>
      {spec?.needsAnimal ? (
        <Field label="ตัวโค *">{animal ? (
          <div className="picked"><div className="picked-main"><div className="row-title">{animal.tagNo} · {animal.breed}</div><div className="row-sub">{animal.rfid}</div></div><button className="btn ghost fit" onClick={() => setAnimal(null)}>เปลี่ยน</button></div>
        ) : <AnimalPicker open onPick={setAnimal} />}</Field>
      ) : (
        <Field label="ฟาร์มที่เกี่ยวข้อง"><select value={farmId} onChange={(e) => setFarmId(e.target.value)}><option value="">— ไม่ระบุ —</option>{farms.map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}</select></Field>
      )}
      <div className="grid2">
        <Field label="วันครบกำหนด *"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="ความเร่งด่วน"><select value={priority} onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high')}><option value="high">สำคัญ</option><option value="normal">ปกติ</option><option value="low">ไม่เร่ง</option></select></Field>
      </div>
      <Field label="ผู้รับผิดชอบ"><select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">— ยังไม่ระบุ —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}</option>)}</select></Field>
      <Field label="เหตุผลเพิ่มเติม"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ตรวจซ้ำตามมติที่ประชุม" /></Field>
      {error && <p className="err">{error}</p>}
      <div className="row"><button className="btn" disabled={busy} onClick={() => void submit()}>{busy ? 'กำลังสร้าง…' : 'สร้างงาน'}</button></div>
    </>
  )
}
