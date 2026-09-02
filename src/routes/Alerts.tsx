/**
 * แจ้งเตือน (ค-03) และการยกระดับ (ค-04)
 * จุดสำคัญคือแยกให้ออกว่า "ไม่ได้รับแจ้ง" / "รับแล้วไม่ทำ" / "ทำแล้วไม่ได้ผล"
 * จึงต้องเก็บทั้งเวลาส่ง เปิดอ่าน และยืนยันจะปฏิบัติ
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Card, Chips, Empty, List, Note, PageHeader, Pill, Row, Stat, Stats } from '../components/ui'
import { db } from '../data/db'
import { useAccount } from '../state/session'
import { dateTime, num, pct } from '../lib/format'
import type { Alert, Farm, User } from '../domain/types'

type View = 'inbox' | 'ack' | 'escalated' | 'all'

const OPTIONS: Array<{ value: View; label: string }> = [
  { value: 'inbox', label: 'ยังไม่ตอบรับ' },
  { value: 'ack', label: 'ยืนยันแล้ว' },
  { value: 'escalated', label: 'ถูกยกระดับ' },
  { value: 'all', label: 'ทั้งหมด' },
]

const LEVEL_TONE = { info: 'mute', warn: 'warn', critical: 'crit' } as const
const LEVEL_LABEL = { info: 'ทั่วไป', warn: 'สำคัญ', critical: 'ด่วน' } as const
const CHANNEL_LABEL = { 'in-app': 'ในแอป', line: 'LINE', sms: 'SMS' } as const

export function Alerts() {
  const { role, isAdmin } = useAccount()
  const [view, setView] = useState<View>('inbox')
  const [rows, setRows] = useState<Alert[]>([])
  const [all, setAll] = useState<Alert[]>([])

  const load = useCallback(async () => {
    const mine = await db.alerts.filter((a) => a.toRole === role || isAdmin).toArray()
    mine.sort((a, b) => b.sentAt - a.sentAt)
    setAll(mine)
    setRows(
      view === 'inbox'
        ? mine.filter((a) => !a.ackAt && !a.resolvedAt)
        : view === 'ack'
          ? mine.filter((a) => a.ackAt)
          : view === 'escalated'
            ? mine.filter((a) => a.escalatedAt)
            : mine,
    )
  }, [role, isAdmin, view])

  useEffect(() => {
    void load()
  }, [load])

  async function markRead(a: Alert) {
    if (a.readAt || !a.id) return
    await db.alerts.update(a.id, { readAt: Date.now() })
    void load()
  }

  async function ack(a: Alert) {
    if (!a.id) return
    await db.alerts.update(a.id, { readAt: a.readAt ?? Date.now(), ackAt: Date.now() })
    void load()
  }

  const sent = all.length
  const read = all.filter((a) => a.readAt).length
  const acked = all.filter((a) => a.ackAt).length

  return (
    <>
      <PageHeader title="แจ้งเตือน" sub="รายการที่ส่งถึงคุณ" />
      <Card hint="ระบบส่งล่วงหน้าตามกฎของแต่ละบทบาท">
        <Stats>
          <Stat label="ส่งแล้ว" value={num(sent)} sub="ครั้ง" />
          <Stat label="อัตราเปิดอ่าน" value={pct(read, sent)} />
          <Stat label="อัตรายืนยันจะปฏิบัติ" value={pct(acked, sent)} />
        </Stats>
        <Chips value={view} options={OPTIONS} onChange={setView} />
        <Note>
          ตัวเลขสองค่านี้ใช้แยกสาเหตุของงานที่ไม่ถูกทำ — เปิดอ่านต่ำแปลว่าช่องทางแจ้งมีปัญหา
          ส่วนเปิดอ่านสูงแต่ยืนยันต่ำแปลว่าปัญหาอยู่ที่การปฏิบัติ
        </Note>
      </Card>

      <Card title={OPTIONS.find((o) => o.value === view)?.label} hint={`${num(rows.length)} รายการ`}>
        {rows.length === 0 ? (
          <Empty>ไม่มีรายการ</Empty>
        ) : (
          <List>
            {rows.slice(0, 80).map((a) => (
              <li key={a.localId}>
                <div style={{ padding: '11px 2px', borderTop: 0 }}>
                  <div className="row-title">
                    <Pill tone={LEVEL_TONE[a.level]}>{LEVEL_LABEL[a.level]}</Pill>
                    {a.title}
                    {!a.readAt && <Pill tone="warn">ยังไม่อ่าน</Pill>}
                    {a.escalatedAt && <Pill tone="crit">ยกระดับแล้ว</Pill>}
                  </div>
                  <div className="row-sub">
                    {a.body} · ส่ง {dateTime(a.sentAt)} ทาง {CHANNEL_LABEL[a.channel]}
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    {!a.ackAt && (
                      <button className="btn ghost" onClick={() => void ack(a)}>
                        ยืนยันจะปฏิบัติ
                      </button>
                    )}
                    {!a.readAt && (
                      <button className="btn ghost" onClick={() => void markRead(a)}>
                        ทำเครื่องหมายว่าอ่านแล้ว
                      </button>
                    )}
                    {a.animalId && (
                      <Link className="btn ghost" to={`/animals/${a.animalId}`}>
                        ดูโค
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </List>
        )}
      </Card>
    </>
  )
}

/** ทะเบียนฟาร์มและสมาชิก */
export function Farms() {
  const [farms, setFarms] = useState<Farm[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    void (async () => {
      const [f, animals, u] = await Promise.all([db.farms.toArray(), db.animals.toArray(), db.users.toArray()])
      setFarms(f)
      setUsers(u)
      const c: Record<string, number> = {}
      for (const a of animals) c[a.farmId] = (c[a.farmId] ?? 0) + 1
      setCounts(c)
    })()
  }, [])

  return (
    <>
      <PageHeader title="ฟาร์มและสมาชิก" />
      <Card title="ฟาร์มสมาชิก" hint={`${num(farms.length)} แห่ง`}>
        <List>
          {farms.map((f) => (
            <Row
              key={f.id}
              to={`/animals?farm=${f.id}`}
              badge={<span className="code">{f.code}</span>}
              title={f.name}
              sub={`${f.owner} · ${f.village} ต.${f.subdistrict} · ${f.phone}`}
              side={`${num(counts[f.id] ?? 0)} ตัว`}
            />
          ))}
        </List>
      </Card>

      <Card title="ผู้ใช้ระบบ" hint={`${users.length} บัญชี`}>
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>บทบาท</th>
                <th>โทรศัพท์</th>
                <th>ฟาร์มที่ดูแล</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.role}</td>
                  <td className="num">{u.phone}</td>
                  <td className="num">{u.farmIds.length || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
