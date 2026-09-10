/**
 * หน้าเข้าสู่ระบบ
 *
 * ดีไซน์วางไว้เป็นเบอร์โทร + รหัสผ่าน แต่ระบบยังไม่มี auth จริง (P0 ข้อ 8 · Q7 เรื่อง OTP ยังไม่สรุป)
 * หน้านี้จึงทำหัวและกรอบตามดีไซน์ไว้ก่อน แล้วให้เลือกบัญชีในเครื่องแทนช่องกรอก
 * เมื่อผูก auth จริงแล้วเปลี่ยนเฉพาะส่วนในกรอบ ไม่ต้องรื้อหน้า
 */
import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ACCOUNTS, useSession } from '../state/session'
import { ROLE_LABEL } from '../domain/types'
import { db } from '../data/db'
import { computeKpis } from '../data/queries'
import { num } from '../lib/format'

const INITIALS = (name: string) => name.trim().charAt(0)

export function Login() {
  const signIn = useSession((s) => s.signIn)
  const [stats, setStats] = useState<{ animals: number; farms: number; concept: number } | null>(null)

  // ตัวเลขบนหัวหน้าจอมาจากข้อมูลจริงในเครื่อง ไม่ใช่เลขตัวอย่างที่ตายตัว
  useEffect(() => {
    void (async () => {
      const [animals, farms, kpis] = await Promise.all([
        db.animals.count(),
        db.farms.count(),
        computeKpis(),
      ])
      setStats({
        animals,
        farms,
        concept: kpis.find((k) => k.label === 'อัตราการผสมติด')?.value ?? 0,
      })
    })()
  }, [])

  return (
    <div className="login">
      <div className="slab">
        <span className="slab-chip">สหกรณ์การเกษตรวังชิ้น จำกัด</span>
        <h1>ระบบสนับสนุนการผสมเทียมและจัดการฝูงโค</h1>
        <p>ติดตามสุขภาพ ประเมิน BCS และคุมคลังน้ำเชื้อ — ใช้งานได้แม้ไม่มีสัญญาณ</p>
        {stats && (
          <div className="slab-stats">
            <div className="slab-stat">
              <b>{num(stats.animals)}</b>
              <span>โคในระบบ</span>
            </div>
            <div className="slab-stat">
              <b>{stats.concept}%</b>
              <span>อัตราผสมติด</span>
            </div>
            <div className="slab-stat">
              <b>{num(stats.farms)}</b>
              <span>ฟาร์มสมาชิก</span>
            </div>
          </div>
        )}
      </div>

      <section className="card">
        <span className="login-chip">เข้าสู่ระบบใช้งาน</span>
        <h2>ยินดีต้อนรับกลับสู่ระบบ</h2>
        <p className="hint">เลือกบัญชีที่จะใช้บนอุปกรณ์นี้ — ระบบยังไม่ได้ผูกกับการยืนยันตัวตนจริง</p>

        <ul className="login-list">
          {ACCOUNTS.map((a) => (
            <li key={a.userId}>
              <button onClick={() => signIn(a.userId)}>
                <span className="avatar flush" aria-hidden="true">
                  {INITIALS(a.name)}
                </span>
                <span className="who">
                  <b>{a.name}</b>
                  <span>
                    {ROLE_LABEL[a.role]}
                    {a.readOnly && ' · ดูอย่างเดียว'}
                    {a.isAdmin && ' · ผู้ดูแลระบบ'} · {a.phone}
                  </span>
                </span>
                <ChevronRight size={18} className="ic-faint" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="login-foot">
        ใช้งานได้แม้ไม่มีสัญญาณ ข้อมูลที่บันทึกจะถูกส่งขึ้นระบบให้อัตโนมัติเมื่อกลับมาออนไลน์
      </p>
    </div>
  )
}
