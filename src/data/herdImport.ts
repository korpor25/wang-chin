/**
 * นำเข้าฟาร์มและโค — ทั้งแบบทั้งไฟล์ (admin สหกรณ์) และเพิ่มทีละตัว (สัตวบาล)
 *
 * ทั้งสองทางผ่านตัวตรวจชุดเดียวกัน แล้วเขียนลงเครื่องพร้อมเข้าคิวส่งขึ้นเซิร์ฟเวอร์
 * (POST /sync/farms, /sync/animals) ใช้ท่อเดียวกับบันทึกกิจกรรม จึงลองส่งซ้ำให้เองเมื่อเน็ตหลุด
 */
import { db, newLocalId, writeAudit } from './db'
import { enqueue } from './sync'
import { getParams } from './queries'
import type { Animal, CycleStage, Farm } from '../domain/types'

export type ImportTarget = 'farms' | 'animals'

export interface ImportColumn {
  key: string
  label: string
  required?: boolean
  example: string
  /** ชื่อหัวตารางอื่นที่ให้จับคู่อัตโนมัติ */
  aliases?: string[]
}

export const IMPORT_COLUMNS: Record<ImportTarget, ImportColumn[]> = {
  farms: [
    { key: 'code', label: 'รหัสฟาร์ม', required: true, example: 'WC-031', aliases: ['farmCode'] },
    { key: 'name', label: 'ชื่อฟาร์ม', required: true, example: 'ฟาร์มสมศรี' },
    { key: 'owner', label: 'เจ้าของ', example: 'สมศรี ใจงาม', aliases: ['ชื่อเจ้าของ'] },
    { key: 'phone', label: 'เบอร์โทร', example: '0812345678', aliases: ['โทรศัพท์'] },
    { key: 'village', label: 'หมู่บ้าน', example: 'บ้านนาพูน' },
    { key: 'subdistrict', label: 'ตำบล', example: 'นาพูน' },
    { key: 'district', label: 'อำเภอ', example: 'วังชิ้น' },
    { key: 'province', label: 'จังหวัด', example: 'แพร่' },
  ],
  animals: [
    { key: 'rfid', label: 'RFID', required: true, example: '900100000000001' },
    { key: 'tagNo', label: 'เบอร์หู', required: true, example: 'WC0501', aliases: ['tag'] },
    { key: 'farmCode', label: 'รหัสฟาร์ม', required: true, example: 'WC-031', aliases: ['farm'] },
    { key: 'sex', label: 'เพศ', example: 'เมีย' },
    { key: 'breed', label: 'สายพันธุ์', example: 'บราห์มัน' },
    { key: 'bloodPct', label: 'เปอร์เซ็นต์สายเลือด', example: '75', aliases: ['สายเลือด'] },
    { key: 'birthDate', label: 'วันเกิด', example: '2022-05-14' },
    { key: 'parity', label: 'จำนวนท้อง', example: '1', aliases: ['ท้องที่'] },
    { key: 'lastCalvingAt', label: 'วันคลอดล่าสุด', example: '2026-03-02' },
    { key: 'lastBcs', label: 'BCS ล่าสุด', example: '5' },
    { key: 'damTag', label: 'เบอร์หูแม่', example: '' },
    { key: 'sireCode', label: 'รหัสพ่อพันธุ์', example: '' },
  ],
}

export const TARGET_LABEL: Record<ImportTarget, string> = { farms: 'ฟาร์ม', animals: 'โค' }

// ── อ่านไฟล์ ───────────────────────────────────────────────────────────────

/** แยก CSV/TSV แบบรองรับเครื่องหมายคำพูด — ข้อความที่มีจุลภาคอยู่ข้างในจะไม่เลื่อนช่อง */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  // ก๊อปจาก Excel มาวางจะคั่นด้วยแท็บ ไฟล์ CSV คั่นด้วยจุลภาค
  const sep = firstLine.includes('\t') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim())
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c !== ''))
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** อ่านไฟล์ .xlsx / .csv / .txt เป็นตาราง — ไลบรารี Excel โหลดเฉพาะตอนเลือกไฟล์ Excel */
export async function readTableFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser')
    const data = await readSheet(file)
    return data
      .map((r) =>
        r.map((c) => {
          if (c === null || c === undefined) return ''
          if ((c as unknown) instanceof Date) return isoDay(c as unknown as Date)
          return String(c).trim()
        }),
      )
      .filter((r) => r.some((c) => c !== ''))
  }
  if (/\.xls$/i.test(file.name)) throw new Error('ไฟล์ .xls รุ่นเก่ายังไม่รองรับ ให้บันทึกเป็น .xlsx หรือ .csv ก่อน')
  return parseDelimited(await file.text())
}

/** เดาการจับคู่คอลัมน์จากชื่อหัวตาราง */
export function autoMap(target: ImportTarget, headers: string[]): Record<string, number> {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '')
  const out: Record<string, number> = {}
  for (const c of IMPORT_COLUMNS[target]) {
    const names = [c.key, c.label, ...(c.aliases ?? [])].map(norm)
    const i = headers.findIndex((h) => names.includes(norm(h)))
    if (i >= 0) out[c.key] = i
  }
  return out
}

/** ไฟล์แม่แบบ — หัวตารางเป็นชื่อไทยที่ autoMap จับคู่ได้เองทันที */
export function downloadTemplate(target: ImportTarget) {
  const cols = IMPORT_COLUMNS[target]
  const csv = [cols.map((c) => c.label).join(','), cols.map((c) => c.example).join(',')].join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `แม่แบบนำเข้า${TARGET_LABEL[target]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── แปลงค่า ────────────────────────────────────────────────────────────────

/**
 * รับได้ทั้ง 2022-05-14, 14/05/2022 และปี พ.ศ. (14/05/2565)
 * คืน null ถ้าว่าง, NaN ถ้ารูปแบบผิด
 */
export function parseDay(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  let y: number, m: number, d: number
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])]
  else return NaN
  if (y > 2400) y -= 543
  const dt = new Date(y, m - 1, d)
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return NaN
  return dt.getTime()
}

const SEX: Record<string, Animal['sex']> = {
  เมีย: 'female', ตัวเมีย: 'female', f: 'female', female: 'female',
  ผู้: 'male', ตัวผู้: 'male', m: 'male', male: 'male',
}

// ── ตรวจความถูกต้อง ──────────────────────────────────────────────────────────

export interface RowError {
  /** เลขแถวตามที่เห็นในไฟล์ (หัวตาราง = แถว 1) */
  row: number
  reason: string
}

export interface Checked<T> {
  valid: T[]
  errors: RowError[]
}

type Values = Record<string, string>

export async function checkFarms(rows: Values[], firstRow = 2): Promise<Checked<Farm>> {
  const existing = new Set((await db.farms.toArray()).map((f) => f.code.toLowerCase()))
  const seen = new Set<string>()
  const out: Checked<Farm> = { valid: [], errors: [] }

  rows.forEach((v, i) => {
    const row = firstRow + i
    const problems: string[] = []
    const code = (v.code ?? '').trim()
    const name = (v.name ?? '').trim()
    if (!code) problems.push('ไม่มีรหัสฟาร์ม')
    else if (existing.has(code.toLowerCase())) problems.push(`รหัสฟาร์ม ${code} มีในระบบแล้ว`)
    else if (seen.has(code.toLowerCase())) problems.push(`รหัสฟาร์ม ${code} ซ้ำในไฟล์`)
    if (!name) problems.push('ไม่มีชื่อฟาร์ม')
    const phone = (v.phone ?? '').replace(/\D/g, '')
    if (phone && phone.length !== 9 && phone.length !== 10) problems.push('เบอร์โทรต้องมี 9–10 หลัก')

    if (problems.length) return out.errors.push({ row, reason: problems.join(' · ') })
    seen.add(code.toLowerCase())
    out.valid.push({
      id: newLocalId('farm'),
      code,
      name,
      owner: (v.owner ?? '').trim(),
      phone,
      village: (v.village ?? '').trim(),
      subdistrict: (v.subdistrict ?? '').trim(),
      district: (v.district ?? '').trim() || 'วังชิ้น',
      province: (v.province ?? '').trim() || 'แพร่',
      lat: 0,
      lng: 0,
      active: true,
    })
  })
  return out
}

export async function checkAnimals(rows: Values[], firstRow = 2): Promise<Checked<Animal>> {
  const [farms, animals, params] = await Promise.all([db.farms.toArray(), db.animals.toArray(), getParams()])
  const farmByCode = new Map(farms.map((f) => [f.code.toLowerCase(), f.id]))
  const rfidTaken = new Set(animals.map((a) => a.rfid))
  const tagTaken = new Set(animals.map((a) => a.tagNo.toLowerCase()))
  const idByTag = new Map(animals.map((a) => [a.tagNo.toLowerCase(), a.id]))
  const out: Checked<Animal> = { valid: [], errors: [] }

  rows.forEach((v, i) => {
    const row = firstRow + i
    const problems: string[] = []
    const rfid = (v.rfid ?? '').replace(/\s/g, '')
    const tagNo = (v.tagNo ?? '').trim()
    const farmCode = (v.farmCode ?? '').trim()

    if (!rfid) problems.push('ไม่มี RFID')
    else if (!/^\d{15}$/.test(rfid)) problems.push('RFID ต้องเป็นตัวเลข 15 หลัก')
    else if (rfidTaken.has(rfid)) problems.push(`RFID ${rfid} มีในระบบแล้วหรือซ้ำในไฟล์`)

    if (!tagNo) problems.push('ไม่มีเบอร์หู')
    else if (tagTaken.has(tagNo.toLowerCase())) problems.push(`เบอร์หู ${tagNo} มีในระบบแล้วหรือซ้ำในไฟล์`)

    const farmId = farmByCode.get(farmCode.toLowerCase())
    if (!farmCode) problems.push('ไม่มีรหัสฟาร์ม')
    else if (!farmId) problems.push(`ไม่พบฟาร์มรหัส ${farmCode} — นำเข้าฟาร์มก่อน`)

    const sexRaw = (v.sex ?? '').trim().toLowerCase()
    const sex = sexRaw ? SEX[sexRaw] : 'female'
    if (!sex) problems.push('เพศต้องเป็น เมีย หรือ ผู้')

    const bloodPct = v.bloodPct?.trim() ? Number(v.bloodPct.replace('%', '')) : 100
    if (!Number.isFinite(bloodPct) || bloodPct < 0 || bloodPct > 100) problems.push('เปอร์เซ็นต์สายเลือดต้องอยู่ระหว่าง 0–100')

    const birthDate = parseDay(v.birthDate ?? '')
    if (Number.isNaN(birthDate)) problems.push('วันเกิดอ่านไม่ออก (ใช้ 2022-05-14 หรือ 14/05/2565)')
    else if (birthDate !== null && birthDate > Date.now()) problems.push('วันเกิดอยู่ในอนาคต')

    const parity = v.parity?.trim() ? Number(v.parity) : 0
    if (!Number.isInteger(parity) || parity < 0 || parity > 20) problems.push('จำนวนท้องต้องเป็นจำนวนเต็ม 0–20')

    const lastCalvingAt = parseDay(v.lastCalvingAt ?? '')
    if (Number.isNaN(lastCalvingAt)) problems.push('วันคลอดล่าสุดอ่านไม่ออก')

    const lastBcs = v.lastBcs?.trim() ? Number(v.lastBcs) : null
    if (lastBcs !== null && (!Number.isFinite(lastBcs) || lastBcs < 1 || lastBcs > 9)) problems.push('BCS ต้องอยู่ระหว่าง 1–9')

    const damTag = (v.damTag ?? '').trim().toLowerCase()
    const damId = damTag ? (idByTag.get(damTag) ?? null) : null
    if (damTag && !damId) problems.push(`ไม่พบแม่เบอร์หู ${v.damTag}`)

    if (problems.length) return out.errors.push({ row, reason: problems.join(' · ') })

    // กันซ้ำภายในไฟล์เดียวกันด้วย
    rfidTaken.add(rfid)
    tagTaken.add(tagNo.toLowerCase())

    const calved = lastCalvingAt as number | null
    const stage: CycleStage =
      parity === 0
        ? 'heifer'
        : calved && Date.now() - calved < params.voluntaryWaitDays * 86_400_000
          ? 'fresh'
          : 'waiting'

    const animal: Animal = {
      id: newLocalId('an'),
      rfid,
      tagNo,
      name: '',
      sex: sex!,
      breed: (v.breed ?? '').trim(),
      bloodPct,
      birthDate: (birthDate as number | null) ?? 0,
      farmId: farmId!,
      damId,
      sireCode: (v.sireCode ?? '').trim() || null,
      stage,
      parity,
      lastCalvingAt: calved,
      lastHeatAt: null,
      lastBredAt: null,
      expectedCalvingAt: null,
      lastBcs,
      feedGroupId: null,
      withdrawalUntil: null,
      active: true,
    }
    idByTag.set(tagNo.toLowerCase(), animal.id)
    out.valid.push(animal)
  })
  return out
}

/** จับคู่แถวดิบกับคอลัมน์ที่ผู้ใช้เลือก */
export function toValues(rows: string[][], mapping: Record<string, number>): Values[] {
  return rows.map((r) => {
    const v: Values = {}
    for (const [key, i] of Object.entries(mapping)) v[key] = r[i] ?? ''
    return v
  })
}

// ── บันทึก ─────────────────────────────────────────────────────────────────

export async function saveFarms(farms: Farm[], actor: string) {
  await db.farms.bulkAdd(farms)
  for (const f of farms) await enqueue('farms', 'create', f.id, 400)
  await writeAudit({ actor, action: `นำเข้าฟาร์ม ${farms.length} แห่ง`, target: 'farms', before: null, after: farms.map((f) => f.code) })
}

export async function saveAnimals(animals: Animal[], actor: string, how = 'นำเข้าโค') {
  await db.animals.bulkAdd(animals)
  for (const a of animals) await enqueue('animals', 'create', a.id, 500)
  await writeAudit({
    actor,
    action: `${how} ${animals.length} ตัว`,
    target: 'animals',
    before: null,
    after: animals.map((a) => a.tagNo),
  })
}
