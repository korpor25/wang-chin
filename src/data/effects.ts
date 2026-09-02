/**
 * ผลข้างเคียงของการบันทึกกิจกรรม
 *
 * นี่คือส่วนที่ทำให้ระบบ "คิดเอง" ตาม ค-01 — บันทึกหนึ่งครั้งไม่ได้แค่เก็บลงตาราง
 * แต่เปลี่ยนสถานะของสัตว์ ตัดสต๊อก และสร้างกำหนดการของรอบถัดไปให้อัตโนมัติ
 */
import { db, newLocalId } from './db'
import {
  addDays,
  tasksAfterCalving,
  tasksAfterInsemination,
  tasksAfterPregnancy,
  type DerivedTask,
} from '../domain/rules'
import type { Animal, BioParams, Task } from '../domain/types'

const DAY = 86_400_000

export interface EffectSummary {
  /** ข้อความสั้น ๆ บอกผู้ใช้ว่าระบบทำอะไรต่อให้บ้าง */
  messages: string[]
  tasksCreated: number
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
): Promise<EffectSummary> {
  const out: EffectSummary = { messages: [], tasksCreated: 0 }
  const animal = animalId ? ((await db.animals.get(animalId)) ?? null) : null

  const addTasks = async (derived: DerivedTask[]) => {
    const rows = toTasks(derived, animal)
    await db.tasks.bulkAdd(rows)
    out.tasksCreated += rows.length
  }

  const patch = async (p: Partial<Animal>) => {
    if (!animal) return
    await db.animals.update(animal.id, p)
  }

  switch (activityCode) {
    // ── การคลอด ──
    case 'ก-01': {
      out.messages.push('ส่งให้สัตวบาลยืนยันการคลอด')
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
      const fmt = (d: Date) => d.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      out.messages.push(`ช่วงผสมที่เหมาะสม ${fmt(from)} – ${fmt(to)} น.`)
      await addTasks([
        {
          activityCode: 'ก-08',
          title: 'ผสมเทียมภายในช่วงที่เหมาะสม',
          dueAt: observedAt + params.goldenPeriodFromHours * 3_600_000,
          toleranceDays: 1,
          assignedRole: 'husbandry',
          priority: 'high',
          derivedFrom: `พบอาการเป็นสัด + ${params.goldenPeriodFromHours} ชม.`,
        },
      ])
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
          if (left <= 10) out.messages.push('สต๊อกล็อตนี้ใกล้หมด — แจ้งเจ้าหน้าที่สหกรณ์แล้ว')
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

    // ── รับน้ำเชื้อเข้าคลัง ──
    case 'ข-01': {
      const straws = Number(payload.straws) || 0
      const id = newLocalId('semen')
      const collectedAt = ts(payload.collectedAt, occurredAt)
      await db.semen.add({
        id,
        lotNo: String(payload.lotNo ?? ''),
        sireCode: String(payload.sireCode ?? ''),
        sireName: String(payload.sireName ?? ''),
        breed: String(payload.breed ?? ''),
        bloodPct: Number(payload.bloodPct) || 100,
        collectedAt,
        expiresAt: ts(payload.expiresAt, addDays(collectedAt, 1460)),
        tankId: String(payload.tankId ?? ''),
        canister: String(payload.canister ?? ''),
        strawsIn: straws,
        strawsUsed: 0,
        motilityCert: Number(payload.motilityCert) || 0,
        motilityLast: null,
        lastQcAt: null,
        nextQcAt: addDays(occurredAt, 180),
        status: 'ok',
      })
      out.messages.push(`เพิ่มล็อตใหม่ ${payload.lotNo} จำนวน ${straws} หลอดเข้าคลัง`)
      await addTasks([
        {
          activityCode: 'ข-02',
          title: `ตรวจคุณภาพน้ำเชื้อ ${payload.lotNo}`,
          dueAt: addDays(occurredAt, 180),
          toleranceDays: 14,
          assignedRole: 'coop',
          priority: 'normal',
          derivedFrom: 'รับเข้า + 6 เดือน',
        },
      ])
      break
    }

    // ── ตรวจคุณภาพน้ำเชื้อ ──
    case 'ข-02': {
      const batchId = String(payload.semenBatchId ?? '')
      const verdict = String(payload.verdict ?? '')
      if (batchId) {
        await db.semen.update(batchId, {
          motilityLast: Number(payload.motilityPost) || null,
          lastQcAt: occurredAt,
          nextQcAt: ts(payload.nextQcAt, addDays(occurredAt, 180)),
          status: verdict === 'ห้ามใช้' ? 'rejected' : verdict === 'เฝ้าระวัง' ? 'watch' : 'ok',
        })
        out.messages.push(
          verdict === 'ห้ามใช้'
            ? 'ล็อตนี้ถูกล็อกไม่ให้เลือกใช้ในการผสมแล้ว'
            : `อัปเดตสถานะล็อตเป็น "${verdict}"`,
        )
      }
      break
    }

    // ── ไนโตรเจนเหลว ──
    case 'ข-03': {
      const tankId = String(payload.tankId ?? '')
      const level = Number(payload.levelCm)
      const tank = await db.tanks.get(tankId)
      if (tank && Number.isFinite(level)) {
        const weeks = Math.max(0.5, (occurredAt - tank.lastCheckAt) / (7 * DAY))
        const rate = Math.max(0, (tank.levelCm - level) / weeks)
        await db.tanks.update(tankId, {
          levelCm: level,
          lastCheckAt: occurredAt,
          evaporationCmPerWeek: Number(rate.toFixed(2)),
          status: level < 8 ? 'critical' : rate > 3 ? 'watch' : 'ok',
        })
        out.messages.push(`อัตราการระเหย ${rate.toFixed(1)} ซม./สัปดาห์`)
        if (level < 8) out.messages.push('ระดับต่ำวิกฤต — แจ้งเตือนเจ้าหน้าที่ให้เติมด่วน')
      }
      break
    }

    // ── กลุ่มอาหาร ──
    case 'ข-04': {
      out.messages.push('บันทึกช่วงเวลาที่โคตัวนี้อยู่ในกลุ่มและสูตรอาหารแล้ว')
      break
    }

    // ── แท็ก RFID ──
    case 'ข-06': {
      const newTag = String(payload.newTag ?? '')
      if (newTag && animal) {
        await patch({ rfid: newTag })
        out.messages.push(`ผูกแท็กใหม่ ${newTag} กับประวัติเดิมแล้ว`)
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
  const alert = await db.alerts.where('localId').equals(task.localId).first()
  if (alert?.id) await db.alerts.update(alert.id, { resolvedAt: Date.now() })
}
