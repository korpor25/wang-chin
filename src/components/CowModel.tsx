/**
 * โมเดลโค 3 มิติ ในหน้าโครายตัว
 *
 * แสดงทันทีที่เปิดหน้า แต่ไม่รวมอยู่ในชุดไฟล์ที่แคชไว้ตั้งแต่แรก
 * ตัวแสดงผลกับไฟล์โมเดลรวมกันหนักกว่าทั้งแอปเดิมสามเท่า จึงโหลดแยกทีหลัง
 * หน้าจึงขึ้นให้ใช้งานได้ทันทีโดยไม่ต้องรอโมเดล แล้วโมเดลค่อยตามมา
 *
 * โมเดลจาก Sketchfab สัญญาอนุญาต CC Attribution — ต้องขึ้นเครดิตผู้สร้างเสมอ
 */
import { useEffect, useState } from 'react'
import { CloudOff, RotateCcw } from 'lucide-react'

/** พาธของไฟล์โมเดลในโฟลเดอร์ public */
const MODEL_SRC = '/models/cow.glb'

type Phase = 'loading' | 'ready' | 'missing'

export function CowModel({ label }: { label: string }) {
  const [phase, setPhase] = useState<Phase>('loading')

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        // นำเข้าแบบไดนามิก ตัวไลบรารีจึงถูกแยกเป็นไฟล์ต่างหาก ไม่ถ่วงการเปิดแอป
        await import('@google/model-viewer')
        const res = await fetch(MODEL_SRC, { method: 'HEAD' })
        if (alive) setPhase(res.ok ? 'ready' : 'missing')
      } catch {
        // ออฟไลน์และยังไม่เคยโหลดมาก่อน หรือไฟล์หาย
        if (alive) setPhase('missing')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (phase === 'loading')
    return (
      <div className="model-box loading">
        <RotateCcw size={18} className="ic-faint" />
        <span>กำลังโหลดโมเดล…</span>
      </div>
    )

  if (phase === 'missing')
    return (
      <div className="model-box loading">
        <CloudOff size={18} className="ic-faint" />
        <span>ยังแสดงโมเดลไม่ได้ตอนนี้ — ต้องต่อเน็ตดูครั้งแรกหนึ่งครั้ง แล้วดูซ้ำได้แม้ไม่มีสัญญาณ</span>
      </div>
    )

  return (
    <>
      <div className="model-box">
        <model-viewer
          src={MODEL_SRC}
          alt={`โมเดลโค 3 มิติ ประกอบทะเบียน ${label}`}
          camera-controls
          touch-action="pan-y"
          auto-rotate
          shadow-intensity="1"
          exposure="1"
        />
      </div>
      <p className="hint tiny">
        ภาพประกอบเท่านั้น ไม่ใช่รูปร่างจริงของตัวนี้ · โมเดล “Cow” โดย Asheraf (Sketchfab) สัญญาอนุญาต
        CC Attribution
      </p>
    </>
  )
}

/**
 * model-viewer เป็น custom element ไม่ใช่คอมโพเนนต์ React
 * จึงต้องประกาศชนิดให้ TypeScript รู้จักแอตทริบิวต์ที่เราใช้
 */
declare global {
  namespace React.JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        alt?: string
        'camera-controls'?: boolean
        'auto-rotate'?: boolean
        'touch-action'?: string
        'shadow-intensity'?: string
        exposure?: string
      }
    }
  }
}
