import { useSyncExternalStore } from 'react'

export type Lang = 'es' | 'en'
const KEY = 'ms_lang'
const listeners = new Set<() => void>()

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'es' || saved === 'en') return saved
  } catch {
    /* sin almacenamiento */
  }
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

let current: Lang = detect()
document.documentElement.lang = current

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang) {
  current = lang
  document.documentElement.lang = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    /* sin almacenamiento */
  }
  listeners.forEach((l) => l())
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
  )
}

/** Traducción en línea: tr('Guardar', 'Save') */
export function tr(es: string, en: string): string {
  return current === 'es' ? es : en
}

export function pick<T>(v: { es: T; en: T } | undefined): T | undefined {
  return v ? v[current] : undefined
}

export function money(n: number | string | null | undefined, currency = 'USD'): string {
  const v = Number(n || 0)
  try {
    return new Intl.NumberFormat(current === 'es' ? 'es-CO' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v)
  } catch {
    return `${currency} ${v.toFixed(2)}`
  }
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v.length === 10 ? v + 'T12:00:00' : v)
  if (isNaN(d.getTime())) return v
  return d.toLocaleDateString(current === 'es' ? 'es-CO' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  return d.toLocaleString(current === 'es' ? 'es-CO' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
