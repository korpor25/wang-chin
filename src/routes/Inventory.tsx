/**
 * คลังน้ำเชื้อ — อ่านอย่างเดียวในเฟสนี้
 *
 * เฟสนี้ทำเฉพาะกิจกรรมภาค ก คลังจึงมีเท่าที่ ก-08 ต้องใช้ คือรายการล็อตที่เลือกได้
 * และยอดคงเหลือที่ระบบตัดให้เองตอนบันทึกการผสม ส่วนงานรับเข้า ตรวจคุณภาพ
 * ถังไนโตรเจน และอาหารสัตว์ เป็นภาค ข ที่ยกไปเฟสถัดไป
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Card, Note, PageHeader, Pill, Stat, Stats } from '../components/ui'
import { db } from '../data/db'
import { getParams } from '../data/queries'
import { semenTone } from '../domain/rules'
import { num } from '../lib/format'
import type { BioParams, SemenBatch } from '../domain/types'

const STATUS_TONE = { ok: 'ok', watch: 'warn', rejected: 'crit', expired: 'crit' } as const
const STATUS_LABEL = { ok: 'ใช้ได้', watch: 'เฝ้าระวัง', rejected: 'ห้ามใช้', expired: 'หมดอายุ' } as const

const dayShort = (ts: number) =>
  new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

export function Inventory() {
  const [semen, setSemen] = useState<SemenBatch[]>([])
  const [params, setParams] = useState<BioParams | null>(null)

  useEffect(() => {
    void (async () => {
      const [s, p] = await Promise.all([db.semen.toArray(), getParams()])
      setSemen(s.sort((a, b) => a.lotNo.localeCompare(b.lotNo)))
      setParams(p)
    })()
  }, [])

  const strawsLeft = semen.reduce((s, b) => s + (b.strawsIn - b.strawsUsed), 0)
  const tone = (b: SemenBatch) => (params ? semenTone(b.strawsIn - b.strawsUsed, params) : 'ok')
  const lowLots = semen.filter((b) => tone(b) !== 'ok').length
  const critLots = semen.filter((b) => tone(b) === 'crit').length

  return (
    <>
      <PageHeader title="คลังน้ำเชื้อ" sub="อ่านอย่างเดียว · ตัดสต๊อกอัตโนมัติเมื่อบันทึกการผสม" />

      <Card title="สรุปสต๊อกน้ำเชื้อ">
        <Stats>
          <Stat label="หลอดคงเหลือ" value={num(strawsLeft)} sub="หลอด" />
          <Stat label="จำนวนล็อต" value={num(semen.length)} sub="ล็อต" />
          <Stat label="ต้องเฝ้าระวัง" value={num(lowLots)} sub={`ล็อต · วิกฤต ${num(critLots)}`} />
        </Stats>
        {params && (
          <Note>
            รหัสสีตามจำนวนคงเหลือ — <b className="t-ok">เขียว</b> มากกว่า{' '}
            {params.semenWarnStraws} หลอด · <b className="t-warn">ส้ม</b> ตั้งแต่{' '}
            {params.semenWarnStraws} หลอดลงมา · <b className="t-crit">แดง</b> ตั้งแต่{' '}
            {params.semenCritStraws} หลอดลงมา · ปรับเกณฑ์ได้ที่หน้าตั้งค่า
            (ตัวเลขชุดนี้ยังรอที่ประชุมยืนยัน)
          </Note>
        )}
      </Card>

      <Card title="รายการล็อต" hint={`${num(semen.length)} ล็อต · ข้อมูลมาจากการนำเข้า`}>
        {semen.map((b) => {
          const left = b.strawsIn - b.strawsUsed
          const t = tone(b)
          const usable = b.status !== 'rejected' && b.status !== 'expired' && left > 0
          return (
            <div className="lot" key={b.id}>
              <div className="lot-head">
                <Pill tone={STATUS_TONE[b.status]}>{STATUS_LABEL[b.status]}</Pill>
                <span className="lot-left">
                  คงเหลือ <b className={`t-${t}`}>{left}</b> หลอด
                </span>
              </div>
              <div className="lot-name">
                {b.sireName} ({b.lotNo})
              </div>
              <div className="lot-meta">
                {b.breed} · เคลื่อนที่ล่าสุด {b.motilityLast !== null ? `${b.motilityLast}%` : '—'}
                {b.motilityLast !== null && b.motilityLast < 40 && <span className="t-crit"> ↓</span>} ·
                เก็บที่ {b.tankId} {b.canister} · หมดอายุ {dayShort(b.expiresAt)}
              </div>
              {usable ? (
                <div className="row">
                  <Link
                    className={`btn ${t === 'ok' ? '' : t}`.trim()}
                    to={`/record/${encodeURIComponent('ก-08')}`}
                  >
                    ใช้ล็อตนี้ผสมเทียม <span className="go">→</span>
                  </Link>
                </div>
              ) : (
                <Note>ล็อตนี้เลือกใช้ในการผสมไม่ได้ — ระบบซ่อนออกจากตัวเลือกให้อัตโนมัติ</Note>
              )}
            </div>
          )
        })}
      </Card>
    </>
  )
}
