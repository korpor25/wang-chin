/**
 * การมอบหมายงาน (ASG-01…ASG-08) และการยกระดับงานค้าง (ค-04)
 *
 * ทุกอย่างในไฟล์นี้เขียนลง IndexedDB ก่อนแล้วเข้าคิวเสมอ การมอบหมายจึงทำได้
 * ตอนไม่มีสัญญาณเหมือนการบันทึกกิจกรรม และทุกครั้งที่เปลี่ยนผู้รับผิดชอบ
 * จะถูกเขียนลง audit log เพราะเป็นข้อมูลที่ใช้ชี้ว่าใครควรรับผิดชอบงานที่ค้าง
 */
import { db, newLocalId, writeAudit } from './db'
import { enqueue } from './sync'
import { notify, type Actor } from './effects'
import { ROLE_LABEL } from '../domain/types'
import { inPhase } from '../domain/activities'
import type { BioParams, CoopEvent, Role, Task, TaskStatus, User } from '../domain/types'

const DAY = 86_400_000

// ── มุมมองงานของเจ้าหน้าที่สหกรณ์ (ASG-01) ────────────────────────────────

export interface TaskFilter {
  role?: Role | 'all'
  farmId?: string | 'all'
  /** open = ยังไม่ปิด, unassigned = ยังไม่ระบุตัวบุคคล, overdue = เลยกำหนดหรือถูกยกระดับ */
  view?: 'open' | 'unassigned' | 'overdue' | 'all'
  q?: string
  limit?: number
}

export interface TaskWithContext {
  task: Task
  animalTag: string | null
  farmName: string | null
  assigneeName: string | null
}

/** งานทุกใบของทุกบทบาท พร้อมชื่อโค ฟาร์ม และผู้รับผิดชอบที่หน้าจอต้องใช้ */
export async function boardTasks(f: TaskFilter = {}): Promise<TaskWithContext[]> {
  const openStates: TaskStatus[] = ['open', 'overdue', 'escalated']
  let rows =
    f.view === 'all'
      ? await db.tasks.toArray()
      : await db.tasks.where('status').anyOf(openStates).toArray()

  rows = rows.filter((k) => inPhase(k.activityCode))
  if (f.role && f.role !== 'all') rows = rows.filter((k) => k.assignedRole === f.role)
  if (f.farmId && f.farmId !== 'all') rows = rows.filter((k) => k.farmId === f.farmId)
  if (f.view === 'unassigned') rows = rows.filter((k) => !k.assignedTo)
  if (f.view === 'overdue')
    rows = rows.filter((k) => k.status === 'overdue' || k.status === 'escalated')

  rows.sort((a, b) => a.dueAt - b.dueAt)
  rows = rows.slice(0, f.limit ?? 200)

  const [animals, farms, users] = await Promise.all([
    db.animals.toArray(),
    db.farms.toArray(),
    db.users.toArray(),
  ])
  const animalById = new Map(animals.map((a) => [a.id, a]))
  const farmById = new Map(farms.map((x) => [x.id, x]))
  const userById = new Map(users.map((u) => [u.id, u]))

  const out = rows.map((task) => ({
    task,
    animalTag: task.animalId ? (animalById.get(task.animalId)?.tagNo ?? null) : null,
    farmName: task.farmId ? (farmById.get(task.farmId)?.name ?? null) : null,
    assigneeName: task.assignedTo ? (userById.get(task.assignedTo)?.name ?? null) : null,
  }))

  if (!f.q?.trim()) return out
  const q = f.q.trim().toLowerCase()
  return out.filter(
    (r) =>
      r.task.title.toLowerCase().includes(q) ||
      r.task.activityCode.includes(q) ||
      (r.animalTag ?? '').toLowerCase().includes(q) ||
      (r.farmName ?? '').toLowerCase().includes(q),
  )
}

/** ผู้ใช้ที่มอบหมายงานให้ได้ — บัญชีดูอย่างเดียวรับงานไม่ได้ */
export async function assignableUsers(role?: Role): Promise<User[]> {
  const users = await db.users.filter((u) => u.active && !u.readOnly).toArray()
  const usable = users.filter((u) => u.role !== 'coop' || u.isAdmin)
  return role ? usable.filter((u) => u.role === role) : usable
}

// ── มอบหมาย (ASG-02, ASG-04, ASG-06, ASG-08) ─────────────────────────────

export interface AssignResult {
  updated: number
  skipped: number
}

/**
 * ระบุผู้รับผิดชอบรายบุคคลให้งานหลายใบพร้อมกัน
 * ถ้าผู้รับเป็นคนละบทบาทกับที่ระบบกำหนดไว้ ระบบย้ายบทบาทของงานตามผู้รับ
 * เพราะเจ้าหน้าที่คือคนตัดสินหน้างานว่าใครไปได้จริง
 */
export async function assignTasks(
  taskLocalIds: string[],
  assigneeId: string | null,
  actor: Actor,
): Promise<AssignResult> {
  const assignee = assigneeId ? ((await db.users.get(assigneeId)) ?? null) : null
  const res: AssignResult = { updated: 0, skipped: 0 }
  const at = Date.now()

  for (const localId of taskLocalIds) {
    const task = await db.tasks.where('localId').equals(localId).first()
    if (!task?.id) {
      res.skipped++
      continue
    }
    const before = { assignedTo: task.assignedTo, assignedRole: task.assignedRole }
    const after = {
      assignedTo: assignee?.id ?? null,
      assignedRole: assignee?.role ?? task.assignedRole,
      assignedAt: assignee ? at : null,
      assignedBy: assignee ? actor.userId : null,
    }
    await db.tasks.update(task.id, after)
    await enqueue('tasks', 'update', task.localId, 300)
    await writeAudit({
      actor: `${actor.name} (${ROLE_LABEL[actor.role]})`,
      action: assignee ? `มอบหมายงานให้ ${assignee.name}` : 'ยกเลิกการระบุผู้รับผิดชอบ',
      target: `task:${task.localId}`,
      before,
      after,
    })
    res.updated++

    if (assignee) {
      await notify({
        title: `ได้รับมอบหมาย: ${task.title}`,
        body: `กำหนด ${new Date(task.dueAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · ${task.derivedFrom} · มอบหมายโดย ${actor.name}`,
        toRole: assignee.role,
        toUser: assignee.id,
        level: task.priority === 'high' ? 'warn' : 'info',
        taskLocalId: task.localId,
        animalId: task.animalId,
        farmId: task.farmId,
      })
    }
  }
  return res
}

// ── สร้างงานเฉพาะกิจ (ASG-03) ────────────────────────────────────────────

export interface AdHocInput {
  activityCode: string
  title: string
  animalId: string | null
  farmId: string | null
  dueAt: number
  assignedRole: Role
  assignedTo: string | null
  priority: Task['priority']
  toleranceDays?: number
  note?: string
}

export async function createAdHocTask(input: AdHocInput, actor: Actor): Promise<Task> {
  const assignee = input.assignedTo ? ((await db.users.get(input.assignedTo)) ?? null) : null
  const task: Task = {
    localId: newLocalId('task'),
    activityCode: input.activityCode,
    animalId: input.animalId,
    farmId: input.farmId,
    title: input.title,
    dueAt: input.dueAt,
    toleranceDays: input.toleranceDays ?? 2,
    assignedRole: assignee?.role ?? input.assignedRole,
    assignedTo: assignee?.id ?? null,
    priority: input.priority,
    status: 'open',
    derivedFrom: input.note?.trim()
      ? `เจ้าหน้าที่มอบหมาย · ${input.note.trim()}`
      : `เจ้าหน้าที่มอบหมายโดย ${actor.name}`,
    doneAt: null,
    doneRecordLocalId: null,
    assignedAt: assignee ? Date.now() : null,
    assignedBy: assignee ? actor.userId : null,
    adHoc: true,
  }
  await db.tasks.add(task)
  await enqueue('tasks', 'create', task.localId, 400)
  await writeAudit({
    actor: `${actor.name} (${ROLE_LABEL[actor.role]})`,
    action: assignee ? `สร้างงานเฉพาะกิจและมอบหมายให้ ${assignee.name}` : 'สร้างงานเฉพาะกิจ',
    target: `task:${task.localId}`,
    before: null,
    after: task,
  })
  if (assignee) {
    await notify({
      title: `งานใหม่: ${task.title}`,
      body: `กำหนด ${new Date(task.dueAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} · มอบหมายโดย ${actor.name}`,
      toUser: assignee.id,
      toRole: assignee.role,
      level: task.priority === 'high' ? 'warn' : 'info',
      taskLocalId: task.localId,
      animalId: task.animalId,
      farmId: task.farmId,
    })
  }
  return task
}

// ── ยกระดับงานที่เลยกำหนด (ค-04, ALR-04) ─────────────────────────────────

export interface EscalationResult {
  markedOverdue: number
  escalated: number
}

/**
 * ตัวรันจริงของ ค-04 — เดิมมีแค่สถานะ escalated แต่ไม่มีอะไรตั้งค่าให้
 *
 * ทำสองขั้น
 *   1) งานที่เลยกำหนดเกิน toleranceDays → overdue
 *   2) overdue ที่ค้างต่อเกิน escalateAfterDays → escalated + แจ้งเจ้าหน้าที่สหกรณ์
 * เรียกซ้ำได้ เพราะงานที่ยกระดับแล้วไม่ถูกหยิบมาทำอีก
 */
export async function runEscalation(p: BioParams, now = Date.now()): Promise<EscalationResult> {
  const res: EscalationResult = { markedOverdue: 0, escalated: 0 }
  const rows = (await db.tasks.where('status').anyOf('open', 'overdue').toArray()).filter((k) =>
    inPhase(k.activityCode),
  )

  for (const task of rows) {
    if (!task.id) continue
    const overdueAt = task.dueAt + task.toleranceDays * DAY
    if (now < overdueAt) continue

    if (task.status === 'open') {
      await db.tasks.update(task.id, { status: 'overdue' })
      await enqueue('tasks', 'update', task.localId, 300)
      res.markedOverdue++
    }

    if (now < overdueAt + p.escalateAfterDays * DAY) continue

    await db.tasks.update(task.id, { status: 'escalated' })
    await enqueue('tasks', 'update', task.localId, 300)
    res.escalated++

    const daysLate = Math.floor((now - task.dueAt) / DAY)
    await notify({
      title: `งานค้างนาน ต้องตามให้: ${task.title}`,
      body: `เลยวันนัดมา ${daysLate} วันแล้ว ยังไม่มีใครบันทึกผล · ผู้รับผิดชอบ ${ROLE_LABEL[task.assignedRole]}${task.assignedTo ? '' : ' (ยังไม่ได้ระบุตัวคน)'}`,
      toRole: 'coop',
      level: 'critical',
      taskLocalId: task.localId,
      animalId: task.animalId,
      farmId: task.farmId,
    })
    // ทำเครื่องหมายที่แจ้งเตือนของงานใบเดิมด้วย ให้แท็บ "ถูกยกระดับ" ตรงกับความจริง
    const olds = await db.alerts.where('taskLocalId').equals(task.localId).toArray()
    for (const a of olds) {
      if (a.id && !a.escalatedAt && !a.resolvedAt) await db.alerts.update(a.id, { escalatedAt: now })
    }
  }
  return res
}

// ── กิจกรรมสหกรณ์ (ALR-01) ───────────────────────────────────────────────

export async function coopEvents(role: Role): Promise<CoopEvent[]> {
  const rows = await db.events.toArray()
  return rows
    .filter((e) => e.audience === null || e.audience === role)
    .sort((a, b) => b.startAt - a.startAt)
}

export async function postCoopEvent(
  input: Omit<CoopEvent, 'id' | 'localId' | 'postedAt' | 'postedBy'>,
  actor: Actor,
): Promise<CoopEvent> {
  const event: CoopEvent = {
    ...input,
    localId: newLocalId('event'),
    postedBy: actor.name,
    postedAt: Date.now(),
  }
  await db.events.add(event)
  await writeAudit({
    actor: `${actor.name} (${ROLE_LABEL[actor.role]})`,
    action: 'ประกาศกิจกรรมสหกรณ์',
    target: `event:${event.localId}`,
    before: null,
    after: event,
  })
  return event
}
