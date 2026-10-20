import { ReactNode, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { useCatalog } from '../catalog'
import { fmtDate, setLang, tr, useLang } from '../i18n'
import { PRODUCT_NAV } from '../products'
import { toggleTheme, useTheme } from '../theme'
import CommandPalette, { openCommandPalette, shortcutLabel } from './CommandPalette'

export default function AppShell({ product, children }: { product?: string; children: ReactNode }) {
  const { me, logout, sub } = useAuth()
  const catalog = useCatalog()
  const lang = useLang()
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const p = catalog?.products.find((x) => x.slug === product)
  const s = product ? sub(product) : undefined
  const nav = product ? PRODUCT_NAV[product] || [] : []
  const mySubs = me?.subscriptions || []
  const isAdmin = me?.role === 'owner' || me?.role === 'admin'

  return (
    <div className="shell" style={p ? ({ '--accent': p.color } as React.CSSProperties) : undefined}>
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <Link to={product ? `/app/${product}` : '/app'} className="brand">
          <span className="logo-tile">{p?.icon || '⚡'}</span> {p?.name || 'MicroSuite'}
        </Link>
        <button className="search-trigger" onClick={openCommandPalette}>
          <span>⌕</span>
          <span className="grow">{tr('Buscar…', 'Search…')}</span>
          <kbd>{shortcutLabel}</kbd>
        </button>
        {nav.filter((n) => !n.hidden).map((n) => (
          <NavLink key={n.path} end={n.path === ''} to={`/app/${product}${n.path ? '/' + n.path : ''}`} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
            <span className="ico">{n.icon}</span> {n.label()}
          </NavLink>
        ))}
        <div className="section">{tr('Mis apps', 'My apps')}</div>
        {mySubs.map((x) => {
          const cp = catalog?.products.find((c) => c.slug === x.product)
          return (
            <NavLink key={x.product} to={`/app/${x.product}`} className={() => `nav ${x.product === product ? 'active' : ''}`}>
              <span className="ico">{cp?.icon}</span> {x.product_name}
            </NavLink>
          )
        })}
        <NavLink to="/app/apps" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
          <span className="ico">➕</span> {tr('Más apps', 'More apps')}
        </NavLink>
        <div className="section">{tr('Cuenta', 'Account')}</div>
        {isAdmin && (
          <NavLink to="/app/billing" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
            <span className="ico">💳</span> {tr('Planes y pagos', 'Plans & billing')}
          </NavLink>
        )}
        <NavLink to="/app/team" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
          <span className="ico">👥</span> {tr('Equipo', 'Team')}
        </NavLink>
        <NavLink to="/app/account" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
          <span className="ico">⚙️</span> {tr('Mi perfil', 'Profile')}
        </NavLink>
        {me?.is_superadmin && (
          <NavLink to="/app/admin" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
            <span className="ico">🛠</span> Superadmin
          </NavLink>
        )}
        <div className="grow" />
        <div className="row small" style={{ padding: '10px 4px 0', gap: 4 }}>
          <button className="btn sm ghost" onClick={(e) => (e.stopPropagation(), setLang(lang === 'es' ? 'en' : 'es'))} title={tr('Idioma', 'Language')}>
            🌐 {lang.toUpperCase()}
          </button>
          <button className="btn sm ghost" onClick={(e) => (e.stopPropagation(), toggleTheme())} title={tr('Tema claro/oscuro', 'Light/dark theme')}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="grow" />
          <button className="btn sm ghost" onClick={logout}>
            {tr('Salir', 'Log out')} ↩
          </button>
        </div>
        <div className="user-card">
          <span className="avatar">{initials(me?.name)}</span>
          <div className="who small">
            <b>{me?.name}</b>
            <span className="muted">{me?.tenant.name}</span>
          </div>
        </div>
      </aside>
      <CommandPalette product={product} />
      <div>
        <div className="topbar">
          <button className="btn ghost" onClick={() => setOpen(!open)} aria-label="menu">
            ☰
          </button>
          <strong className="row" style={{ gap: 8 }}>
            <span className="logo-tile" style={{ width: 28, height: 28, fontSize: 15 }}>{p?.icon || '⚡'}</span> {p?.name || 'MicroSuite'}
          </strong>
          <button className="btn ghost" onClick={openCommandPalette} aria-label={tr('Buscar', 'Search')}>
            ⌕
          </button>
        </div>
        <main className="main" key={loc.pathname.split('/').slice(0, 3).join('/')}>
          {s && s.status === 'trialing' && s.has_access && (
            <div className="alert warn mb no-print row between">
              <span>
                {tr('Prueba gratis activa hasta', 'Free trial active until')} <b>{fmtDate(s.trial_ends_at)}</b>.
              </span>
              {isAdmin && (
                <Link className="btn sm primary" to={`/app/billing?product=${product}`}>
                  {tr('Elegir plan', 'Choose plan')}
                </Link>
              )}
            </div>
          )}
          {s && s.status === 'past_due' && (
            <div className="alert error mb no-print">{tr('Tu último pago falló. Actualiza tu método de pago en PayPal para no perder el acceso.', 'Your last payment failed. Update your PayPal payment method to keep access.')}</div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}

function initials(name?: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '·'
}
