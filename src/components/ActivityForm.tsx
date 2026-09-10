/**
 * ฟอร์มบันทึกกิจกรรม — ตัวเดียวรองรับครบทั้ง 26 กิจกรรม
 * เรนเดอร์จาก ActivitySpec จึงเพิ่ม/แก้ฟิลด์ได้ที่ไฟล์สเปกที่เดียว
 *
 * ลำดับการทำงานยึดหลักออฟไลน์มาก่อน
 *   กรอก → เขียนลง IndexedDB → เข้าคิวส่ง → คำนวณผลต่อเนื่อง → แจ้งผู้ใช้
 * ไม่มีขั้นตอนไหนรอเครือข่าย
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Camera, CircleCheck, Lightbulb, TriangleAlert, X } from 'lucide-react'
import type { ActivitySpec, FieldSpec } from '../domain/activities'
import { CYCLE_LABEL } from '../domain/types'
import type { Animal, BioParams, SemenBatch } from '../domain/types'
import { Card, Empty, Field, Note, PageHeader, SearchBox } from './ui'
import { db, newLocalId } from '../data/db'
import { saveRecord } from '../data/sync'
import { applyEffects, closeTask } from '../data/effects'
import { getParams, recentAnimals, searchAnimals } from '../data/queries'
import { breedingBlockers } from '../domain/rules'
import { BAND_CHECKS, BAND_LABEL, BAND_RANGE, BCS9_LABEL, bcsAdvice, bcsBand } from '../domain/bcs'
import { compressImage } from '../lib/image'
import { useAccount } from '../state/session'
import { bytes } from '../lib/format'
import { toast } from './Toast'

const localNow = (withTime: boolean) => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return withTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date
}

interface PendingPhoto {
  id: string
  blob: Blob
  url: string
  bytes: number
  width: number
  height: number
}

export function ActivityForm({ spec }: { spec: ActivitySpec }) {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { userId, name, role, readOnly } = useAccount()

  const taskLocalId = sp.get('task')
  const presetAnimal = sp.get('animal')

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [animalId, setAnimalId] = useState<string | null>(presetAnimal)
  const [animal, setAnimal] = useState<Animal | null>(null)
  const [params, setParams] = useState<BioParams | null>(null)
  const [semen, setSemen] = useState<SemenBatch[]>([])
  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ messages: string[]; tasksCreated: number } | null>(null)
  const [picking, setPicking] = useState(false)
  const [flash, setFlash] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const photosRef = useRef<PendingPhoto[]>([])
  photosRef.current = photos

  /** SEC-03 — ฟิลด์บางตัวเป็นของบทบาทเดียว เช่น ช่องยืนยันผลของสัตวบาลใน ก-07 */
  const fields = useMemo(
    () => spec.fields.filter((f) => !f.roles || f.roles.includes(role)),
    [spec, role],
  )

  /** ที่แสดงจริงในฟอร์ม — ฟิลด์ซ่อนยังถูกบันทึกไปด้วย แค่ไม่ให้กรอก */
  const shown = useMemo(() => fields.filter((f) => !f.hidden), [fields])

  // ตั้งค่าเริ่มต้นของฟิลด์วันที่/เวลาให้เป็นตอนนี้ เพราะภาคสนามบันทึกทันทีที่ทำ
  useEffect(() => {
    const init: Record<string, unknown> = {}
    for (const f of fields) {
      if (f.type === 'date') init[f.key] = localNow(false)
      if (f.type === 'datetime') init[f.key] = localNow(true)
      if (f.type === 'bool') init[f.key] = false
      if (f.default !== undefined) init[f.key] = f.default
      if (f.key === 'actor' || f.key === 'reporter') init[f.key] = name
    }
    setValues(init)
    setDone(null)
    setErrors({})
  }, [spec.code, name, fields])

  useEffect(() => {
    void getParams().then(setParams)
    if (spec.fields.some((f) => f.type === 'semen'))
      void db.semen.filter((s) => s.status !== 'rejected').toArray().then(setSemen)
  }, [spec.code])

  useEffect(() => {
    if (!animalId) return setAnimal(null)
    void db.animals.get(animalId).then((a) => setAnimal(a ?? null))
  }, [animalId])

  // คืนหน่วยความจำของ object URL เมื่อออกจากหน้า
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const set = (k: string, v: unknown) => setValues((prev) => ({ ...prev, [k]: v }))

  /**
   * กิจกรรมที่ต้องระบุตัวสัตว์ ยังกรอกอะไรไม่ได้จนกว่าจะเลือกโคก่อน
   *
   * เดิมกรอกได้หมดแล้วค่อยไปเจอตอนกดบันทึกว่าลืมเลือกตัว ซึ่งเสียเวลากรอกซ้ำ
   * และหน้างานมือเปื้อนอยู่แล้ว ปิดช่องกรอกไว้ก่อนจึงดีกว่าเตือนทีหลัง
   */
  const locked = spec.needsAnimal && !animalId

  function focusPicker() {
    setPicking(true)
    pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlash(true)
    window.setTimeout(() => setFlash(false), 1200)
  }

  const blockers = useMemo(
    () => (animal && params && spec.code === 'ก-08' ? breedingBlockers(animal, params) : []),
    [animal, params, spec.code],
  )

  /**
   * มติ [29:56] — BCS ของโคเนื้อคือสเกล 9 ระดับ (mockup ของทีมออกแบบเป็น 5)
   * ค่าสูงสุดมาจาก BioParams ที่เดียว ไม่ใช่ตัวเลขที่ฝังไว้ในหน้าจอ
   */
  const scoreMax = params?.bcsScaleMax ?? 9

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      try {
        // บีบอัดก่อนเก็บเสมอ — วัดจริงแล้วรูปจากกล้อง 3 MB เหลือราว 100 KB
        const { blob, width, height } = await compressImage(file, 1600, 0.8)
        setPhotos((p) => [
          ...p,
          {
            id: newLocalId('ph'),
            blob,
            url: URL.createObjectURL(blob),
            bytes: blob.size,
            width,
            height,
          },
        ])
      } catch {
        setErrors((e) => ({ ...e, photos: 'เปิดไฟล์รูปไม่สำเร็จ' }))
      }
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (spec.needsAnimal && !animalId) next.__animal = 'ต้องเลือกตัวสัตว์ก่อน'
    for (const f of fields) {
      if (!f.required || f.hidden) continue
      const v = values[f.key]
      if (f.type === 'bool') continue
      if (v === undefined || v === null || v === '') next[f.key] = 'จำเป็นต้องกรอก'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function submit() {
    if (!validate() || !params) return
    setSaving(true)
    try {
      const localId = newLocalId('rec')
      const occurredAt = pickOccurredAt(spec, values)

      // เก็บรูปก่อน เพื่อให้บันทึกอ้างถึงได้แม้ปิดแอปทันที
      const photoIds: number[] = []
      for (const p of photos) {
        const id = await db.photos.add({
          localId: p.id,
          recordLocalId: localId,
          blob: p.blob,
          bytes: p.bytes,
          width: p.width,
          height: p.height,
          at: Date.now(),
          syncStatus: 'pending',
        })
        photoIds.push(id)
      }

      await saveRecord({
        localId,
        serverId: null,
        activityCode: spec.code,
        animalId,
        farmId: animal?.farmId ?? null,
        occurredAt,
        payload: values,
        photoIds,
        note: String(values.note ?? ''),
        recordedBy: name,
        recordedRole: role,
        lastModified: Date.now(),
        syncStatus: 'pending',
        retries: 0,
      })

      const effects = await applyEffects(spec.code, values, animalId, params, occurredAt, {
        userId,
        name,
        role,
      })
      if (taskLocalId) await closeTask(taskLocalId, localId)

      photos.forEach((p) => URL.revokeObjectURL(p.url))
      setPhotos([])
      setDone(effects)
      toast.ok(navigator.onLine ? 'บันทึกแล้ว กำลังส่งขึ้นระบบ' : 'บันทึกลงเครื่องแล้ว จะส่งให้เมื่อมีสัญญาณ')
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <>
        <PageHeader title={spec.name} sub={spec.code} />
        <Card>
          <div className="done-head">
            <CircleCheck size={22} className="ic-ok" />
            <div>
              <h2>บันทึกลงเครื่องแล้ว</h2>
              <p className="hint">
                {spec.code} · {spec.name} — เข้าคิวรอส่งขึ้นเซิร์ฟเวอร์เมื่อมีสัญญาณ
              </p>
            </div>
          </div>

          {done.messages.length > 0 && (
            <>
              <p className="subhead">ระบบทำต่อให้แล้ว</p>
              <ul className="derived">
                {done.messages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
          {done.tasksCreated > 0 && (
            <Note>สร้างกำหนดการถัดไปให้อัตโนมัติ {done.tasksCreated} รายการ ดูได้ที่หน้างาน</Note>
          )}

          <div className="row">
            <button className="btn" onClick={() => setDone(null)}>
              บันทึกอีกรายการ
            </button>
            {animalId && (
              <button className="btn ghost" onClick={() => nav(`/animals/${animalId}`)}>
                ดูโคตัวนี้
              </button>
            )}
            <button className="btn ghost" onClick={() => nav('/tasks')}>
              ไปหน้างาน
            </button>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader title={spec.name} sub={spec.code} />
      <div className="form-head">
        <p>{spec.detail}</p>
        <p className="hint tiny">ทำเมื่อ: {spec.trigger}</p>
      </div>

      {spec.needsAnimal && (
        <div ref={pickerRef} className={flash ? 'flash' : undefined}>
        <Card title="ตัวสัตว์" hint="ยืนยันด้วย RFID หรือเบอร์หู">
          {animal ? (
            <div className="picked">
              <div className="picked-main">
                <div className="row-title">{animal.tagNo} · {animal.breed}</div>
                <div className="row-sub">{animal.rfid}</div>
              </div>
              <button className="btn ghost fit" onClick={() => { setAnimalId(null); setPicking(true) }}>
                เปลี่ยน
              </button>
            </div>
          ) : (
            <AnimalPicker onPick={(a) => { setAnimalId(a.id); setPicking(false) }} open={picking || !animalId} />
          )}
          {errors.__animal && <p className="err">{errors.__animal}</p>}
        </Card>
        </div>
      )}

      {blockers.length > 0 && (
        <Card title="เตือนก่อนบันทึกการผสม">
          <div className="warn-block">
            <TriangleAlert size={19} className="ic-warn" />
            <ul>
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
          <Note>ยังบันทึกต่อได้ถ้าหน้างานมีเหตุจำเป็น แต่ระบบจะทำเครื่องหมายไว้ให้ตรวจสอบภายหลัง</Note>
        </Card>
      )}

      {locked ? (
        <Card title="รายละเอียดที่ต้องบันทึก">
          <Empty>เลือกตัวโคก่อน แล้วช่องกรอกจะเปิดให้ — ระบบต้องรู้ว่าบันทึกนี้เป็นของตัวไหน</Empty>
          <div className="row">
            <button className="btn" onClick={focusPicker}>
              เลือกตัวโค <span className="go">↑</span>
            </button>
          </div>
        </Card>
      ) : shown.length > 0 ? (
        <Card title="รายละเอียดที่ต้องบันทึก">
          {shown.map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={values[f.key]}
              error={errors[f.key]}
              semen={semen}
              photos={photos}
              scoreMax={scoreMax}
              onChange={(v) => set(f.key, v)}
              onAddPhotos={addPhotos}
              onRemovePhoto={(id) => {
                setPhotos((p) => {
                  const target = p.find((x) => x.id === id)
                  if (target) URL.revokeObjectURL(target.url)
                  return p.filter((x) => x.id !== id)
                })
              }}
            />
          ))}
          <Field label="หมายเหตุเพิ่มเติม">
            <textarea
              rows={2}
              value={String(values.note ?? '')}
              onChange={(e) => set('note', e.target.value)}
            />
          </Field>
        </Card>
      ) : (
        <Card title="กิจกรรมนี้ระบบทำให้อัตโนมัติ">
          <Empty>
            ไม่ต้องกรอกอะไร — ระบบคำนวณและดำเนินการเองเมื่อมีเหตุการณ์ตั้งต้น
          </Empty>
        </Card>
      )}

      {spec.code === 'ก-03' && params && Number(values.score) > 0 && (
        <BcsPanel score={Number(values.score)} params={params} />
      )}

      <Card title="ระบบจะทำอะไรต่อ">
        <ul className="derived">
          {spec.derived.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </Card>

      {shown.length > 0 && !locked && readOnly && (
        <Card>
          <Empty>บัญชีนี้มีสิทธิ์ดูอย่างเดียว จึงบันทึกกิจกรรมนี้ไม่ได้</Empty>
        </Card>
      )}

      {shown.length > 0 && !locked && !readOnly && (
        <div className="sticky-save">
          <button className="btn full" onClick={() => void submit()} disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          <p className="hint tiny center">บันทึกได้แม้ไม่มีสัญญาณ ระบบจะส่งขึ้นให้เองเมื่อกลับมาออนไลน์</p>
        </div>
      )}
    </>
  )
}

/**
 * แผงอธิบายคะแนน BCS ที่เลือก — บอกว่าคะแนนนี้อยู่กลุ่มไหน คลำอะไรได้บ้าง
 * และระบบแนะนำอะไรต่อ คำแนะนำเทียบกับเกณฑ์เข้าผสมใน BioParams ไม่ใช่เลขตายตัว
 */
function BcsPanel({ score, params }: { score: number; params: BioParams }) {
  const band = bcsBand(score)
  const advice = bcsAdvice(score, params)
  return (
    <Card>
      <div className="band-card">
        <h3>
          BCS {score.toFixed(1)} · กลุ่ม{BAND_LABEL[band]}
        </h3>
        <p className="hint">สิ่งที่ควรคลำได้จริงเมื่อโคอยู่ในกลุ่มนี้</p>
        <div className="band-checks">
          {BAND_CHECKS[band].map(([part, sign]) => (
            <div className="band-check" key={part}>
              <b>{part}</b>
              <span>{sign}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`advice ${advice.tone}`}>
        <Lightbulb size={17} className="ic" />
        <div>
          <b>คำแนะนำอัตโนมัติจากระบบ</b>
          {advice.text}
        </div>
      </div>
    </Card>
  )
}

function pickOccurredAt(spec: ActivitySpec, values: Record<string, unknown>): number {
  const dateField = spec.fields.find((f) => f.type === 'datetime') ?? spec.fields.find((f) => f.type === 'date')
  if (dateField) {
    const raw = values[dateField.key]
    if (typeof raw === 'string' && raw) {
      const t = Date.parse(raw)
      if (!Number.isNaN(t)) return t
    }
  }
  return Date.now()
}

function FieldInput({
  field: f,
  value,
  error,
  semen,
  photos,
  scoreMax,
  onChange,
  onAddPhotos,
  onRemovePhoto,
}: {
  field: FieldSpec
  value: unknown
  error?: string
  semen: SemenBatch[]
  photos: PendingPhoto[]
  scoreMax: number
  onChange: (v: unknown) => void
  onAddPhotos: (files: FileList | null) => void
  onRemovePhoto: (id: string) => void
}) {
  const label = f.required ? `${f.label} *` : f.label
  const hint = f.unit ? f.unit : undefined

  if (f.type === 'photo') {
    return (
      <Field label={f.label} hint="บีบอัดอัตโนมัติก่อนเก็บ">
        <label className="btn ghost photo-pick">
          <Camera size={17} /> ถ่ายหรือเลือกรูป
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => onAddPhotos(e.target.files)}
          />
        </label>
        {photos.length > 0 && (
          <div className="thumbs">
            {photos.map((p) => (
              <div key={p.id} className="thumb">
                <img src={p.url} alt="" />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(p.id)}
                  aria-label="ลบรูป"
                  className="thumb-x"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        {photos.length > 0 && (
          <p className="hint tiny">
            {photos.length} รูป · รวม {bytes(photos.reduce((s, p) => s + p.bytes, 0))}
          </p>
        )}
      </Field>
    )
  }

  if (f.type === 'bool') {
    return (
      <label className="field check">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{f.label}</span>
      </label>
    )
  }

  if (f.type === 'score') {
    const max = scoreMax || f.max || 9
    const min = f.min ?? 1
    const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i)
    const nine = max === 9
    const picked = Number(value)
    return (
      <Field label={label} hint={`เกณฑ์มาตรฐาน ${min}–${max} ${nine ? 'สำหรับโคเนื้อ' : ''}`}>
        <div className={nine ? 'score-grid' : 'score-grid five'}>
          {nums.map((n) => (
            <button
              key={n}
              type="button"
              className={`score-box ${nine ? bcsBand(n) : ''}`.trim()}
              aria-pressed={picked === n}
              aria-label={nine ? `${n} ${BCS9_LABEL[n]}` : String(n)}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
        </div>

        {/* คะแนนที่เลือกต้องอ่านออกทันทีโดยไม่ต้องเพ่ง คำกำกับจึงมาอยู่ตรงนี้แทนในช่องเล็ก */}
        {nine &&
          (picked >= 1 ? (
            <div className={`score-pick ${bcsBand(picked)}`}>
              <span className="big">{picked}</span>
              <span>
                <span className="lab">{BCS9_LABEL[picked]}</span>
                <span className="sub">
                  กลุ่ม {BAND_RANGE[bcsBand(picked)]} · {BAND_LABEL[bcsBand(picked)]}
                </span>
              </span>
            </div>
          ) : (
            <div className="score-pick empty">แตะเลือกคะแนน 1–9 จากแถวด้านบน</div>
          ))}

        {/* วางใต้ตารางให้แต่ละช่วงอยู่ตรงกับตัวเลขของมันพอดี ไม่ต้องเขียนกำกับว่ากลุ่มไหนคือเลขอะไร */}
        {nine && (
          <div className="band-legend">
            {(['thin', 'ideal', 'fat'] as const).map((b) => (
              <span key={b} className={`band-seg ${b}`}>
                {BAND_LABEL[b]}
              </span>
            ))}
          </div>
        )}

        {error && <ErrorText msg={error} />}
      </Field>
    )
  }

  if (f.type === 'select') {
    return (
      <Field label={label} hint={hint}>
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">— เลือก —</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {error && <ErrorText msg={error} />}
      </Field>
    )
  }

  if (f.type === 'semen') {
    return (
      <Field label={label} hint="เฉพาะล็อตที่ยังใช้ได้">
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          <option value="">— เลือกล็อต —</option>
          {semen.map((s) => (
            <option key={s.id} value={s.id}>
              {s.lotNo} · {s.sireName} · เหลือ {s.strawsIn - s.strawsUsed} หลอด
              {s.status === 'watch' ? ' (เฝ้าระวัง)' : ''}
            </option>
          ))}
        </select>
        {error && <ErrorText msg={error} />}
      </Field>
    )
  }

  if (f.type === 'textarea') {
    return (
      <Field label={label}>
        <textarea rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        {error && <ErrorText msg={error} />}
      </Field>
    )
  }

  const inputType =
    f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'

  return (
    <Field label={label} hint={hint}>
      <input
        type={inputType}
        value={String(value ?? '')}
        min={f.min}
        max={f.max}
        step={f.step}
        inputMode={f.type === 'number' ? 'decimal' : undefined}
        onChange={(e) => onChange(f.type === 'number' ? e.target.valueAsNumber : e.target.value)}
      />
      {error && <ErrorText msg={error} />}
    </Field>
  )
}

function ErrorText({ msg }: { msg: string }) {
  return <span className="err">{msg}</span>
}

export function AnimalPicker({ onPick, open }: { onPick: (a: Animal) => void; open: boolean }) {
  const { userId, role } = useAccount()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Animal[]>([])
  const [recent, setRecent] = useState<Animal[]>([])
  // เกษตรกรเลือกได้เฉพาะโคในฟาร์มตัวเอง ยังไม่รู้ขอบเขตก็ยังไม่ต้องคิวรี
  const [scope, setScope] = useState<string[] | null>(role === 'farmer' ? null : [])

  useEffect(() => {
    if (role !== 'farmer') return
    let alive = true
    void db.users.get(userId).then((u) => alive && setScope(u?.farmIds ?? []))
    return () => {
      alive = false
    }
  }, [role, userId])

  useEffect(() => {
    if (!open || !scope) return
    let alive = true
    void recentAnimals(6, scope).then((r) => alive && setRecent(r))
    return () => {
      alive = false
    }
  }, [open, scope])

  useEffect(() => {
    if (!open || !scope || q.trim() === '') return
    let alive = true
    void searchAnimals({ q, limit: 25 }).then((r) => {
      if (alive) setHits(scope.length ? r.filter((a) => scope.includes(a.farmId)) : r)
    })
    return () => {
      alive = false
    }
  }, [q, open, scope])

  const searching = q.trim() !== ''
  const rows = searching ? hits.slice(0, 8) : recent

  return (
    <>
      <SearchBox value={q} onChange={setQ} placeholder="สแกนหรือพิมพ์ RFID / เบอร์หู" />
      {rows.length === 0 ? (
        <Empty>{searching ? 'ไม่พบตัวที่ค้นหา' : 'ยังไม่มีโคในความดูแล'}</Empty>
      ) : (
        <>
          <p className="picker-head">
            {searching ? `พบ ${hits.length} ตัว` : 'บันทึกล่าสุด'}
            {!searching && <span>แตะเพื่อเลือก หรือสแกนแท็กที่ตัวสัตว์</span>}
          </p>
          <ul className="picker-list">
            {rows.map((a) => (
              <li key={a.id}>
                <button type="button" className="picker-item" onClick={() => onPick(a)}>
                  <span className="picker-tag">{a.tagNo}</span>
                  <span className="picker-main">
                    <span className="picker-title">
                      {a.breed} {a.bloodPct}%
                    </span>
                    <span className="picker-sub">{a.rfid}</span>
                  </span>
                  <span className="picker-stage">{CYCLE_LABEL[a.stage]}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
