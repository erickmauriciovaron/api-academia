import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { initAnalytics, trackPageview } from './analytics'
import { api } from './api'
import { useAuth } from './auth'
import { loadCatalog, useCatalog } from './catalog'
import AppShell from './components/AppShell'
import { Spinner, Toaster, useAction } from './components/ui'
import { pick, setLang, tr, useLang } from './i18n'
import { Billing, BillingReturn, MoreApps, Profile, Team } from './pages/Account'
import Admin from './pages/Admin'
import { Forgot, Login, Reset, Signup } from './pages/Auth'
import { Home, Landing, Legal } from './pages/Public'
import { DatosForm, M365Callback, SignHandover, SupportPortal, SupportTicket } from './pages/public/PublicForms'
import { PRODUCT_NAV } from './products'

// Las URLs /en/... fijan el idioma inglés al entrar (útil para enlaces y buscadores).
if (location.pathname === '/en' || location.pathname.startsWith('/en/')) setLang('en')

function PageviewTracker() {
  const loc = useLocation()
  useEffect(() => {
    trackPageview(loc.pathname)
  }, [loc.pathname])
  return null
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth()
  if (loading) return <Spinner />
  if (!me) return <Navigate to="/login" replace />
  return children
}

function AppIndex() {
  const { me } = useAuth()
  const first = me?.subscriptions[0]?.product
  return <Navigate to={first ? `/app/${first}` : '/app/apps'} replace />
}

function ProductArea() {
  useLang()
  const { product = '' } = useParams()
  const { sub, me, refresh } = useAuth()
  const catalog = useCatalog()
  const { busy, run } = useAction()
  const nav = PRODUCT_NAV[product]
  if (!nav) return <Navigate to="/app" replace />
  const s = sub(product)
  const p = catalog?.products.find((x) => x.slug === product)
  const isAdmin = me?.role !== 'member'

  if (!s) {
    return (
      <AppShell product={product}>
        <div className="card stack" style={{ maxWidth: 560 }}>
          <h2>
            {p?.icon} {p?.name}
          </h2>
          <p>{pick(p?.tagline)}</p>
          <button
            className="btn primary"
            disabled={busy || !isAdmin}
            onClick={() => run(() => api(`/api/auth/activate/${product}`, { method: 'POST' }), tr('Prueba activada', 'Trial started')).then(refresh)}
          >
            {tr('Activar prueba gratis', 'Start free trial')}
          </button>
        </div>
      </AppShell>
    )
  }
  if (!s.has_access) {
    return (
      <AppShell product={product}>
        <div className="card stack" style={{ maxWidth: 560 }}>
          <h2>{tr('Tu acceso terminó', 'Your access has ended')}</h2>
          <p>{tr('Tus datos están guardados. Activa un plan para seguir usando la app.', 'Your data is saved. Activate a plan to keep using the app.')}</p>
          {isAdmin ? (
            <Link className="btn primary" to={`/app/billing?product=${product}`}>
              {tr('Ver planes', 'See plans')}
            </Link>
          ) : (
            <p className="muted">{tr('Pide al administrador de tu cuenta que active un plan.', 'Ask your account admin to activate a plan.')}</p>
          )}
        </div>
      </AppShell>
    )
  }
  return (
    <AppShell product={product}>
      <Routes>
        {nav.map((n) => (
          <Route key={n.path} path={n.path || undefined} index={n.path === ''} element={n.element} />
        ))}
        <Route path="*" element={<Navigate to={`/app/${product}`} replace />} />
      </Routes>
    </AppShell>
  )
}

function Plain({ children }: { children: JSX.Element }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  )
}

export default function App() {
  const [domainProduct, setDomainProduct] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    loadCatalog()
      .then((c) => initAnalytics(c.analytics))
      .catch(() => undefined)
    api<{ product: string | null }>('/api/public/context')
      .then((r) => setDomainProduct(r.product))
      .catch(() => setDomainProduct(null))
  }, [])
  if (domainProduct === undefined) return <Spinner />
  return (
    <BrowserRouter>
      <Toaster />
      <PageviewTracker />
      <Routes>
        <Route path="/" element={<Home domainProduct={domainProduct} />} />
        <Route path="/en" element={<Home domainProduct={domainProduct} />} />
        <Route path="/p/:slug" element={<Landing />} />
        <Route path="/en/p/:slug" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset" element={<Reset />} />
        <Route path="/terminos" element={<Legal kind="terminos" />} />
        <Route path="/privacidad" element={<Legal kind="privacidad" />} />
        <Route path="/firmar/:token" element={<SignHandover />} />
        <Route path="/datos/:key" element={<DatosForm />} />
        <Route path="/soporte/:key" element={<SupportPortal />} />
        <Route path="/soporte/:key/t/:token" element={<SupportTicket />} />
        <Route path="/app" element={<RequireAuth><AppIndex /></RequireAuth>} />
        <Route path="/app/apps" element={<Plain><MoreApps /></Plain>} />
        <Route path="/app/billing" element={<Plain><Billing /></Plain>} />
        <Route path="/app/billing/return" element={<Plain><BillingReturn /></Plain>} />
        <Route path="/app/team" element={<Plain><Team /></Plain>} />
        <Route path="/app/account" element={<Plain><Profile /></Plain>} />
        <Route path="/app/admin" element={<Plain><Admin /></Plain>} />
        <Route path="/app/m365/callback" element={<M365Callback />} />
        <Route path="/app/:product/*" element={<RequireAuth><ProductArea /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
