/**
 * ไอคอนประจำกิจกรรมภาค ก
 *
 * แยกจากแคตตาล็อกใน domain เพราะเป็นเรื่องของหน้าจอล้วน ๆ
 * แคตตาล็อกไม่ควรต้องรู้จักไลบรารีไอคอน
 */
import {
  Baby,
  ChartNoAxesColumn,
  ClipboardCheck,
  Droplet,
  Eye,
  Fence,
  HeartPulse,
  Megaphone,
  Scan,
  Stethoscope,
  Syringe,
} from 'lucide-react'

export type IconType = typeof Baby

const BY_CODE: Record<string, IconType> = {
  'ก-01': Megaphone, // แจ้งการคลอด
  'ก-02': Baby, // ทำคลอด
  'ก-03': ChartNoAxesColumn, // ให้คะแนน BCS
  'ก-04': Stethoscope, // ตรวจอวัยวะสืบพันธุ์
  'ก-05': ClipboardCheck, // ตรวจความพร้อม
  'ก-06': Syringe, // โปรแกรมเหนี่ยวนำ
  'ก-07': Eye, // ตรวจและแจ้งอาการเป็นสัด
  'ก-08': Droplet, // ผสมเทียม
  'ก-09': Scan, // ตรวจครรภ์
  'ก-10': HeartPulse, // ตรวจโรคและรักษา
  'ก-11': Fence, // เตรียมคอกคลอด
}

export function activityIcon(code: string): IconType {
  return BY_CODE[code] ?? ClipboardCheck
}
