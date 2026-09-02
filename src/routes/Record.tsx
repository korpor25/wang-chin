/** แคตตาล็อกกิจกรรม — ทางเข้าเดียวสำหรับบันทึกทุกอย่าง กรองตามบทบาทผู้ใช้ */
import { useParams } from 'react-router'
import { Card, Empty, GroupHead, List, Note, Row } from '../components/ui'
import { ActivityForm } from '../components/ActivityForm'
import {
  ACTIVITIES,
  ACTIVITY_BY_CODE,
  GROUP_LABEL,
  activitiesForRole,
  type ActivityGroup,
} from '../domain/activities'
import { ROLE_LABEL } from '../domain/types'
import { useAccount } from '../state/session'

const GROUPS: ActivityGroup[] = ['field', 'asset', 'system', 'review']

export function RecordCatalog() {
  const { role, readOnly } = useAccount()
  const mine = activitiesForRole(role)

  return (
    <>
      <Card
        title="บันทึกกิจกรรม"
        hint={`บทบาท ${ROLE_LABEL[role]} ทำได้ ${mine.length} จาก ${ACTIVITIES.length} กิจกรรม`}
      >
        <Note>
          {readOnly
            ? 'บัญชีนี้มีสิทธิ์ดูอย่างเดียว จึงบันทึกกิจกรรมไม่ได้ — ดูรายละเอียดของแต่ละกิจกรรมได้ตามปกติ'
            : 'ทุกกิจกรรมบันทึกได้ตอนไม่มีสัญญาณ ระบบเก็บลงเครื่องก่อนแล้วส่งขึ้นให้เองเมื่อกลับมาออนไลน์'}
        </Note>
      </Card>

      {GROUPS.map((g) => {
        const items = mine.filter((a) => a.group === g)
        if (items.length === 0) return null
        return (
          <Card key={g} title={GROUP_LABEL[g]}>
            <List>
              {items.map((a) => (
                <Row
                  key={a.code}
                  to={`/record/${encodeURIComponent(a.code)}`}
                  badge={<span className="code">{a.code}</span>}
                  title={a.name}
                  sub={a.trigger}
                />
              ))}
            </List>
          </Card>
        )
      })}

      {/* ให้เห็นว่ามีกิจกรรมอื่นอยู่ แต่บทบาทนี้ทำไม่ได้ ป้องกันความสับสนว่าระบบทำไม่ครบ */}
      {mine.length < ACTIVITIES.length && (
        <Card title="กิจกรรมของบทบาทอื่น" hint="แสดงไว้ให้เห็นภาพรวม บทบาทนี้บันทึกไม่ได้">
          <List>
            {ACTIVITIES.filter((a) => !mine.includes(a)).map((a) => (
              <Row
                key={a.code}
                onClick={() => undefined}
                badge={<span className="code">{a.code}</span>}
                title={a.name}
                sub={`ผู้ทำ: ${a.actors.map((r) => ROLE_LABEL[r]).join(' / ')}`}
              />
            ))}
          </List>
        </Card>
      )}
    </>
  )
}

export function RecordForm() {
  const { code = '' } = useParams()
  const spec = ACTIVITY_BY_CODE.get(decodeURIComponent(code))
  if (!spec) return <Empty>ไม่พบกิจกรรมรหัสนี้</Empty>
  return <ActivityForm spec={spec} />
}

export function GroupedCatalog() {
  return <GroupHead>ทั้งหมด</GroupHead>
}
