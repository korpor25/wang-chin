/**
 * หน้านำเข้าฟาร์มและโคจากไฟล์ — ใช้โดย admin สหกรณ์
 * ขั้นตอน: เลือกไฟล์หรือวาง → จับคู่คอลัมน์ → ตรวจ → ยืนยันนำเข้า
 */
import { useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import { Card, Chips, Field, Note, Stat, Stats } from './ui'
import { toast } from './Toast'
import { useAccount } from '../state/session'
import { ROLE_LABEL, type Animal, type Farm } from '../domain/types'
import {
  IMPORT_COLUMNS,
  TARGET_LABEL,
  autoMap,
  checkAnimals,
  checkFarms,
  downloadTemplate,
  parseDelimited,
  readTableFile,
  saveAnimals,
  saveFarms,
  toValues,
  type Checked,
  type ImportTarget,
} from '../data/herdImport'
import { num } from '../lib/format'

const TARGETS: Array<{ value: ImportTarget; label: string }> = [
  { value: 'farms', label: '1. ฟาร์ม' },
  { value: 'animals', label: '2. โค' },
]

type Result = Checked<Farm> | Checked<Animal>

export function HerdImport() {
  const account = useAccount()
  const [target, setTarget] = useState<ImportTarget>('farms')
  const [source, setSource] = useState('')
  const [table, setTable] = useState<string[][] | null>(null)
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [paste, setPaste] = useState('')

  const cols = IMPORT_COLUMNS[target]
  const headers = table?.[0] ?? []
  const body = table?.slice(1) ?? []
  const missing = cols.filter((c) => c.required && mapping[c.key] === undefined)

  function load(rows: string[][], from: string) {
    if (rows.length < 2) {
      toast.error('ไม่พบข้อมูล — บรรทัดแรกต้องเป็นหัวตาราง และมีข้อมูลอย่างน้อย 1 แถว')
      return
    }
    setTable(rows)
    setSource(from)
    setMapping(autoMap(target, rows[0]))
    setResult(null)
  }

  function reset(next?: ImportTarget) {
    setTable(null)
    setSource('')
    setPaste('')
    setMapping({})
    setResult(null)
    if (next) setTarget(next)
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    try {
      load(await readTableFile(file), file.name)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'อ่านไฟล์ไม่ได้')
    }
  }

  async function check() {
    if (!table) return
    setBusy(true)
    const values = toValues(body, mapping)
    setResult(target === 'farms' ? await checkFarms(values) : await checkAnimals(values))
    setBusy(false)
  }

  async function commit() {
    if (!result || result.valid.length === 0) return
    setBusy(true)
    const actor = `${account.name} (${ROLE_LABEL[account.role]})`
    try {
      if (target === 'farms') await saveFarms(result.valid as Farm[], actor)
      else await saveAnimals(result.valid as Animal[], actor)
      toast.ok(`นำเข้า${TARGET_LABEL[target]}แล้ว ${num(result.valid.length)} รายการ`)
      reset(target === 'farms' ? 'animals' : undefined)
    } catch {
      toast.error('บันทึกไม่สำเร็จ ลองตรวจสอบใหม่อีกครั้ง')
    }
    setBusy(false)
  }

  return (
    <>
      <Card
        title="นำเข้าข้อมูล"
        action={
          <button className="btn ghost mini" onClick={() => downloadTemplate(target)}>
            <Download size={15} /> แม่แบบ{TARGET_LABEL[target]}
          </button>
        }
      >
        <Chips value={target} options={TARGETS} onChange={(t) => reset(t)} />

        <div className="row">
          <label className="btn">
            <FileUp size={16} /> เลือกไฟล์ Excel / CSV
            <input
              type="file"
              accept=".xlsx,.csv,.txt"
              hidden
              onChange={(e) => {
                void onFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </div>

        <Field label="หรือก๊อปจาก Excel มาวาง" hint="รวมบรรทัดหัวตาราง">
          <textarea
            rows={4}
            value={paste}
            className="textarea-code"
            placeholder={`${cols.map((c) => c.label).join('\t')}`}
            onChange={(e) => {
              setPaste(e.target.value)
              if (e.target.value.trim()) load(parseDelimited(e.target.value), 'ข้อมูลที่วาง')
              else reset()
            }}
          />
        </Field>
      </Card>

      {table && (
        <Card title="จับคู่คอลัมน์" hint={`${source} · ${num(body.length)} แถว`}>
          {cols.map((c) => (
            <Field key={c.key} label={c.required ? `${c.label} *` : c.label}>
              <select
                value={mapping[c.key] ?? ''}
                onChange={(e) => {
                  const next = { ...mapping }
                  if (e.target.value === '') delete next[c.key]
                  else next[c.key] = Number(e.target.value)
                  setMapping(next)
                  setResult(null)
                }}
              >
                <option value="">— ไม่นำเข้า —</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `คอลัมน์ ${i + 1}`}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          {missing.length > 0 && <p className="err">ยังไม่ได้เลือก: {missing.map((c) => c.label).join(', ')}</p>}
          <div className="row">
            <button className="btn" disabled={busy || missing.length > 0} onClick={() => void check()}>
              ตรวจสอบข้อมูล
            </button>
          </div>
        </Card>
      )}

      {result && (
        <Card title="ผลการตรวจ">
          <Stats>
            <Stat label="พร้อมนำเข้า" value={num(result.valid.length)} sub="แถว" tone="ok" />
            <Stat
              label="มีปัญหา"
              value={num(result.errors.length)}
              sub="แถว"
              tone={result.errors.length > 0 ? 'crit' : 'ok'}
            />
          </Stats>

          {result.errors.length > 0 && (
            <>
              <p className="subhead">แถวที่ต้องแก้ในไฟล์ (จะไม่ถูกนำเข้า)</p>
              <div className="tablewrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>แถว</th>
                      <th>ปัญหา</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.slice(0, 100).map((e) => (
                      <tr key={e.row}>
                        <td className="num">{e.row}</td>
                        <td className="wrap">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.errors.length > 100 && <Note>แสดง 100 แถวแรกจาก {num(result.errors.length)} แถว</Note>}
            </>
          )}

          <div className="row">
            <button
              className="btn"
              disabled={busy || result.valid.length === 0 || account.readOnly}
              onClick={() => void commit()}
            >
              {busy ? 'กำลังนำเข้า…' : `นำเข้า ${num(result.valid.length)} ${target === 'farms' ? 'ฟาร์ม' : 'ตัว'}`}
            </button>
          </div>
        </Card>
      )}
    </>
  )
}
