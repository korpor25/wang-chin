/** ปฏิทินงาน — งานทั้งหมดที่ระบบสร้างให้ (ค-01, ค-02) แยกตามความเร่งด่วน */
import { useEffect, useState } from 'react'
import { Card, Chips, Empty, List, Note, Skeleton, Stat, Stats } from '../components/ui'
import { TaskRow } from './Dashboard'
import { taskBuckets } from '../data/queries'
import { db } from '../data/db'
import { useAccount } from '../state/session'
import { num } from '../lib/format'
import type { Task } from '../domain/types'

type Bucket = 'overdue' | 'today' | 'soon' | 'later' | 'done'

const OPTIONS: Array<{ value: Bucket; label: string }> = [
  { value: 'overdue', label: 'เลยกำหนด' },
  { value: 'today', label: 'วันนี้' },
  { value: 'soon', label: '7 วันข้างหน้า' },
  { value: 'later', label: 'ถัดไป' },
  { value: 'done', label: 'เสร็จแล้ว' },
]

export function Tasks() {
  const { role, isAdmin } = useAccount()
  const [bucket, setBucket] = useState<Bucket>('today')
  const [data, setData] = useState<Awaited<ReturnType<typeof taskBuckets>> | null>(null)
  const [doneRows, setDoneRows] = useState<Task[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      const farmIds = role === 'farmer' ? ((await db.users.get('u_farmer'))?.farmIds ?? []) : undefined
      const [b, d] = await Promise.all([
        taskBuckets(role, farmIds, isAdmin),
        db.tasks.where('status').equals('done').reverse().limit(50).toArray(),
      ])
      if (!alive) return
      setData(b)
      setDoneRows(d.sort((x, y) => (y.doneAt ?? 0) - (x.doneAt ?? 0)))
    })()
    return () => {
      alive = false
    }
  }, [role, isAdmin, bucket])

  if (!data) return <Skeleton rows={5} />

  const rows = bucket === 'done' ? doneRows : data[bucket]

  return (
    <>
      <Card title="งานของฉัน" hint="ระบบสร้างจากเหตุการณ์และค่าพารามิเตอร์ชีววิทยา">
        <Stats>
          <Stat label="เลยกำหนด" value={num(data.overdue.length)} sub="รายการ" />
          <Stat label="วันนี้" value={num(data.today.length)} sub="รายการ" />
          <Stat label="7 วันข้างหน้า" value={num(data.soon.length)} sub="รายการ" />
        </Stats>
        <Chips value={bucket} options={OPTIONS} onChange={setBucket} />
        {data.overdue.length > 0 && bucket !== 'overdue' && (
          <Note>
            มีงานเลยกำหนด {data.overdue.length} รายการ — ถ้าเลยเกินเกณฑ์โดยไม่มีการยืนยัน
            ระบบจะยกระดับส่งต่อให้เจ้าหน้าที่สหกรณ์ติดตาม (ค-04)
          </Note>
        )}
      </Card>

      <Card title={OPTIONS.find((o) => o.value === bucket)?.label} hint={`${num(rows.length)} รายการ`}>
        {rows.length === 0 ? (
          <Empty>ไม่มีรายการในช่วงนี้</Empty>
        ) : (
          <List>
            {rows.slice(0, 100).map((k) => (
              <TaskRow key={k.localId} task={k} />
            ))}
          </List>
        )}
      </Card>
    </>
  )
}
