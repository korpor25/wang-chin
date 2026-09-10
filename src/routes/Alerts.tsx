/**
 * แจ้งเตือน (ค-03) และการยกระดับ (ค-04)
 * จุดสำคัญคือแยกให้ออกว่า "ไม่ได้รับแจ้ง" / "รับแล้วไม่ทำ" / "ทำแล้วไม่ได้ผล"
 * จึงต้องเก็บทั้งเวลาส่ง เปิดอ่าน และยืนยันจะปฏิบัติ
 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, ListChecks, MapPin } from 'lucide-react'
import { Card, Chips, Empty, Field, Note, PageHeader, Pill, Stat, Stats } from '../components/ui'
import { db } from '../data/db'
import { coopEvents, postCoopEvent } from '../data/tasks'
import { useAccount } from '../state/session'
import { dateTime, num, pct } from '../lib/format'
import { ROLE_LABEL } from '../domain/types'
import type { Alert, CoopEvent, Role } from '../domain/types'

type View = 'inbox' | 'ack' | 'escalated' | 'all'

/**
 * ALR-01 — สามอย่างนี้ต้องแยกกันให้ขาด เพราะเรียกร้องจากผู้ใช้ไม่เหมือนกัน
 *   งาน (Task)            ต้องลงมือทำแล้วบันทึกผล → อยู่หน้า "งานของฉัน"
 *   แจ้งเตือน (Alert)     รับทราบแล้วไปที่งาน     → แท็บนี้
 *   กิจกรรมสหกรณ์ (Event) รับทราบเฉย ๆ            → แท็บแยกด้านล่าง
 */
type Section = 'alerts' | 'events'

const SECTIONS: Array<{ value: Section; label: string }> = [
  { value: 'alerts', label: 'แจ้งเตือน' },
  { value: 'events', label: 'กิจกรรมสหกรณ์' },
]

const OPTIONS: Array<{ value: View; label: string }> = [
  { value: 'inbox', label: 'ยังไม่ตอบรับ' },
  { value: 'ack', label: 'ยืนยันแล้ว' },
  { value: 'escalated', label: 'ค้างนาน' },
  { value: 'all', label: 'ทั้งหมด' },
]

const LEVEL_TONE = { info: 'mute', warn: 'warn', critical: 'crit' } as const
const LEVEL_LABEL = { info: 'ทั่วไป', warn: 'สำคัญ', critical: 'ด่วน' } as const
const CHANNEL_LABEL = { 'in-app': 'ในแอป', line: 'LINE', sms: 'SMS' } as const

export function Alerts() {
  const { userId, role, isAdmin } = useAccount()
  const [section, setSection] = useState<Section>('alerts')
  const [view, setView] = useState<View>('inbox')
  const [rows, setRows] = useState<Alert[]>([])
  const [all, setAll] = useState<Alert[]>([])

  const load = useCallback(async () => {
    // แจ้งเตือนที่ระบุตัวบุคคล (เช่น การมอบหมายงาน) ต้องไม่โผล่ในกล่องของเพื่อนร่วมบทบาท
    const mine = await db.alerts
      .filter((a) => (a.toRole === role || isAdmin) && (!a.toUser || a.toUser === userId))
      .toArray()
    mine.sort((a, b) => b.sentAt - a.sentAt)
    setAll(mine)
    setRows(
      view === 'inbox'
        ? mine.filter((a) => !a.ackAt && !a.resolvedAt)
        : view === 'ack'
          ? mine.filter((a) => a.ackAt)
          : view === 'escalated'
            ? mine.filter((a) => a.escalatedAt)
            : mine,
    )
  }, [userId, role, isAdmin, view])

  useEffect(() => {
    void load()
  }, [load])

  async function markRead(a: Alert) {
    if (a.readAt || !a.id) return
    await db.alerts.update(a.id, { readAt: Date.now() })
    void load()
  }

  async function ack(a: Alert) {
    if (!a.id) return
    await db.alerts.update(a.id, { readAt: a.readAt ?? Date.now(), ackAt: Date.now() })
    void load()
  }

  const sent = all.length
  const read = all.filter((a) => a.readAt).length
  const acked = all.filter((a) => a.ackAt).length

  return (
    <>
      <PageHeader title="แจ้งเตือน" sub="รายการที่ส่งถึงคุณ และประกาศของสหกรณ์" />
      <Card>
        <Chips value={section} options={SECTIONS} onChange={setSection} />
        <Note>
          <b>แจ้งเตือน</b> คือสิ่งที่ต้องรับทราบแล้วไปทำงานต่อ ส่วน <b>กิจกรรมสหกรณ์</b> คือประกาศที่รับทราบเฉย ๆ
          — งานที่ต้องลงมือทำแล้วบันทึกผลอยู่ที่หน้า{' '}
          <Link to="/tasks" className="link-more">
            <ListChecks size={13} className="ic-inline" /> งานของฉัน
          </Link>
        </Note>
      </Card>

      {section === 'events' && <EventsSection />}

      {section === 'alerts' && (
      <>
      <Card hint="ระบบส่งล่วงหน้าตามกฎของแต่ละบทบาท">
        <Stats>
          <Stat label="ส่งแล้ว" value={num(sent)} sub="ครั้ง" />
          <Stat label="อัตราเปิดอ่าน" value={pct(read, sent)} />
          <Stat label="อัตรายืนยันจะปฏิบัติ" value={pct(acked, sent)} />
        </Stats>
        <Chips value={view} options={OPTIONS} onChange={setView} />
        <Note>
          ตัวเลขสองค่านี้ใช้แยกสาเหตุของงานที่ไม่ถูกทำ — เปิดอ่านต่ำแปลว่าช่องทางแจ้งมีปัญหา
          ส่วนเปิดอ่านสูงแต่ยืนยันต่ำแปลว่าปัญหาอยู่ที่การปฏิบัติ
        </Note>
      </Card>

      <Card title={OPTIONS.find((o) => o.value === view)?.label} hint={`${num(rows.length)} รายการ`}>
        {rows.length === 0 ? (
          <Empty>ไม่มีรายการ</Empty>
        ) : (
          rows.slice(0, 80).map((a) => (
            <div className="lot" key={a.localId}>
              <div className="lot-head">
                <Pill tone={LEVEL_TONE[a.level]}>{LEVEL_LABEL[a.level]}</Pill>
                <span className="lot-left">{dateTime(a.sentAt)}</span>
              </div>
              <div className="lot-name">
                {a.title}
                {!a.readAt && ' '}
                {!a.readAt && <Pill tone="warn">ยังไม่อ่าน</Pill>}
                {a.escalatedAt && ' '}
                {a.escalatedAt && <Pill tone="crit">ค้างนาน</Pill>}
              </div>
              <div className="lot-meta">
                {a.body} · ส่งทาง {CHANNEL_LABEL[a.channel]}
              </div>
              <div className="row snug">
                {!a.ackAt && (
                  <button className="btn chiplike" onClick={() => void ack(a)}>
                    ยืนยันจะปฏิบัติ <span className="go">→</span>
                  </button>
                )}
                {!a.readAt && (
                  <button className="btn ghost chiplike" onClick={() => void markRead(a)}>
                    อ่านแล้ว
                  </button>
                )}
                {a.animalId && (
                  <Link className="btn ghost chiplike" to={`/animals/${a.animalId}`}>
                    ดูโค <span className="go">→</span>
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </Card>
      </>
      )}
    </>
  )
}

/** กิจกรรมสหกรณ์ — ประกาศที่ผู้ใช้แค่รับทราบ ไม่มีงานให้ปิด (ALR-01) */
function EventsSection() {
  const account = useAccount()
  const [rows, setRows] = useState<CoopEvent[]>([])
  const [composing, setComposing] = useState(false)
  const canPost = account.role === 'coop' && !account.readOnly

  const load = useCallback(async () => {
    setRows(await coopEvents(account.role))
  }, [account.role])

  useEffect(() => {
    void load()
  }, [load])

  const upcoming = rows.filter((e) => (e.endAt ?? e.startAt) >= Date.now())
  const past = rows.filter((e) => (e.endAt ?? e.startAt) < Date.now())

  return (
    <>
      <Card
        title="กิจกรรมสหกรณ์"
        hint={`กำลังจะถึง ${num(upcoming.length)} · ผ่านไปแล้ว ${num(past.length)}`}
        action={
          canPost ? (
            <button
              className="btn ghost mini"
              onClick={() => setComposing((v) => !v)}
            >
              {composing ? 'ปิด' : 'ประกาศ'}
            </button>
          ) : undefined
        }
      >
        {composing && canPost && (
          <EventComposer
            onPosted={() => {
              setComposing(false)
              void load()
            }}
          />
        )}
        {rows.length === 0 && !composing && (
          <Empty>ยังไม่มีประกาศกิจกรรมของสหกรณ์</Empty>
        )}
        {upcoming.map((e, i) => (
          <EventCard key={e.localId} event={e} lead={i === 0} />
        ))}
      </Card>

      {past.length > 0 && (
        <Card title="ผ่านไปแล้ว" hint={`${num(past.length)} รายการ`}>
          {past.slice(0, 20).map((e) => (
            <EventCard key={e.localId} event={e} />
          ))}
        </Card>
      )}
    </>
  )
}

/**
 * ประกาศหนึ่งใบ — ใบที่ใกล้ถึงที่สุดแสดงเป็นการ์ดเข้มตามดีไซน์
 * ที่เหลือเป็นการ์ดธรรมดา เพื่อให้เห็นว่าอันไหนต้องรู้ก่อน
 */
function EventCard({ event, lead }: { event: CoopEvent; lead?: boolean }) {
  const when = dateTime(event.startAt)
  const to = event.audience ? ROLE_LABEL[event.audience] : 'ทุกบทบาท'

  if (lead)
    return (
      <div className="slab">
        <span className="slab-chip">
          <CalendarDays size={12} /> {when}
        </span>
        <h2>{event.title}</h2>
        <p>{event.body}</p>
        <p>
          {event.place && `${event.place} · `}
          ถึง {to} · ประกาศโดย {event.postedBy}
        </p>
      </div>
    )

  return (
    <div className="lot">
      <div className="lot-head">
        <Pill tone="mute">
          <CalendarDays size={12} /> {when}
        </Pill>
        <span className="lot-left">{to}</span>
      </div>
      <div className="lot-name">{event.title}</div>
      <div className="lot-meta">
        {event.body}
        {event.place && (
          <>
            {' '}
            · <MapPin size={12} className="ic-inline" /> {event.place}
          </>
        )}{' '}
        · ประกาศโดย {event.postedBy}
      </div>
    </div>
  )
}

function EventComposer({ onPosted }: { onPosted: () => void }) {
  const account = useAccount()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [place, setPlace] = useState('')
  const [startAt, setStartAt] = useState('')
  const [audience, setAudience] = useState<Role | 'all'>('all')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const at = Date.parse(startAt)
    if (!title.trim() || Number.isNaN(at)) return
    setBusy(true)
    try {
      await postCoopEvent(
        {
          title: title.trim(),
          body: body.trim(),
          place: place.trim(),
          startAt: at,
          endAt: null,
          audience: audience === 'all' ? null : audience,
        },
        { userId: account.userId, name: account.name, role: account.role },
      )
      setTitle('')
      setBody('')
      setPlace('')
      onPosted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Field label="หัวข้อ *">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ประชุมสมาชิกประจำเดือน" />
      </Field>
      <Field label="รายละเอียด">
        <input value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div className="grid2">
        <Field label="วันและเวลา *">
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </Field>
        <Field label="สถานที่">
          <input value={place} onChange={(e) => setPlace(e.target.value)} />
        </Field>
      </div>
      <Field label="ประกาศถึง">
        <select value={audience} onChange={(e) => setAudience(e.target.value as Role | 'all')}>
          <option value="all">ทุกบทบาท</option>
          <option value="farmer">{ROLE_LABEL.farmer}</option>
          <option value="husbandry">{ROLE_LABEL.husbandry}</option>
          <option value="coop">{ROLE_LABEL.coop}</option>
        </select>
      </Field>
      <div className="row">
        <button className="btn" disabled={busy || !title.trim() || !startAt} onClick={() => void submit()}>
          {busy ? 'กำลังประกาศ…' : 'ประกาศ'}
        </button>
      </div>
      <Note>ประกาศนี้ไม่สร้างงานและไม่นับรวมกับอัตราการตอบสนองต่อแจ้งเตือน</Note>
    </>
  )
}
