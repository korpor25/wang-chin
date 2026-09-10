/**
 * ระบบสนับสนุนการผสมเทียมโคขุน สหกรณ์การเกษตรวังชิ้น จำกัด
 * ทำงานแบบออฟไลน์ก่อนเสมอ: บันทึกลงเครื่องทันที แล้วส่งขึ้นระบบเมื่อมีสัญญาณ
 */
import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { Dashboard } from './routes/Dashboard'
import { Animals } from './routes/Animals'
import { AnimalDetail } from './routes/AnimalDetail'
import { RecordCatalog, RecordForm } from './routes/Record'
import { Tasks } from './routes/Tasks'
import { More } from './routes/More'
import { Alerts } from './routes/Alerts'
import { Inventory } from './routes/Inventory'
import { SyncCenter } from './routes/SyncCenter'
import { Settings } from './routes/Settings'
import { Assign } from './routes/Assign'
import { Login } from './routes/Login'
import { NotFound } from './routes/NotFound'

import { seedIfEmpty } from './data/seed'
import { getParams } from './data/queries'
import { runEscalation } from './data/tasks'
import { requestPersist } from './lib/storage'
import { useAccount, useSession } from './state/session'
import type { Role } from './domain/types'
import { Card, Empty, Skeleton } from './components/ui'

/**
 * กันการเข้าถึงด้วยการพิมพ์ URL ตรง ๆ — ซ่อนเมนูอย่างเดียวไม่พอ
 * เมื่อต่อ backend จริงต้องมีการตรวจสิทธิ์ซ้ำที่ฝั่งเซิร์ฟเวอร์ด้วยเสมอ
 */
function Require({
  roles,
  admin,
  children,
}: {
  roles?: Role[]
  admin?: boolean
  children: React.ReactNode
}) {
  const account = useAccount()
  const ok = (!roles || roles.includes(account.role)) && (!admin || account.isAdmin)
  if (ok) return <>{children}</>
  return (
    <Card title="ไม่มีสิทธิ์เข้าถึง">
      <Empty>บัญชีของคุณไม่ได้รับสิทธิ์ให้เปิดหน้านี้ ติดต่อเจ้าหน้าที่สหกรณ์หากต้องการเข้าถึง</Empty>
    </Card>
  )
}

/**
 * หน้าที่อยู่นอกขอบเขตเฟสนี้ — เก็บโค้ดไว้ แต่ยังไม่เปิดให้เข้า
 * เฟสนี้ทำเฉพาะภาค ก รายงาน (ค-06) และทะเบียนฟาร์ม/สมาชิก จึงยกไปพร้อมกัน
 * เปิดใช้เมื่อถึงเฟสถัดไปได้ด้วยการเปลี่ยน element กลับเป็นหน้าจริง
 */
function NextPhase({ title, why }: { title: string; why: string }) {
  return (
    <Card title={title}>
      <Empty>{why}</Empty>
    </Card>
  )
}

export default function App() {
  const [dataReady, setDataReady] = useState(false)
  const account = useSession((s) => s.account)
  const sessionReady = useSession((s) => s.ready)
  const restore = useSession((s) => s.restore)

  useEffect(() => {
    restore()
    void seedIfEmpty().finally(() => setDataReady(true))
    // OFF-08 — ขอสิทธิ์เก็บข้อมูลถาวรตั้งแต่เปิดแอป ไม่งั้นงานภาคสนามยังอยู่ในสถานะ
    // best-effort ที่ระบบลบทิ้งได้เองเมื่อพื้นที่ใกล้เต็ม
    void requestPersist().catch(() => undefined)
  }, [restore])

  /**
   * ตัวรันของ ค-04 — งานที่เลยกำหนดต้องถูกยกระดับจริง ไม่ใช่มีแต่สถานะรออยู่เฉย ๆ
   * รันตอนเปิดแอปและทุก 15 นาทีระหว่างเปิดค้างไว้ ทำงานได้แม้ออฟไลน์เพราะคำนวณจากในเครื่อง
   */
  useEffect(() => {
    if (!dataReady || !account) return
    let alive = true
    const tick = async () => {
      const params = await getParams()
      if (alive) await runEscalation(params)
    }
    void tick()
    const id = setInterval(() => void tick(), 15 * 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [dataReady, account])

  if (!dataReady || !sessionReady)
    return (
      <div className="shell-body boot">
        <Skeleton rows={4} />
        <Skeleton rows={3} />
      </div>
    )

  if (!account) return <Login />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="animals" element={<Animals />} />
          <Route path="animals/:id" element={<AnimalDetail />} />
          <Route path="record" element={<RecordCatalog />} />
          <Route path="record/:code" element={<RecordForm />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="more" element={<More />} />
          <Route path="alerts" element={<Alerts />} />
          <Route
            path="farms"
            element={
              <NextPhase
                title="ฟาร์มและสมาชิก"
                why="เฟสนี้ทำเฉพาะกิจกรรมภาค ก · ทะเบียนฟาร์มและผู้ใช้มาจากการนำเข้าข้อมูล ยังไม่มีหน้าจัดการในเฟสนี้"
              />
            }
          />
          <Route
            path="inventory"
            element={
              <Require roles={['coop', 'husbandry']}>
                <Inventory />
              </Require>
            }
          />
          <Route
            path="reports"
            element={
              <NextPhase
                title="รายงานและตัวชี้วัด"
                why="รายงานคือกิจกรรม ค-06 ซึ่งยกไปเฟสถัดไปพร้อมภาคอื่น ตัวเลขสรุปเท่าที่ภาค ก ต้องใช้อยู่บนหน้าหลักแล้ว"
              />
            }
          />
          <Route
            path="assign"
            element={
              <Require roles={['coop']}>
                <Assign />
              </Require>
            }
          />
          <Route path="sync" element={<SyncCenter />} />
          <Route
            path="settings"
            element={
              <Require roles={['coop']} admin>
                <Settings />
              </Require>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
