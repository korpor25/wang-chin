/** คลังและทรัพย์สิน — น้ำเชื้อ ถังไนโตรเจน กลุ่มอาหาร */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Card, Chips, Empty, List, Note, PageHeader, Pill, Row, Stat, Stats } from '../components/ui'
import { db } from '../data/db'
import { num } from '../lib/format'
import type { FeedGroup, SemenBatch, Tank } from '../domain/types'

type Tab = 'semen' | 'tanks' | 'feed'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'semen', label: 'น้ำเชื้อ' },
  { value: 'tanks', label: 'ถังไนโตรเจน' },
  { value: 'feed', label: 'อาหารสัตว์' },
]

const STATUS_TONE = { ok: 'ok', watch: 'warn', rejected: 'crit', expired: 'crit' } as const
const STATUS_LABEL = { ok: 'ใช้ได้', watch: 'เฝ้าระวัง', rejected: 'ห้ามใช้', expired: 'หมดอายุ' } as const

const dayShort = (ts: number) =>
  new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export function Inventory() {
  const [tab, setTab] = useState<Tab>('semen')
  const [semen, setSemen] = useState<SemenBatch[]>([])
  const [tanks, setTanks] = useState<Tank[]>([])
  const [feed, setFeed] = useState<FeedGroup[]>([])
  const [animalsPerGroup, setAnimalsPerGroup] = useState<Record<string, number>>({})

  useEffect(() => {
    void (async () => {
      const [s, t, f, animals] = await Promise.all([
        db.semen.toArray(),
        db.tanks.toArray(),
        db.feedGroups.toArray(),
        db.animals.toArray(),
      ])
      setSemen(s.sort((a, b) => a.lotNo.localeCompare(b.lotNo)))
      setTanks(t)
      setFeed(f)
      const c: Record<string, number> = {}
      for (const a of animals) if (a.feedGroupId) c[a.feedGroupId] = (c[a.feedGroupId] ?? 0) + 1
      setAnimalsPerGroup(c)
    })()
  }, [])

  const strawsLeft = semen.reduce((s, b) => s + (b.strawsIn - b.strawsUsed), 0)
  const lowLots = semen.filter((b) => b.strawsIn - b.strawsUsed <= 10).length

  return (
    <>
      <PageHeader title="คลังและทรัพย์สิน" />
      <Card>
        <Chips value={tab} options={TABS} onChange={setTab} />
      </Card>

      {tab === 'semen' && (
        <>
          <Card title="สรุปสต๊อกน้ำเชื้อ">
            <Stats>
              <Stat label="หลอดคงเหลือ" value={num(strawsLeft)} sub="หลอด" />
              <Stat label="จำนวนล็อต" value={num(semen.length)} sub="ล็อต" />
              <Stat label="ล็อตใกล้หมด" value={num(lowLots)} sub="ล็อต" />
            </Stats>
            <div className="row">
              <Link className="btn" to={`/record/${encodeURIComponent('ข-01')}`}>
                รับน้ำเชื้อเข้าคลัง
              </Link>
              <Link className="btn ghost" to={`/record/${encodeURIComponent('ข-02')}`}>
                ตรวจคุณภาพ
              </Link>
            </div>
          </Card>

          <Card title="รายการล็อต">
            <div className="tablewrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>ล็อต</th>
                    <th>พ่อพันธุ์</th>
                    <th>คงเหลือ</th>
                    <th>เคลื่อนที่ล่าสุด</th>
                    <th>ตรวจถัดไป</th>
                    <th>ตำแหน่ง</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {semen.map((b) => {
                    const left = b.strawsIn - b.strawsUsed
                    return (
                      <tr key={b.id}>
                        <td>{b.lotNo}</td>
                        <td>
                          {b.sireName}
                          <br />
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{b.breed}</span>
                        </td>
                        <td className="num">
                          {left} / {b.strawsIn}
                        </td>
                        <td className="num">
                          {b.motilityLast !== null ? `${b.motilityLast}%` : '—'}
                          {b.motilityLast !== null && b.motilityLast < 40 && (
                            <span style={{ color: 'var(--crit)' }}> ↓</span>
                          )}
                        </td>
                        <td className="num">{b.nextQcAt ? dayShort(b.nextQcAt) : '—'}</td>
                        <td>
                          {b.tankId} · {b.canister}
                        </td>
                        <td>
                          <Pill tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Pill>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Note>
              ล็อตที่ตรวจแล้วได้ผล "ห้ามใช้" จะถูกซ่อนจากตัวเลือกตอนบันทึกการผสมโดยอัตโนมัติ
            </Note>
          </Card>
        </>
      )}

      {tab === 'tanks' && (
        <Card title="ถังไนโตรเจนเหลว" hint="อัตราการระเหยผิดปกติคือสัญญาณว่าถังกำลังจะเสีย">
          <List>
            {tanks.map((t) => (
              <Row
                key={t.id}
                to={`/record/${encodeURIComponent('ข-03')}`}
                badge={
                  <Pill tone={t.status === 'critical' ? 'crit' : t.status === 'watch' ? 'warn' : 'ok'}>
                    {t.levelCm} ซม.
                  </Pill>
                }
                title={`${t.code} · ${t.location}`}
                sub={`ระเหย ${t.evaporationCmPerWeek} ซม./สัปดาห์ · เติมล่าสุด ${dayShort(t.lastFilledAt)} · ตรวจล่าสุด ${dayShort(t.lastCheckAt)}`}
                side={`${t.capacityL} ล.`}
              />
            ))}
          </List>
          {tanks.some((t) => t.status === 'critical') && (
            <Note>
              มีถังที่ระดับต่ำวิกฤต — ถ้าปล่อยจนแห้ง น้ำเชื้อทั้งถังเสียหายทันที
              ระบบยกระดับเป็นงานด่วนให้เจ้าหน้าที่แล้ว
            </Note>
          )}
        </Card>
      )}

      {tab === 'feed' && (
        <>
          <Card title="กลุ่มโคและสูตรอาหาร" hint="ใช้ย้อนกลับว่าโคตัวใดได้รับสูตรใดในช่วงใด">
            <List>
              {feed.map((g) => (
                <Row
                  key={g.id}
                  to={`/record/${encodeURIComponent('ข-04')}`}
                  title={g.name}
                  sub={`${g.formula} · ${g.kgPerHeadPerDay} กก./ตัว/วัน · ${g.supplements}`}
                  side={`${num(animalsPerGroup[g.id] ?? 0)} ตัว`}
                />
              ))}
            </List>
          </Card>
          <Card title="การสุ่มตรวจวัตถุดิบ">
            <Empty>ยังไม่มีผลตรวจในระบบ</Empty>
            <div className="row">
              <Link className="btn ghost" to={`/record/${encodeURIComponent('ข-05')}`}>
                บันทึกผลสุ่มตรวจ
              </Link>
            </div>
            <Note>
              สารพิษจากเชื้อรากดการสืบพันธุ์โดยตรง ระบบจึงผูกล็อตวัตถุดิบกับกลุ่มโคที่ได้รับ
              เพื่อให้ตอนวิเคราะห์การผสมไม่ติดตามกลับได้
            </Note>
          </Card>
        </>
      )}
    </>
  )
}
