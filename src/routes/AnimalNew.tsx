/**
 * เพิ่มโคทีละตัว — สำหรับสัตวบาลที่ติดแท็กหน้างาน (ลูกโคเกิดใหม่ ซื้อเข้า)
 * เปิดจากหน้าฝูงโค หรือต่อจากการบันทึกคลอด ก-02 ซึ่งจะส่งแม่ RFID ลูก และวันเกิดมาให้ใน query
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Card, Field, PageHeader } from '../components/ui'
import { toast } from '../components/Toast'
import { db } from '../data/db'
import { checkAnimals, saveAnimals } from '../data/herdImport'
import { ROLE_LABEL, type Farm } from '../domain/types'
import { useAccount } from '../state/session'

const today = () => new Date().toISOString().slice(0, 10)

export function AnimalNew() {
  const account = useAccount()
  const nav = useNavigate()
  const [qs] = useSearchParams()
  const [farms, setFarms] = useState<Farm[]>([])
  const [v, setV] = useState<Record<string, string>>({
    rfid: qs.get('rfid') ?? '',
    tagNo: '',
    farmCode: '',
    sex: qs.get('sex') ?? 'เมีย',
    breed: '',
    bloodPct: '',
    birthDate: qs.get('born') ?? today(),
    parity: '0',
    damTag: '',
  })
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const fromCalving = qs.has('dam')

  useEffect(() => {
    void (async () => {
      const list = (await db.farms.toArray()).sort((a, b) => a.code.localeCompare(b.code))
      setFarms(list)
      // ลูกโคจากการคลอด — ตั้งฟาร์ม แม่ สายพันธุ์ ให้ตามแม่
      const damId = qs.get('dam')
      const dam = damId ? await db.animals.get(damId) : undefined
      if (dam) {
        const farm = list.find((f) => f.id === dam.farmId)
        setV((p) => ({ ...p, damTag: dam.tagNo, farmCode: farm?.code ?? '', breed: dam.breed }))
      } else if (list.length === 1) setV((p) => ({ ...p, farmCode: list[0].code }))
    })()
  }, [qs])

  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }))

  async function save() {
    setSaving(true)
    const { valid, errors } = await checkAnimals([v])
    if (errors.length > 0) {
      setErrors(errors[0].reason.split(' · '))
      setSaving(false)
      return
    }
    await saveAnimals(valid, `${account.name} (${ROLE_LABEL[account.role]})`, 'เพิ่มโค')
    toast.ok(`เพิ่ม ${valid[0].tagNo} เข้าฝูงแล้ว`)
    nav(`/animals/${valid[0].id}`, { replace: true })
  }

  return (
    <>
      <PageHeader title={fromCalving ? 'เพิ่มลูกโคเข้าฝูง' : 'เพิ่มโค'} sub={fromCalving ? `แม่ ${v.damTag}` : undefined} />
      <Card>
        <Field label="RFID *" hint="15 หลัก">
          <input
            value={v.rfid}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={15}
            onChange={(e) => set('rfid', e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="เบอร์หู *">
          <input value={v.tagNo} onChange={(e) => set('tagNo', e.target.value.toUpperCase())} />
        </Field>
        <Field label="ฟาร์ม *">
          <select value={v.farmCode} onChange={(e) => set('farmCode', e.target.value)}>
            <option value="">— เลือกฟาร์ม —</option>
            {farms.map((f) => (
              <option key={f.id} value={f.code}>
                {f.code} · {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="เพศ">
          <select value={v.sex} onChange={(e) => set('sex', e.target.value)}>
            <option>เมีย</option>
            <option>ผู้</option>
          </select>
        </Field>
        <Field label="วันเกิด">
          <input type="date" value={v.birthDate} max={today()} onChange={(e) => set('birthDate', e.target.value)} />
        </Field>
        <Field label="สายพันธุ์">
          <input value={v.breed} onChange={(e) => set('breed', e.target.value)} />
        </Field>
        <Field label="เปอร์เซ็นต์สายเลือด" hint="%">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            value={v.bloodPct}
            onChange={(e) => set('bloodPct', e.target.value)}
          />
        </Field>
        {!fromCalving && (
          <>
            <Field label="จำนวนท้อง" hint="0 = ยังไม่เคยท้อง">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                value={v.parity}
                onChange={(e) => set('parity', e.target.value)}
              />
            </Field>
            <Field label="เบอร์หูแม่" hint="ถ้ามี">
              <input value={v.damTag} onChange={(e) => set('damTag', e.target.value.toUpperCase())} />
            </Field>
          </>
        )}

        {errors.length > 0 && (
          <ul className="err">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <div className="row">
          <button className="btn" disabled={saving || account.readOnly} onClick={() => void save()}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          <button className="btn ghost" onClick={() => nav(-1)}>
            ยกเลิก
          </button>
        </div>
      </Card>
    </>
  )
}
