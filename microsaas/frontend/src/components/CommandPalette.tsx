import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { useCatalog } from '../catalog'
import { setLang, tr, useLang } from '../i18n'
import { PRODUCT_NAV } from '../products'
import { toggleTheme } from '../theme'

type Cmd = { id: string; group: string; label: string; icon: string; hint?: string; run: () => void }

const listeners = new Set<(open: boolean) => void>()
/** Abre la paleta desde cualquier botón (p. ej. el buscador de la barra lateral). */
export function openCommandPalette() {
  listeners.forEach((l) => l(true))
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const shortcutLabel = isMac ? '⌘K' : 'Ctrl K'

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Buscador global (Ctrl/⌘ + K): salta a cualquier app, pantalla o ajuste. */
export default function CommandPalette({ product }: { product?: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const { me, logout } = useAuth()
  const catalog = useCatalog()
  const lang = useLang()
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listeners.add(setOpen)
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      listeners.delete(setOpen)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
    }
  }, [open])

  const commands = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => nav(to)
    const out: Cmd[] = []
    const owned = new Set((me?.subscriptions || []).map((s) => s.product))
    const ordered = [...(product ? [product] : []), ...[...owned].filter((p) => p !== product)]
    for (const slug of ordered) {
      const p = catalog?.products.find((x) => x.slug === slug)
      for (const n of (PRODUCT_NAV[slug] || []).filter((n) => !n.hidden)) {
        out.push({ id: `${slug}:${n.path}`, group: p?.name || slug, label: n.label(), icon: n.icon, run: go(`/app/${slug}${n.path ? '/' + n.path : ''}`) })
      }
    }
    for (const p of catalog?.products || []) {
      if (!owned.has(p.slug)) out.push({ id: `try:${p.slug}`, group: tr('Probar otra app', 'Try another app'), label: p.name, icon: p.icon, hint: tr('Prueba gratis', 'Free trial'), run: go(`/app/${p.slug}`) })
    }
    const isAdmin = me?.role === 'owner' || me?.role === 'admin'
    const account = tr('Cuenta', 'Account')
    if (isAdmin) out.push({ id: 'billing', group: account, label: tr('Planes y pagos', 'Plans & billing'), icon: '💳', run: go('/app/billing') })
    out.push({ id: 'team', group: account, label: tr('Equipo', 'Team'), icon: '👥', run: go('/app/team') })
    out.push({ id: 'profile', group: account, label: tr('Mi perfil', 'Profile'), icon: '⚙️', run: go('/app/account') })
    if (me?.is_superadmin) out.push({ id: 'admin', group: account, label: 'Superadmin', icon: '🛠', run: go('/app/admin') })
    const prefs = tr('Preferencias', 'Preferences')
    out.push({ id: 'theme', group: prefs, label: tr('Cambiar tema claro/oscuro', 'Toggle light/dark theme'), icon: '🌓', run: toggleTheme })
    out.push({ id: 'lang', group: prefs, label: lang === 'es' ? 'Switch to English' : 'Cambiar a español', icon: '🌐', run: () => setLang(lang === 'es' ? 'en' : 'es') })
    out.push({ id: 'logout', group: prefs, label: tr('Cerrar sesión', 'Log out'), icon: '↩', run: logout })
    return out
  }, [catalog, me, product, lang, nav, logout])

  const filtered = useMemo(() => {
    const words = normalize(q).split(/\s+/).filter(Boolean)
    return commands.filter((c) => {
      const hay = normalize(`${c.group} ${c.label}`)
      return words.every((w) => hay.includes(w))
    })
  }, [q, commands])

  useEffect(() => setSel(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('.cmdk-item.on')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null
  const exec = (c: Cmd | undefined) => {
    if (!c) return
    setOpen(false)
    c.run()
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      exec(filtered[sel])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  let lastGroup = ''
  return (
    <div className="cmdk-bg" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label={tr('Buscar', 'Search')}>
        <div className="cmdk-input">
          <span className="muted">⌕</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={tr('Buscar apps, pantallas o ajustes…', 'Search apps, screens or settings…')}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
          {filtered.length === 0 && <div className="muted center" style={{ padding: 24 }}>{tr('Sin resultados', 'No results')}</div>}
          {filtered.map((c, i) => {
            const head = c.group !== lastGroup ? <div className="cmdk-group">{c.group}</div> : null
            lastGroup = c.group
            return (
              <div key={c.id}>
                {head}
                <button className={`cmdk-item ${i === sel ? 'on' : ''}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => exec(c)}>
                  <span className="ico">{c.icon}</span>
                  <span className="grow">{c.label}</span>
                  {c.hint && <span className="badge info">{c.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> {tr('navegar', 'navigate')}
          </span>
          <span>
            <kbd>↵</kbd> {tr('abrir', 'open')}
          </span>
          <span>
            <kbd>Esc</kbd> {tr('cerrar', 'close')}
          </span>
        </div>
      </div>
    </div>
  )
}
