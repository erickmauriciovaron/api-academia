import { ReactNode, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { useCatalog } from '../catalog'
import { fmtDate, setLang, tr, useLang } from '../i18n'
import { PRODUCT_NAV } from '../products'

export default function AppShell({ product, children }: { product?: string; children: ReactNode }) {
  const { me, logout, sub } = useAuth()
  const catalog = useCatalog()
  const lang = useLang()
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
        <Link to={product ? `/app/${product}` : '/app'} className="brand" style={{ color: 'var(--text)' }}>
          <span>{p?.icon || '⚡'}</span> {p?.name || 'MicroSuite'}
        </Link>
        {nav.filter((n) => !n.hidden).map((n) => (
          <NavLink key={n.path} end={n.path === ''} to={`/app/${product}${n.path ? '/' + n.path : ''}`} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
            <span>{n.icon}</span> {n.label()}
          </NavLink>
        ))}
        <div className="section">{tr('Mis apps', 'My apps')}</div>
        {mySubs.map((x) => {
          const cp = catalog?.products.find((c) => c.slug === x.product)
          return (
            <NavLink key={x.product} to={`/app/${x.product}`} className={() => `nav ${x.product === product ? 'active' : ''}`}>
              <span>{cp?.icon}</span> {x.product_name}
            </NavLink>
          )
        })}
        <NavLink to="/app/apps" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
          <span>➕</span> {tr('Más apps', 'More apps')}
        </NavLink>
        <div className="section">{tr('Cuenta', 'Account')}</div>
        {isAdmin && (
          <NavLink to="/app/billing" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
            <span>💳</span> {tr('Planes y pagos', 'Plans & billing')}
          </NavLink>
        )}
        <NavLink to="/app/team" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
          <span>👥</span> {tr('Equipo', 'Team')}
        </NavLink>
        <NavLink to="/app/account" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
          <span>⚙️</span> {tr('Mi perfil', 'Profile')}
        </NavLink>
        {me?.is_superadmin && (
          <NavLink to="/app/admin" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>
            <span>🛠</span> Superadmin
          </NavLink>
        )}
        <div className="grow" />
        <div className="row small" style={{ padding: '10px 8px' }}>
          <button className="btn sm ghost" onClick={(e) => (e.stopPropagation(), setLang(lang === 'es' ? 'en' : 'es'))}>
            🌐 {lang.toUpperCase()}
          </button>
          <button className="btn sm ghost" onClick={logout}>
            {tr('Salir', 'Log out')}
          </button>
        </div>
        <div className="muted small" style={{ padding: '0 10px' }}>
          {me?.name}
          <br />
          {me?.tenant.name}
        </div>
      </aside>
      <div>
        <div className="topbar">
          <button className="btn ghost" onClick={() => setOpen(!open)} aria-label="menu">
            ☰
          </button>
          <strong>
            {p?.icon} {p?.name || 'MicroSuite'}
          </strong>
          <span />
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
