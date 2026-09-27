/** หน้ารวมเมนูที่เหลือ — แถบล่างมีได้แค่ 5 ช่อง ที่เหลือมาอยู่ตรงนี้ */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  Bell,
  Boxes,
  ClipboardList,
  RefreshCw,
  Settings as SettingsIcon,
} from 'lucide-react'
import { Card, Pill } from '../components/ui'
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
  { to: '/assign', label: 'มอบหมายงาน', sub: 'ระบุผู้รับผิดชอบและสร้างงาน', Icon: ClipboardList, roles: ['coop'] },
  { to: '/alerts', label: 'แจ้งเตือนและกิจกรรมสหกรณ์', sub: 'แจ้งเตือนและประกาศของสหกรณ์', Icon: Bell, roles: null },
  { to: '/inventory', label: 'คลังน้ำเชื้อ', sub: 'ยอดคงเหลือรายล็อต', Icon: Boxes, roles: ['coop', 'husbandry'] },
  { to: '/sync', label: 'ศูนย์ซิงค์', sub: 'รายการค้างส่ง', Icon: RefreshCw, roles: null },
  { to: '/settings', label: 'ตั้งค่า', sub: 'พารามิเตอร์ นำเข้าข้อมูล', Icon: SettingsIcon, roles: ['coop'], needsAdmin: true },
]

export function More() {
  const { userId, role, readOnly, isAdmin } = useAccount()
  const [snap, setSnap] = useState<SyncSnapshot | null>(null)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    void syncSnapshot().then(setSnap)
    void db.alerts
      .filter(
        (a) =>
          a.toRole === role &&
          (!a.toUser || a.toUser === userId) &&
          a.readAt === null &&
          a.resolvedAt === null,
      )
      .count()
      .then(setUnread)
  }, [userId, role])

  const visible = ENTRIES.filter(
    (e) => (!e.roles || e.roles.includes(role)) && (!e.needsAdmin || isAdmin),
  )
  const pending = (snap?.outbox ?? 0) + (snap?.conflict ?? 0)

  return (
    <>
      <Card
        title="เพิ่มเติม"
        hint={`${ROLE_LABEL[role]}${readOnly ? ' · ดูได้อย่างเดียว' : ''}${isAdmin ? ' · ผู้ดูแลระบบ' : ''}`}
      >
        {visible.map(({ to, label, sub, Icon }) => {
          const badge =
            to === '/sync' && pending > 0
              ? { tone: 'warn' as const, text: `ค้างส่ง ${num(pending)}` }
              : to === '/alerts' && unread > 0
                ? { tone: 'crit' as const, text: `ใหม่ ${num(unread)}` }
                : null
          return (
            <div className="lot" key={to}>
              <div className="lot-head left">
                <span className="tile-icon">
                  <Icon size={18} />
                </span>
                <span className="lot-left">{label}</span>
                {badge && (
                  <span className="beast-bcs">
                    <Pill tone={badge.tone}>{badge.text}</Pill>
                  </span>
                )}
              </div>
              <div className="lot-meta">{sub}</div>
              <div className="row snug">
                <Link className="btn ghost" to={to}>
                  เปิด <span className="go">→</span>
                </Link>
              </div>
            </div>
          )
        })}
      </Card>
    </>
  )
}
