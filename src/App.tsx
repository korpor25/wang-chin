/**
 * วังชิ้นฟาร์ม — ระบบสนับสนุนการผสมเทียมโคขุน สหกรณ์วังชิ้น
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
import { Alerts, Farms } from './routes/Alerts'
import { Inventory } from './routes/Inventory'
import { Reports } from './routes/Reports'
import { SyncCenter } from './routes/SyncCenter'
import { Settings } from './routes/Settings'
import { Login } from './routes/Login'
import { NotFound } from './routes/NotFound'

import { seedIfEmpty } from './data/seed'
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

export default function App() {
  const [dataReady, setDataReady] = useState(false)
  const account = useSession((s) => s.account)
  const sessionReady = useSession((s) => s.ready)
  const restore = useSession((s) => s.restore)

  useEffect(() => {
    restore()
    void seedIfEmpty().finally(() => setDataReady(true))
  }, [restore])

  if (!dataReady || !sessionReady)
    return (
      <div className="shell-body" style={{ paddingTop: 24 }}>
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
              <Require roles={['coop']}>
                <Farms />
              </Require>
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
              <Require roles={['coop']}>
                <Reports />
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
