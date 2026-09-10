/**
 * คะแนนสภาพร่างกาย (BCS) สำหรับโคเนื้อ สเกล 1–9 ตามมติที่ประชุม [29:56]
 *
 * แยกออกมาเป็นไฟล์ของตัวเองเพราะทั้งฟอร์ม ก-03 หน้าโครายตัว และคำแนะนำอัตโนมัติ
 * ต้องใช้คำอธิบายชุดเดียวกัน ถ้ากระจายอยู่ตามหน้าจอจะเพี้ยนกันเองเมื่อแก้ที่เดียว
 */
import type { BioParams } from './types'

export type BcsBand = 'thin' | 'ideal' | 'fat'

/** คำกำกับใต้ตัวเลขแต่ละระดับ ใช้กับสเกลโคเนื้อ 9 ระดับเท่านั้น */
export const BCS9_LABEL: Record<number, string> = {
  1: 'ผอมโซ',
  2: 'ผอมมาก',
  3: 'ผอม',
  4: 'ค่อนข้างผอม',
  5: 'มาตรฐาน',
  6: 'ดี',
  7: 'ค่อนข้างอ้วน',
  8: 'อ้วน',
  9: 'อ้วนมาก',
}

export function bcsBand(score: number): BcsBand {
  if (score <= 3) return 'thin'
  if (score <= 6) return 'ideal'
  return 'fat'
}

export const BAND_LABEL: Record<BcsBand, string> = {
  thin: 'ผอม',
  ideal: 'สมบูรณ์',
  fat: 'อ้วน',
}

/** ช่วงคะแนนของแต่ละกลุ่ม ใช้เวลาต้องบอกว่ากลุ่มนั้นคือเลขอะไรถึงอะไร */
export const BAND_RANGE: Record<BcsBand, string> = {
  thin: '1–3',
  ideal: '4–6',
  fat: '7–9',
}

/** โทนสีของแต่ละกลุ่ม ผูกกับโทเคนสีเดียวกับทั้งระบบ */
export const BAND_TONE: Record<BcsBand, 'crit' | 'ok' | 'info'> = {
  thin: 'crit',
  ideal: 'ok',
  fat: 'info',
}

/** สิ่งที่คลำได้จริงหน้างานในแต่ละกลุ่ม ใช้ช่วยให้ผู้ประเมินให้คะแนนตรงกัน */
export const BAND_CHECKS: Record<BcsBand, Array<[string, string]>> = {
  thin: [
    ['สะโพกและก้นกบ', 'เห็นปุ่มกระดูกชัด'],
    ['ซี่โครง', 'นับได้ทุกซี่'],
    ['โคนหาง', 'โพรงลึก ไม่มีไขมัน'],
  ],
  ideal: [
    ['สะโพกและก้นกบ', 'ไม่เห็นปุ่มกระดูก'],
    ['ซี่โครง', 'โค้งมน เรียบเนียน'],
    ['โคนหาง', 'โพรงตื้น ไม่นูน'],
  ],
  fat: [
    ['สะโพกและก้นกบ', 'กลมนูน คลำกระดูกไม่เจอ'],
    ['ซี่โครง', 'คลำไม่พบ มีไขมันหนา'],
    ['โคนหาง', 'ไขมันนูนเป็นก้อน'],
  ],
}

export interface BcsAdvice {
  tone: 'ok' | 'warn' | 'crit'
  text: string
}

/**
 * คำแนะนำอัตโนมัติหลังให้คะแนน — เทียบกับเกณฑ์เข้าผสมที่ตั้งไว้ใน BioParams
 * ไม่ hard-code เลข 5 เพราะที่ประชุมปรับเกณฑ์นี้ได้ผ่านหน้าตั้งค่า
 */
export function bcsAdvice(score: number, p: BioParams): BcsAdvice {
  const band = bcsBand(score)
  if (score < p.bcsMinBeforeBreeding)
    return {
      tone: 'crit',
      text: `BCS ${score.toFixed(1)} ต่ำกว่าเกณฑ์เข้าผสม ${p.bcsMinBeforeBreeding} — ต้องปรับอาหารและประเมินซ้ำก่อนเข้าโปรแกรม`,
    }
  if (band === 'fat')
    return {
      tone: 'warn',
      text: `BCS ${score.toFixed(1)} สูงกว่าช่วงที่เหมาะสม — ไขมันสะสมมากมีผลต่ออัตราการผสมติดและการคลอด`,
    }
  return {
    tone: 'ok',
    text: `BCS ${score.toFixed(1)} อยู่ในกลุ่มสมบูรณ์ — เหมาะกับการเข้าโปรแกรมผสมเทียม`,
  }
}
