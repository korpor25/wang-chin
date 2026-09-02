/** จัดรูปแบบตัวเลขให้อ่านง่ายเป็นภาษาไทย */

const TH = 'th-TH'

export function bytes(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toLocaleString(TH, { maximumFractionDigits: digits })} ${units[i]}`
}

export function num(n: number, digits = 0): string {
  return n.toLocaleString(TH, { maximumFractionDigits: digits })
}

export function pct(part: number, whole: number): string {
  if (!whole) return '—'
  return `${((part / whole) * 100).toLocaleString(TH, { maximumFractionDigits: 1 })}%`
}

/** ระยะเวลาเป็นมิลลิวินาที → "3.4 วินาที" / "2 นาที 10 วิ" */
export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toLocaleString(TH, { maximumFractionDigits: 1 })} วินาที`
  const m = Math.floor(s / 60)
  const rest = Math.round(s % 60)
  if (m < 60) return `${m} นาที ${rest} วิ`
  const h = Math.floor(m / 60)
  return `${h} ชม. ${m % 60} นาที`
}

/** อายุของข้อมูล ใช้กับการทดสอบว่าข้อมูลอยู่รอดนานแค่ไหน */
export function age(from: number, to = Date.now()): string {
  const ms = Math.max(0, to - from)
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const mins = Math.floor((ms % 3_600_000) / 60_000)
  if (days > 0) return `${days} วัน ${hours} ชม.`
  if (hours > 0) return `${hours} ชม. ${mins} นาที`
  if (mins > 0) return `${mins} นาที`
  return 'เมื่อครู่'
}

/** อายุสัตว์ นับเป็นปีและเดือนแบบที่คนเลี้ยงใช้พูดกัน */
export function animalAge(birth: number, to = Date.now()): string {
  const months = Math.max(0, Math.floor((to - birth) / (30.44 * 86_400_000)))
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m} เดือน`
  if (m === 0) return `${y} ปี`
  return `${y} ปี ${m} เดือน`
}

export function dateTime(ts: number): string {
  return new Date(ts).toLocaleString(TH, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** ความเร็วเขียน/อ่าน */
export function speed(bytesWritten: number, ms: number): string {
  if (ms <= 0) return '—'
  return `${bytes((bytesWritten / ms) * 1000, 1)}/วินาที`
}
