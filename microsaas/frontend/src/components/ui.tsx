import { Link } from 'react-router-dom'
import { ReactNode, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { tr } from '../i18n'

/* ---------- Toasts ---------- */
type ToastMsg = { text: string; kind: 'ok' | 'error' } | null
let toastState: ToastMsg = null
const toastListeners = new Set<() => void>()
let toastTimer: number | undefined

export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  toastState = { text, kind }
  toastListeners.forEach((l) => l())
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastState = null
    toastListeners.forEach((l) => l())
  }, 4000)
}

export function Toaster() {
  const t = useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb)
      return () => toastListeners.delete(cb)
    },
    () => toastState,
  )
  if (!t) return null
  return (
    <div className={`toast ${t.kind === 'error' ? 'error' : ''}`} role="status">
      {t.text}
    </div>
  )
}

/* ---------- Datos asíncronos ---------- */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await run())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [run])
  useEffect(() => {
    reload()
  }, [reload])
  return { data, error, loading, reload, setData }
}

/* ---------- Componentes ---------- */
export function Spinner() {
  return <div className="spinner" aria-label="loading" />
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  if (!error) return null
  return <div className="alert error">{error}</div>
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="row between mb">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost" onClick={onClose} aria-label={tr('Cerrar', 'Close')}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'danger' }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'danger' ? 'var(--danger)' : undefined
  return (
    <div className="card stat">
      <span className="label">{label}</span>
      <span className="value" style={{ color }}>
        {value}
      </span>
    </div>
  )
}

export function Badge({ tone, children }: { tone?: 'ok' | 'warn' | 'danger' | 'info'; children: ReactNode }) {
  return <span className={`badge ${tone || ''}`}>{children}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card flat center muted" style={{ padding: 32 }}>{children}</div>
}

/** Guía de primeros pasos para pantallas vacías: dice qué hacer y lleva a cada pantalla. */
export function GettingStarted({ intro, steps }: { intro: ReactNode; steps: { title: string; text: string; to: string; cta: string }[] }) {
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>
        {intro}
      </p>
      <div className="grid grid-3 steps">
        {steps.map((s) => (
          <div key={s.to} className="card step stack" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>{s.title}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {s.text}
            </p>
            <div className="grow" />
            <Link className="btn sm primary" to={s.to} style={{ alignSelf: 'flex-start' }}>
              {s.cta} →
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted" style={{ margin: 0 }}>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="tabs">
      {items.map(([k, label]) => (
        <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  )
}

/** Ejecuta una acción asíncrona mostrando estado y errores en un toast. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const run = async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
    setBusy(true)
    try {
      const r = await fn()
      if (okMsg) toast(okMsg)
      return r
    } catch (e) {
      toast((e as Error).message, 'error')
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}
