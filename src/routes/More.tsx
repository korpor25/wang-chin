/** หน้ารวมเมนูที่เหลือ — แถบล่างมีได้แค่ 5 ช่อง ที่เหลือมาอยู่ตรงนี้ */
import { useEffect, useState } from 'react'
import {
  Bell,
  Boxes,
  ChartNoAxesColumn,
  RefreshCw,
  Settings as SettingsIcon,
  Users,
} from 'lucide-react'
import { Card, List, Note, Pill, Row } from '../components/ui'
import { syncSnapshot, type SyncSnapshot } from '../data/sync'
import { db } from '../data/db'
import { useAccount } from '../state/session'
import { ROLE_LABEL, type Role } from '../domain/types'
import { num } from '../lib/format'

interface Entry {
  to: string
  label: string
  sub: string
  Icon: typeof Bell
  /** null = ทุกบทบาทเข้าได้ */
  roles: Role[] | null
  /** ต้องมีสิทธิ์ผู้ดูแลระบบเพิ่ม */
  needsAdmin?: boolean
}

const ENTRIES: Entry[] = [
  { to: '/alerts', label: 'แจ้งเตือน', sub: 'รายการที่ส่งถึงคุณและประวัติการตอบสนอง', Icon: Bell, roles: null },
  { to: '/inventory', label: 'คลังและทรัพย์สิน', sub: 'น้ำเชื้อ ถังไนโตรเจน อาหารสัตว์ แท็ก RFID', Icon: Boxes, roles: ['coop', 'husbandry'] },
  { to: '/reports', label: 'รายงานและตัวชี้วัด', sub: 'อัตราการผสมติด แนวโน้ม และการทบทวนสาเหตุ', Icon: ChartNoAxesColumn, roles: ['coop'] },
  { to: '/sync', label: 'ศูนย์ซิงค์', sub: 'รายการค้างส่ง ความขัดแย้ง และนโยบายเก็บข้อมูล', Icon: RefreshCw, roles: null },
  { to: '/farms', label: 'ฟาร์มและสมาชิก', sub: 'ทะเบียนฟาร์ม เจ้าของ และผู้ใช้ระบบ', Icon: Users, roles: ['coop'] },
  { to: '/settings', label: 'ตั้งค่า', sub: 'ค่าพารามิเตอร์ชีววิทยา การนำเข้าข้อมูล และบันทึกการแก้ไข', Icon: SettingsIcon, roles: ['coop'], needsAdmin: true },
]

export function More() {
  const { role, readOnly, isAdmin } = useAccount()
  const [snap, setSnap] = useState<SyncSnapshot | null>(null)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    void syncSnapshot().then(setSnap)
    void db.alerts
      .filter((a) => a.toRole === role && a.readAt === null && a.resolvedAt === null)
      .count()
      .then(setUnread)
  }, [role])

  const visible = ENTRIES.filter(
    (e) => (!e.roles || e.roles.includes(role)) && (!e.needsAdmin || isAdmin),
  )
  const pending = (snap?.pending ?? 0) + (snap?.failed ?? 0) + (snap?.conflict ?? 0)

  return (
    <>
      <Card
        title="เพิ่มเติม"
        hint={`${ROLE_LABEL[role]}${readOnly ? ' · ดูได้อย่างเดียว' : ''}${isAdmin ? ' · ผู้ดูแลระบบ' : ''}`}
      >
        <List>
          {visible.map(({ to, label, sub, Icon }) => (
            <Row
              key={to}
              to={to}
              badge={<Icon size={17} style={{ color: 'var(--brand)', flex: 'none' }} />}
              title={label}
              sub={sub}
              side={
                to === '/sync' && pending > 0 ? (
                  <Pill tone="warn">{num(pending)}</Pill>
                ) : to === '/alerts' && unread > 0 ? (
                  <Pill tone="crit">{num(unread)}</Pill>
                ) : undefined
              }
            />
          ))}
        </List>
      </Card>

      <Card title="เกี่ยวกับระบบนี้">
        <Note>
          ระบบสนับสนุนการผสมเทียมโคขุน สหกรณ์วังชิ้น จ.แพร่ · ใช้งานได้แม้ไม่มีสัญญาณ
          บันทึกทุกอย่างลงเครื่องก่อน แล้วส่งขึ้นระบบให้อัตโนมัติเมื่อกลับมาออนไลน์
        </Note>
      </Card>
    </>
  )
}
