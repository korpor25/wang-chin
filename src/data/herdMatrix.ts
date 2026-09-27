/**
 * ตารางสรุปฝูงโคแยกฟาร์ม × เพศ × ระยะของวงจร สำหรับหน้าฝูงโคและการนำออกเป็นไฟล์
 *
 * นับจากข้อมูลในเครื่อง ชุดเดียวกับที่หน้าฝูงโคแสดง — การจำกัดให้เกษตรกรเห็นแค่ฟาร์มตัวเอง (SEC-01)
 * อยู่ที่เซิร์ฟเวอร์ ซึ่งต้องซิงค์ลงเครื่องเฉพาะฟาร์มที่บัญชีนั้นมีสิทธิ์
 */
import { db } from './db'
import { CYCLE_LABEL, type CycleStage, type Farm } from '../domain/types'

export const MATRIX_STAGES: CycleStage[] = ['heifer', 'fresh', 'waiting', 'bred', 'pregnant', 'problem', 'culled']

export interface MatrixRow {
  farm: Pick<Farm, 'id' | 'code' | 'name'>
  total: number
  female: number
  male: number
  stages: Record<CycleStage, number>
}

const emptyStages = () =>
  Object.fromEntries(MATRIX_STAGES.map((s) => [s, 0])) as Record<CycleStage, number>

export async function herdMatrix(): Promise<{ rows: MatrixRow[]; sum: MatrixRow }> {
  const farms = (await db.farms.toArray()).sort((a, b) => a.code.localeCompare(b.code))
  const byFarm = new Map<string, MatrixRow>(
    farms.map((f) => [
      f.id,
      { farm: { id: f.id, code: f.code, name: f.name }, total: 0, female: 0, male: 0, stages: emptyStages() },
    ]),
  )

  await db.animals.each((a) => {
    const row = byFarm.get(a.farmId)
    if (!row) return
    row.total++
    row[a.sex]++
    row.stages[a.stage]++
  })

  const rows = [...byFarm.values()]
  const sum: MatrixRow = {
    farm: { id: '', code: '', name: 'รวมทุกฟาร์ม' },
    total: 0,
    female: 0,
    male: 0,
    stages: emptyStages(),
  }
  for (const r of rows) {
    sum.total += r.total
    sum.female += r.female
    sum.male += r.male
    for (const s of MATRIX_STAGES) sum.stages[s] += r.stages[s]
  }
  return { rows, sum }
}

const cell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** ดาวน์โหลดเป็น CSV — ใส่ BOM ไว้ให้ Excel อ่านภาษาไทยถูก */
export function downloadMatrixCsv(rows: MatrixRow[], sum: MatrixRow) {
  const head = ['รหัสฟาร์ม', 'ฟาร์ม', 'ทั้งหมด', 'เพศเมีย', 'เพศผู้', ...MATRIX_STAGES.map((s) => CYCLE_LABEL[s])]
  const line = (r: MatrixRow) =>
    [r.farm.code, r.farm.name, r.total, r.female, r.male, ...MATRIX_STAGES.map((s) => r.stages[s])]
      .map(cell)
      .join(',')
  const csv = [head.map(cell).join(','), ...rows.map(line), line(sum)].join('\r\n')

  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `ฝูงโค-สรุปรายฟาร์ม-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
