/** ชิ้นส่วน UI พื้นฐาน — ตั้งใจให้บางไว้ก่อน รอสวมดีไซน์จริงทีหลัง */
import type { ReactNode } from 'react'
import { ArrowLeft, ChevronRight, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

export function Card({
  title,
  hint,
  action,
  children,
}: {
  title?: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card">
      {(title || action) && (
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <h2>{title}</h2>}
            {hint && <p>{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        {value}
        {sub && <small> {sub}</small>}
      </dd>
    </div>
  )
}

export function Stats({ children }: { children: ReactNode }) {
  return <dl className="stats">{children}</dl>
}

export type Tone = 'ok' | 'warn' | 'crit' | 'mute'

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>
        {label}
        {hint && <em style={{ fontStyle: 'normal', color: 'var(--faint)' }}> · {hint}</em>}
      </span>
      {children}
    </label>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>
}

export function KeyValues({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** แถวรายการที่กดเข้าไปดูรายละเอียดได้ */
export function Row({
  to,
  onClick,
  title,
  sub,
  side,
  badge,
}: {
  to?: string
  onClick?: () => void
  title: ReactNode
  sub?: ReactNode
  side?: ReactNode
  badge?: ReactNode
}) {
  const inner = (
    <>
      <div className="row-main">
        <div className="row-title">
          {badge}
          {title}
        </div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      {side && <div className="row-side">{side}</div>}
      <ChevronRight size={17} className="chev" />
    </>
  )
  return (
    <li>
      {to ? (
        <Link className="row-link" to={to}>
          {inner}
        </Link>
      ) : (
        <button className="row-link" onClick={onClick} type="button">
          {inner}
        </button>
      )}
    </li>
  )
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list">{children}</ul>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function GroupHead({ children }: { children: ReactNode }) {
  return <h3 className="group-head">{children}</h3>
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="search">
      <Search size={17} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="search"
      />
    </div>
  )
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button
          key={o.value}
          className="chip"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function KpiCard({
  label,
  value,
  unit,
  target,
  hint,
  higherIsBetter = true,
}: {
  label: string
  value: number
  unit: string
  target: number | null
  hint?: string
  higherIsBetter?: boolean
}) {
  const good = target === null ? null : higherIsBetter ? value >= target : value <= target
  return (
    <div className="kpi">
      <div className="lab">{label}</div>
      <div className="val">
        {value.toLocaleString('th-TH')} <small>{unit}</small>
      </div>
      {target !== null && (
        <div className={`tgt ${good ? 'good' : 'bad'}`}>
          เป้าหมาย {target.toLocaleString('th-TH')} {unit} · {good ? 'ถึงเป้า' : 'ต่ำกว่าเป้า'}
        </div>
      )}
      {hint && <div className="tgt" style={{ color: 'var(--faint)' }}>{hint}</div>}
    </div>
  )
}

/** กราฟแท่งเล็กสำหรับดูแนวโน้ม ไม่ต้องพึ่งไลบรารีชาร์ต */
export function Spark({
  values,
  tones,
  labels,
}: {
  values: number[]
  tones?: Array<Tone | ''>
  labels?: string[]
}) {
  const max = Math.max(1, ...values)
  const min = Math.min(...values)
  const span = Math.max(1, max - min)
  return (
    <div className="spark">
      {values.map((v, i) => (
        <i
          key={i}
          className={tones?.[i] ?? ''}
          style={{ height: `${15 + ((v - min) / span) * 85}%` }}
          title={labels?.[i] ?? String(v)}
        />
      ))}
    </div>
  )
}

/** หัวหน้าเพจย่อย พร้อมปุ่มย้อนกลับแบบแอปทั่วไป */
export function PageHeader({ title, sub, back = true }: { title: string; sub?: string; back?: boolean }) {
  const nav = useNavigate()
  return (
    <div className="page-head">
      {back && (
        <button onClick={() => nav(-1)} aria-label="ย้อนกลับ">
          <ArrowLeft size={18} />
        </button>
      )}
      <div style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
    </div>
  )
}

/** โครงร่างระหว่างรอข้อมูล ใช้แทนข้อความ "กำลังโหลด" */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk" style={{ width: i === 0 ? '58%' : i % 2 ? '100%' : '82%' }} />
      ))}
    </div>
  )
}
