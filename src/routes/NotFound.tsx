import { Link } from 'react-router'
import { Card, Empty } from '../components/ui'

export function NotFound() {
  return (
    <Card title="ไม่พบหน้าที่ต้องการ">
      <Empty>ลิงก์อาจเปลี่ยนไปแล้ว หรือหน้านี้ไม่ได้เปิดให้บทบาทของคุณ</Empty>
      <div className="row">
        <Link className="btn" to="/">
          กลับหน้าแรก
        </Link>
      </div>
    </Card>
  )
}
