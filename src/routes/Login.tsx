/** หน้าเข้าสู่ระบบ — เลือกบัญชีที่จะใช้งานบนอุปกรณ์นี้ */
import { ChevronRight } from 'lucide-react'
import { ACCOUNTS, useSession } from '../state/session'
import { ROLE_LABEL } from '../domain/types'

const INITIALS = (name: string) => name.trim().charAt(0)

export function Login() {
  const signIn = useSession((s) => s.signIn)

  return (
    <div className="login">
      <div className="login-brand">
        <img src="/pwa-192.png" alt="" />
        <h1>วังชิ้นฟาร์ม</h1>
        <p>ระบบสนับสนุนการผสมเทียมโคขุน สหกรณ์วังชิ้น จ.แพร่</p>
      </div>

      <ul className="login-list">
        {ACCOUNTS.map((a) => (
          <li key={a.userId}>
            <button onClick={() => signIn(a.userId)}>
              <span className="avatar" style={{ margin: 0 }} aria-hidden="true">
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
              <ChevronRight size={18} style={{ color: 'var(--faint)', flex: 'none' }} />
            </button>
          </li>
        ))}
      </ul>

      <p className="login-foot">
        ใช้งานได้แม้ไม่มีสัญญาณ ข้อมูลที่บันทึกจะถูกส่งขึ้นระบบให้อัตโนมัติเมื่อกลับมาออนไลน์
      </p>
    </div>
  )
}
