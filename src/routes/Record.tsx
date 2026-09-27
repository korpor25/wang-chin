/** แคตตาล็อกกิจกรรม — ทางเข้าเดียวสำหรับบันทึกทุกอย่าง กรองตามบทบาทผู้ใช้ */
import { Link, useParams } from 'react-router'
import { ActRow, Card, Empty, Note } from '../components/ui'
import { activityIcon } from '../components/activityIcon'
import { ActivityForm } from '../components/ActivityForm'
import {
  ACTIVITY_BY_CODE,
  GROUP_LABEL,
  PHASE_GROUPS,
  activitiesForRole,
} from '../domain/activities'
import { ROLE_LABEL } from '../domain/types'
import { useAccount } from '../state/session'

export function RecordCatalog() {
  const { role, readOnly } = useAccount()
  const mine = activitiesForRole(role)

  return (
    <>
      {readOnly && (
        <Card>
          <Note>บัญชีนี้มีสิทธิ์ดูอย่างเดียว จึงบันทึกกิจกรรมไม่ได้</Note>
        </Card>
      )}

      {PHASE_GROUPS.map((g) => {
        const items = mine.filter((a) => a.group === g)
        if (items.length === 0) return null
        return (
          <Card key={g} title={GROUP_LABEL[g]}>
            {items.map((a) => (
              <ActRow
                key={a.code}
                to={`/record/${encodeURIComponent(a.code)}`}
                Icon={activityIcon(a.code)}
                code={a.code}
                name={a.name}
                sub={a.trigger}
              />
            ))}
          </Card>
        )
      })}

      {/* เจ้าหน้าที่สหกรณ์ไม่มีกิจกรรมภาค ก ของตัวเองเลย (SEC-02) — ชี้ทางไปหน้าที่ใช่แทน */}
      {mine.length === 0 && (
        <Card title="บทบาทนี้ไม่ได้กรอกกิจกรรมภาค ก">
          <Note>เจ้าหน้าที่สหกรณ์มอบหมายและติดตามงานที่หน้ามอบหมายงาน</Note>
          <div className="row">
            <Link className="btn" to="/assign">
              ไปหน้ามอบหมายงาน <span className="go">→</span>
            </Link>
          </div>
        </Card>
      )}

    </>
  )
}

export function RecordForm() {
  const { code = '' } = useParams()
  const { role } = useAccount()
  const spec = ACTIVITY_BY_CODE.get(decodeURIComponent(code))
  if (!spec) return <Empty>ไม่พบกิจกรรมรหัสนี้</Empty>
  // กันการพิมพ์ URL ตรงไปยังกิจกรรมนอกขอบเขตเฟสนี้ ซ่อนเมนูอย่างเดียวไม่พอ
  if (!PHASE_GROUPS.includes(spec.group))
    return (
      <Card title={`${spec.code} · ${spec.name}`}>
        <Empty>
          เฟสนี้ทำเฉพาะกิจกรรมภาค ก · งานภาคสนามรายตัว กิจกรรมนี้อยู่ในกลุ่ม “{GROUP_LABEL[spec.group]}”
          ซึ่งยกไปทำในเฟสถัดไป
        </Empty>
      </Card>
    )
  /**
   * SEC-05 — กันที่ระดับ route ไม่ใช่แค่ซ่อนเมนู
   * ถึงจะพิมพ์ URL ของกิจกรรมบทบาทอื่นเข้ามาตรง ๆ ก็เปิดฟอร์มไม่ได้
   * เมื่อต่อ backend จริงต้องตรวจซ้ำฝั่งเซิร์ฟเวอร์อีกชั้นเสมอ (SEC-06)
   */
  if (!spec.actors.includes(role))
    return (
      <Card title={`${spec.code} · ${spec.name}`}>
        <Empty>
          กิจกรรมนี้เป็นของ {spec.actors.map((r) => ROLE_LABEL[r]).join(' / ')} บทบาทของคุณจึงบันทึกไม่ได้
        </Empty>
      </Card>
    )

  return <ActivityForm spec={spec} />
}
