/** ชิ้นส่วน UI พื้นฐาน — ตั้งใจให้บางไว้ก่อน รอสวมดีไซน์จริงทีหลัง */
import type { ReactNode } from 'react'
import { ArrowLeft, ChevronRight, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import type { IconType } from './activityIcon'

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
        <header>
          <div className="card-head-main">
            {title && <h2>{title}</h2>}
            {hint && <p>{hint}</p>}
          </div>
          {action && <div className="card-actions">{action}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: string
  /** ระบายสีช่องตามความหมายของตัวเลข ตามแถวสถิติในดีไซน์ */
  tone?: Tone
}) {
  return (
    <div className={tone ? `stat ${tone}` : 'stat'}>
      <dt>{label}</dt>
      <dd>
        {value}
        {sub && <small> {sub}</small>}
      </dd>
    </div>
  )
}

export function Stats({ children, quad }: { children: ReactNode; quad?: boolean }) {
  return <dl className={quad ? 'stats quad' : 'stats'}>{children}</dl>
}

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'mute'

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>
        {label}
        {hint && <em className="field-hint"> · {hint}</em>}
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
        <div key={k} className="kv-pair">
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

export function ActRow({
  to,
  Icon,
  code,
  name,
  sub,
  active,
}: {
  to: string
  Icon: IconType
  code: string
  name: string
  sub?: string
  active?: boolean
}) {
  return (
    <Link className={active ? 'act on' : 'act'} to={to}>
      <span className="act-icon">
        <Icon size={20} />
      </span>
      <span className="act-main">
        <span className="act-name">
          <span className="code">{code}</span>
          {name}
        </span>
        {sub && <span className="act-sub">{sub}</span>}
      </span>
      <ChevronRight size={17} className="chev" />
    </Link>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  onFocus,
  onBlur,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  onFocus?: () => void
  onBlur?: () => void
}) {
  return (
    <div className="search">
      <Search size={17} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="search"
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </div>
  )
}

export function Chips<T extends string | number>({
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
      <div className="page-head-main">
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
