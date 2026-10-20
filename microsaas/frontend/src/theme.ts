// Tema visual (oscuro por defecto). index.html lo aplica antes de pintar para evitar parpadeos.
import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'ms_theme'
const listeners = new Set<() => void>()

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem(KEY, t)
  } catch {
    // Sin almacenamiento (modo privado): el tema dura solo esta visita.
  }
  listeners.forEach((l) => l())
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark')
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getTheme,
  )
}
