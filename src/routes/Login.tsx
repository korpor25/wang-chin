/**
 * หน้าเข้าสู่ระบบ — ยืนยันตัวตนจริงด้วยเบอร์โทร + รหัสผ่านผ่าน API (/auth/login)
 *
 * ปุ่มบัญชีสำหรับนำเสนอเปิดได้ในโหมดพัฒนา หรือ production ที่ตั้งค่าไว้โดยชัดเจน
 */
import { useEffect, useState } from 'react'
import { ChevronRight, LogIn } from 'lucide-react'
import {
  DEMO_ACCOUNTS,
  DEMO_LOGIN_ENABLED,
  DEMO_LOGIN_USES_API,
  useSession,
} from '../state/session'
import { ROLE_LABEL } from '../domain/types'
import { db } from '../data/db'
import { computeKpis } from '../data/queries'
import { num } from '../lib/format'

const INITIALS = (name: string) => name.trim().charAt(0)

export function Login() {
  const signIn = useSession((s) => s.signIn)
  const loading = useSession((s) => s.loading)
  const error = useSession((s) => s.error)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    await signIn(phone, password)
  }

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
        <p className="hint">กรอกเบอร์โทรและรหัสผ่านที่ได้รับจากสหกรณ์</p>

        <form className="login-form" onSubmit={submit}>
          <label className="field">
            <span>เบอร์โทรศัพท์</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="username"
              placeholder="0810000000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="field">
            <span>รหัสผ่าน</span>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && (
            <p className="login-error" style={{ color: '#dc2626', fontSize: 'var(--fs-xs)', margin: '2px 0 0' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn full"
            style={{ marginTop: 'var(--sp-3)' }}
            disabled={loading || !phone || !password}
          >
            <LogIn size={18} />
            {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        {DEMO_LOGIN_ENABLED && (
          <>
            <p className="hint" style={{ marginTop: 18 }}>
              {DEMO_LOGIN_USES_API
                ? 'บัญชีสำหรับนำเสนอ · เข้าระบบจริง · ข้อมูลล็อกอินนี้ผู้เข้าชมทุกคนมองเห็นได้'
                : 'บัญชีสาธิตในเครื่อง (ไม่เชื่อมระบบจริง · รหัส 123456)'}
            </p>
            <ul className="login-list">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.phone}>
                  <button onClick={() => void signIn(a.phone, a.password)} disabled={loading}>
                    <span className="avatar flush" aria-hidden="true">
                      {INITIALS(a.name)}
                    </span>
                    <span className="who">
                      <b>{a.name}</b>
                      <span>
                        {ROLE_LABEL[a.role]}
                        {a.readOnly && ' · ดูอย่างเดียว'}
                        {a.isAdmin && ' · ผู้ดูแลระบบ'} · {a.phone}
                        {DEMO_LOGIN_USES_API && ` · รหัส ${a.password}`}
                      </span>
                    </span>
                    <ChevronRight size={18} className="ic-faint" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="login-foot">
        ใช้งานได้แม้ไม่มีสัญญาณ ข้อมูลที่บันทึกจะถูกส่งขึ้นระบบให้อัตโนมัติเมื่อกลับมาออนไลน์
      </p>
    </div>
  )
}
