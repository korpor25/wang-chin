/** รายงานและตัวชี้วัด (ค-06) พร้อมการทบทวนหาสาเหตุ (ง-01) */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Card, Empty, KpiCard, List, Note, PageHeader, Pill, Row, Spark } from '../components/ui'
import { computeKpis, heatStress } from '../data/queries'
import { heatStressLevel } from '../domain/rules'
import { db } from '../data/db'
import { CYCLE_LABEL, type CycleStage, type Kpi } from '../domain/types'
import { dateTime, num, pct } from '../lib/format'
import type { ActivityRecord } from '../domain/types'

const LOWER_IS_BETTER = new Set(['ครั้งผสมต่อการติด', 'ระยะห่างการให้ลูก'])

const dayShort = (ts: number) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

export function Reports() {
  const [kpis, setKpis] = useState<Kpi[]>([])
  const [stages, setStages] = useState<Array<[CycleStage, number]>>([])
  const [reviews, setReviews] = useState<ActivityRecord[]>([])
  const [byFarm, setByFarm] = useState<Array<{ name: string; total: number; pregnant: number }>>([])

  useEffect(() => {
    void (async () => {
      const [k, animals, farms, revs] = await Promise.all([
        computeKpis(),
        db.animals.toArray(),
        db.farms.toArray(),
        db.records.where('activityCode').equals('ง-01').toArray(),
      ])
      setKpis(k)
      setReviews(revs.sort((a, b) => b.occurredAt - a.occurredAt))

      const counts = new Map<CycleStage, number>()
      for (const a of animals) counts.set(a.stage, (counts.get(a.stage) ?? 0) + 1)
      setStages([...counts.entries()].sort((a, b) => b[1] - a[1]))

      const fname = new Map(farms.map((f) => [f.id, f.name]))
      const agg = new Map<string, { total: number; pregnant: number }>()
      for (const a of animals) {
        const row = agg.get(a.farmId) ?? { total: 0, pregnant: 0 }
        row.total++
        if (a.stage === 'pregnant' || a.stage === 'dry') row.pregnant++
        agg.set(a.farmId, row)
      }
      setByFarm(
        [...agg.entries()]
          .map(([id, v]) => ({ name: fname.get(id) ?? id, ...v }))
          .sort((a, b) => b.pregnant / b.total - a.pregnant / a.total),
      )
    })()
  }, [])

  const thi = heatStress(14)
  const totalAnimals = stages.reduce((s, [, n]) => s + n, 0)

  return (
    <>
      <PageHeader title="รายงานและตัวชี้วัด" />
      <Card title="ตัวชี้วัดด้านการสืบพันธุ์" hint="คำนวณใหม่ทุกครั้งที่มีข้อมูลเข้า">
        {kpis.length === 0 ? (
          <Empty>กำลังคำนวณ…</Empty>
        ) : (
          <div className="stats">
            {kpis.map((k) => (
              <KpiCard
                key={k.label}
                label={k.label}
                value={k.value}
                unit={k.unit}
                target={k.target}
                hint={k.hint}
                higherIsBetter={!LOWER_IS_BETTER.has(k.label)}
              />
            ))}
          </div>
        )}
      </Card>

      <Card title="โครงสร้างฝูง" hint={`${num(totalAnimals)} ตัว`}>
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>ระยะของวงจร</th>
                <th>จำนวน</th>
                <th>สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {stages.map(([s, n]) => (
                <tr key={s}>
                  <td>{CYCLE_LABEL[s]}</td>
                  <td className="num">{num(n)}</td>
                  <td className="num">{pct(n, totalAnimals)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="ความเครียดจากความร้อน 14 วัน" hint="ใช้เลือกช่วงที่ไม่ควรวางแผนผสมจำนวนมาก">
        <Spark
          values={thi.map((d) => d.thi)}
          tones={thi.map((d) => heatStressLevel(d.thi).tone)}
          labels={thi.map((d) => `${dayShort(d.at)} THI ${d.thi}`)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--faint)' }}>
          <span>{dayShort(thi[0].at)}</span>
          <span>{dayShort(thi[thi.length - 1].at)}</span>
        </div>
        <Note>
          วันที่ THI เกิน 79 ควรเลี่ยงการผสม — ระบบเก็บค่านี้คู่กับทุกการผสมไว้แล้ว
          จึงวิเคราะห์ย้อนหลังได้ว่าอากาศมีผลแค่ไหน
        </Note>
      </Card>

      <Card title="จัดอันดับรายฟาร์ม" hint="เรียงตามสัดส่วนแม่โคที่ตั้งท้อง">
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>ฟาร์ม</th>
                <th>แม่โค</th>
                <th>ตั้งท้อง</th>
                <th>สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {byFarm.slice(0, 15).map((f) => (
                <tr key={f.name}>
                  <td>{f.name}</td>
                  <td className="num">{num(f.total)}</td>
                  <td className="num">{num(f.pregnant)}</td>
                  <td className="num">{pct(f.pregnant, f.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="การทบทวนและมติที่ประชุม"
        hint="ง-01 · เก็บสาเหตุกับมาตรการไว้เทียบผลภายหลัง"
        action={
          <Link to={`/record/${encodeURIComponent('ง-01')}`} style={{ fontSize: 13, color: 'var(--brand)' }}>
            บันทึกใหม่
          </Link>
        }
      >
        {reviews.length === 0 ? (
          <Empty>ยังไม่มีบันทึกการทบทวน</Empty>
        ) : (
          <List>
            {reviews.map((r) => (
              <Row
                key={r.localId}
                badge={<Pill tone="mute">ง-01</Pill>}
                title={String(r.payload.conclusion ?? 'บันทึกการประชุม')}
                sub={`${dateTime(r.occurredAt)} · ${String(r.payload.rootCause ?? '')}`}
              />
            ))}
          </List>
        )}
      </Card>
    </>
  )
}
