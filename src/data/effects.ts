/**
 * ผลข้างเคียงของการบันทึกกิจกรรม
 *
 * นี่คือส่วนที่ทำให้ระบบ "คิดเอง" ตาม ค-01 — บันทึกหนึ่งครั้งไม่ได้แค่เก็บลงตาราง
 * แต่เปลี่ยนสถานะของสัตว์ ตัดสต๊อก และสร้างกำหนดการของรอบถัดไปให้อัตโนมัติ
 */
import { db, newLocalId } from './db'
import { enqueue } from './sync'
import {
  addDays,
  taskConfirmCalving,
  taskConfirmHeat,
  taskInseminate,
  tasksAfterCalving,
  tasksAfterInsemination,
  tasksAfterPregnancy,
  type DerivedTask,
} from '../domain/rules'
import type { Alert, Animal, BioParams, Role, Task } from '../domain/types'

const DAY = 86_400_000

export interface EffectSummary {
  /** ข้อความสั้น ๆ บอกผู้ใช้ว่าระบบทำอะไรต่อให้บ้าง */
  messages: string[]
  tasksCreated: number
}

/** ผู้ที่กำลังบันทึก — ผลของบางกิจกรรมต่างกันตามบทบาทของผู้บันทึก เช่น ก-07 */
export interface Actor {
  userId: string
  name: string
  role: Role
}

/** ส่งแจ้งเตือนถึงบทบาทหนึ่ง (ค-03) พร้อมช่องติดตามผลตอบสนองครบสี่เวลา */
export async function notify(a: {
  title: string
  body: string
  toRole: Role
  toUser?: string | null
  level?: Alert['level']
  channel?: Alert['channel']
  taskLocalId?: string | null
  animalId?: string | null
  farmId?: string | null
}) {
  await db.alerts.add({
    localId: newLocalId('alert'),
    taskLocalId: a.taskLocalId ?? null,
    animalId: a.animalId ?? null,
    farmId: a.farmId ?? null,
    title: a.title,
    body: a.body,
    level: a.level ?? 'info',
    channel: a.channel ?? (a.toRole === 'farmer' ? 'line' : 'in-app'),
    toRole: a.toRole,
    toUser: a.toUser ?? null,
    sentAt: Date.now(),
    readAt: null,
    ackAt: null,
    escalatedAt: null,
    resolvedAt: null,
  })
}

function toTasks(derived: DerivedTask[], animal: Animal | null): Task[] {
  return derived.map((d) => ({
    localId: newLocalId('task'),
    activityCode: d.activityCode,
    animalId: animal?.id ?? null,
    farmId: animal?.farmId ?? null,
    title: d.title,
    dueAt: d.dueAt,
    toleranceDays: d.toleranceDays,
    assignedRole: d.assignedRole,
    assignedTo: null,
    priority: d.priority,
    status: 'open',
    derivedFrom: d.derivedFrom,
    doneAt: null,
    doneRecordLocalId: null,
  }))
}

/** แปลงค่าที่รับมาจากฟอร์มให้เป็น timestamp — ฟอร์มส่งมาเป็นสตริงของ input */
function ts(v: unknown, fallback = Date.now()): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v) {
    const n = Date.parse(v)
    if (!Number.isNaN(n)) return n
  }
  return fallback
}

export async function applyEffects(
  activityCode: string,
  payload: Record<string, unknown>,
  animalId: string | null,
  params: BioParams,
  occurredAt: number,
  actor: Actor,
): Promise<EffectSummary> {
  const out: EffectSummary = { messages: [], tasksCreated: 0 }
  const animal = animalId ? ((await db.animals.get(animalId)) ?? null) : null

  const addTasks = async (derived: DerivedTask[]): Promise<Task[]> => {
    const rows = toTasks(derived, animal)
    await db.tasks.bulkAdd(rows)
    // งานที่ระบบสร้างต้องเข้าคิวซิงค์เหมือนบันทึกอื่น ไม่งั้นเจ้าหน้าที่คนอื่นไม่เห็น
    for (const r of rows) await enqueue('tasks', 'create', r.localId, 400)
    out.tasksCreated += rows.length
    return rows
  }

  const patch = async (p: Partial<Animal>) => {
    if (!animal) return
    await db.animals.update(animal.id, p)
  }

  switch (activityCode) {
    // ── การคลอด ──
    case 'ก-01': {
      // การแจ้งของเกษตรกรต้องกลายเป็นงานของสัตวบาลจริง ๆ ไม่ใช่แค่ข้อความตอบกลับ
      const foundAt = ts(payload.foundAt, occurredAt)
      const reporter = String(payload.reporter ?? actor.name)
      const [task] = await addTasks([taskConfirmCalving(foundAt, reporter)])
      await notify({
        title: 'มีการแจ้งการคลอด รอยืนยัน',
        body: `${animal ? `${animal.tagNo} · ` : ''}แจ้งโดย ${reporter} เมื่อ ${new Date(foundAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} น.`,
        toRole: 'husbandry',
        level: 'warn',
        taskLocalId: task?.localId ?? null,
        animalId,
        farmId: animal?.farmId ?? null,
      })
      out.messages.push('สร้างงาน "ยืนยันการคลอด" ให้สัตวบาลแล้ว พร้อมส่งแจ้งเตือน')
      break
    }
    case 'ก-02': {
      const calvedAt = ts(payload.calvedAt, occurredAt)
      await patch({
        lastCalvingAt: calvedAt,
        stage: 'fresh',
        parity: (animal?.parity ?? 0) + 1,
        lastBredAt: null,
        expectedCalvingAt: null,
      })
      await addTasks(tasksAfterCalving(calvedAt, params))
      out.messages.push('ปิดรอบผสมเดิม และเปิดรอบใหม่ให้แล้ว')
      if (payload.retainedPlacenta === true)
        out.messages.push('พบรกค้าง — ระบบทำเครื่องหมายเฝ้าระวังมดลูกอักเสบไว้')
      break
    }

    // ── BCS ──
    case 'ก-03': {
      const score = Number(payload.score)
      if (Number.isFinite(score)) {
        await patch({ lastBcs: score })
        out.messages.push(`อัปเดต BCS ล่าสุดเป็น ${score}`)
        if (score < params.bcsMinBeforeBreeding)
          out.messages.push('ต่ำกว่าเกณฑ์เข้าผสม — เพิ่มเข้ารายการที่ต้องปรับอาหาร')
      }
      break
    }

    // ── ตรวจความพร้อม ──
    case 'ก-05': {
      const ready = payload.ready === true
      await patch({ stage: ready ? 'waiting' : 'problem' })
      out.messages.push(ready ? 'เปลี่ยนสถานะเป็นพร้อมผสม' : 'เปลี่ยนสถานะเป็นต้องฟื้นฟูก่อน')
      break
    }

    // ── เป็นสัด ──
    case 'ก-07': {
      const observedAt = ts(payload.observedAt, occurredAt)
      await patch({ lastHeatAt: observedAt })
      const from = new Date(observedAt + params.goldenPeriodFromHours * 3_600_000)
      const to = new Date(observedAt + params.goldenPeriodToHours * 3_600_000)
      const fmt = (d: Date) =>
        d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      out.messages.push(`ช่วงผสมที่เหมาะสม ${fmt(from)} – ${fmt(to)} น.`)

      // เกษตรกรแจ้ง → ต้องผ่านการยืนยันของสัตวบาลก่อน ว่าเป็นสัดจริงหรือสัดหลอก
      if (actor.role === 'farmer') {
        const [task] = await addTasks([taskConfirmHeat(observedAt, params, actor.name)])
        await notify({
          title: 'เกษตรกรแจ้งอาการเป็นสัด รอยืนยัน',
          body: `${animal ? `${animal.tagNo} · ` : ''}ช่วงผสมที่เหมาะสม ${fmt(from)} – ${fmt(to)} น.`,
          toRole: 'husbandry',
          level: 'warn',
          taskLocalId: task?.localId ?? null,
          animalId,
          farmId: animal?.farmId ?? null,
        })
        out.messages.push('ส่งให้สัตวบาลยืนยันก่อน ระบบยังไม่สร้างงานผสมจนกว่าจะยืนยันว่าเป็นสัดจริง')
        break
      }

      // สัตวบาลบันทึกเอง — ถ้าตัดสินว่าเป็นสัดหลอกก็จบรอบนี้ ไม่ต้องสร้างงานผสม
      const verdict = String(payload.verdict ?? '')
      if (verdict === 'สัดหลอกหรือไม่ชัด') {
        out.messages.push('บันทึกว่าไม่ใช่สัดจริง — ไม่สร้างงานผสม และคงการเฝ้าระวังตามวงรอบไว้เหมือนเดิม')
        break
      }
      await addTasks([taskInseminate(observedAt, params)])
      break
    }

    // ── ผสมเทียม ──
    case 'ก-08': {
      const bredAt = ts(payload.inseminatedAt, occurredAt)
      await patch({ lastBredAt: bredAt, stage: 'bred' })
      await addTasks(tasksAfterInsemination(bredAt, params))
      const batchId = payload.semenBatchId
      if (typeof batchId === 'string' && batchId) {
        const batch = await db.semen.get(batchId)
        if (batch) {
          await db.semen.update(batchId, { strawsUsed: batch.strawsUsed + 1 })
          const left = batch.strawsIn - batch.strawsUsed - 1
          out.messages.push(`ตัดสต๊อก ${batch.lotNo} เหลือ ${left} หลอด`)
          // เกณฑ์เตือนมาจากพารามิเตอร์ชุดเดียวกับรหัสสีในหน้าคลัง จะได้ไม่เพี้ยนกันคนละที่
          if (left <= params.semenWarnStraws) {
            const crit = left <= params.semenCritStraws
            await notify({
              title: `น้ำเชื้อล็อต ${batch.lotNo} ${crit ? 'เหลือน้อยระดับวิกฤต' : 'ใกล้หมด'}`,
              body: `คงเหลือ ${left} หลอด · เกณฑ์เฝ้าระวัง ${params.semenWarnStraws} หลอด · เกณฑ์วิกฤต ${params.semenCritStraws} หลอด`,
              toRole: 'coop',
              level: crit ? 'critical' : 'warn',
            })
            out.messages.push(
              `สต๊อกล็อตนี้${crit ? 'เหลือน้อยระดับวิกฤต' : 'ใกล้หมด'} — แจ้งเจ้าหน้าที่สหกรณ์แล้ว`,
            )
          }
        }
      }
      out.messages.push(`นัดตรวจครรภ์ในอีก ${params.pregnancyCheckDays} วัน`)
      break
    }

    // ── ตรวจครรภ์ ──
    case 'ก-09': {
      const result = String(payload.result ?? '')
      if (result === 'ตั้งท้อง') {
        const bredAt = animal?.lastBredAt ?? occurredAt
        const calving = addDays(bredAt, params.gestationDays)
        await patch({ stage: 'pregnant', expectedCalvingAt: calving })
        await addTasks(tasksAfterPregnancy(bredAt, params))
        out.messages.push(
          `ยืนยันตั้งท้อง · คลอดคาดการณ์ ${new Date(calving).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        )
      } else if (result === 'ไม่ตั้งท้อง') {
        await patch({ stage: 'waiting' })
        out.messages.push('ไม่ติด — กลับเข้าคิวเฝ้าระวังการเป็นสัดอีกครั้ง')
        await addTasks([
          {
            activityCode: 'ก-07',
            title: 'เฝ้าระวังการเป็นสัดรอบถัดไป',
            dueAt: occurredAt + 3 * DAY,
            toleranceDays: 3,
            assignedRole: 'husbandry',
            priority: 'normal',
            derivedFrom: 'ผลตรวจครรภ์ไม่ติด',
          },
        ])
      }
      break
    }

    // ── สุขภาพ ──
    case 'ก-10': {
      const days = Number(payload.withdrawalDays)
      if (Number.isFinite(days) && days > 0) {
        await patch({ withdrawalUntil: occurredAt + days * DAY })
        out.messages.push(`ตั้งระยะหยุดยา ${days} วัน — ระบบจะกันไม่ให้เข้าโปรแกรมผสมจนพ้นกำหนด`)
      }
      break
    }

    // ── เตรียมโคและคอกคลอด ──
    case 'ก-11': {
      const willDo = payload.willDo === true
      const obstacle = String(payload.obstacle ?? '').trim()
      out.messages.push(
        willDo
          ? 'บันทึกการตอบรับแจ้งเตือนแล้ว — นับเข้าอัตราการตอบสนองของฟาร์มนี้'
          : 'บันทึกว่ายังดำเนินการไม่ได้ — ส่งให้เจ้าหน้าที่สหกรณ์ช่วยตาม',
      )
      if (!willDo || obstacle) {
        await notify({
          title: 'เกษตรกรแจ้งอุปสรรคในการเตรียมคอกคลอด',
          body: `${animal ? `${animal.tagNo} · ` : ''}${obstacle || 'ยังยืนยันไม่ได้'} · แจ้งโดย ${actor.name}`,
          toRole: 'coop',
          level: 'warn',
          animalId,
          farmId: animal?.farmId ?? null,
        })
      }
      break
    }

  }

  return out
}

/** ปิดงานที่ผูกกับบันทึกนี้ */
export async function closeTask(taskLocalId: string, recordLocalId: string) {
  const task = await db.tasks.where('localId').equals(taskLocalId).first()
  if (!task?.id) return
  await db.tasks.update(task.id, {
    status: 'done',
    doneAt: Date.now(),
    doneRecordLocalId: recordLocalId,
  })
  await enqueue('tasks', 'update', task.localId, 300)
  // แจ้งเตือนของงานใบนี้ผูกด้วย taskLocalId ปิดเรื่องพร้อมกันเพื่อให้ ALR-02 ครบสี่เวลา
  const alerts = await db.alerts.where('taskLocalId').equals(task.localId).toArray()
  const now = Date.now()
  for (const a of alerts) {
    if (a.id && !a.resolvedAt) await db.alerts.update(a.id, { resolvedAt: now })
  }
}
