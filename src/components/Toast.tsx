/** แจ้งผลการทำงานสั้น ๆ ที่มุมล่าง */
import { useEffect } from 'react'
import { create } from 'zustand'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'

type Kind = 'ok' | 'crit' | 'info'

interface Item {
  id: number
  kind: Kind
  text: string
}

interface ToastState {
  items: Item[]
  push: (kind: Kind, text: string) => void
  drop: (id: number) => void
}

let seq = 0

export const useToast = create<ToastState>((set) => ({
  items: [],
  push(kind, text) {
    const id = ++seq
    set((s) => ({ items: [...s.items, { id, kind, text }] }))
  },
  drop(id) {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
  },
}))

export const toast = {
  ok: (t: string) => useToast.getState().push('ok', t),
  error: (t: string) => useToast.getState().push('crit', t),
  info: (t: string) => useToast.getState().push('info', t),
}

export function Toasts() {
  const items = useToast((s) => s.items)
  return (
    <div className="toasts" aria-live="polite">
      {items.map((i) => (
        <ToastItem key={i.id} item={i} />
      ))}
    </div>
  )
}

function ToastItem({ item }: { item: Item }) {
  const drop = useToast((s) => s.drop)
  useEffect(() => {
    const t = setTimeout(() => drop(item.id), 3200)
    return () => clearTimeout(t)
  }, [item.id, drop])

  const Icon = item.kind === 'ok' ? CircleCheck : item.kind === 'crit' ? CircleAlert : Info
  return (
    <div className={`toast ${item.kind}`} role="status">
      <Icon size={17} className="ic" />
      <span>{item.text}</span>
    </div>
  )
}
