import { ReactNode, useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { setSeo } from '../analytics'
import { useAuth } from '../auth'
import { Plan, Product, useCatalog } from '../catalog'
import { money, pick, setLang, tr, useLang } from '../i18n'
import { Spinner } from '../components/ui'

export function PublicLayout({ children, product }: { children: ReactNode; product?: Product }) {
  const { me } = useAuth()
  const lang = useLang()
  const loc = useLocation()
  const nav = useNavigate()
  const toggleLang = () => {
    const next = lang === 'es' ? 'en' : 'es'
    setLang(next)
    const isPublic = loc.pathname === '/' || loc.pathname === '/en' || loc.pathname.startsWith('/p/') || loc.pathname.startsWith('/en/')
    if (isPublic) {
      const base = loc.pathname.replace(/^\/en(?=\/|$)/, '') || '/'
      nav(next === 'en' ? (base === '/' ? '/en' : '/en' + base) : base)
    }
  }
  return (
    <div style={product ? ({ '--accent': product.color } as React.CSSProperties) : undefined}>
      <nav className="public-nav">
        <Link to={product ? `/p/${product.slug}` : '/'} className="brand" style={{ textDecoration: 'none' }}>
          <span>{product?.icon || '⚡'}</span> {product?.name || 'MicroSuite'}
        </Link>
        <div className="row">
          <button className="btn ghost sm" onClick={toggleLang}>
            🌐 {lang === 'es' ? 'English' : 'Español'}
          </button>
          {me ? (
            <Link className="btn primary" to={product ? `/app/${product.slug}` : '/app'}>
              {tr('Ir a mi cuenta', 'Go to my account')}
            </Link>
          ) : (
            <>
              <Link className="btn ghost" to="/login">
                {tr('Ingresar', 'Log in')}
              </Link>
              <Link className="btn primary" to={`/signup${product ? `?product=${product.slug}` : ''}`}>
                {tr('Prueba gratis', 'Free trial')}
              </Link>
            </>
          )}
        </div>
      </nav>
      {children}
      <footer className="footer">
        <div className="container row between">
          <span>© {new Date().getFullYear()} MicroSuite · {tr('Pagos seguros con PayPal', 'Secure payments with PayPal')}</span>
          <span className="row">
            <Link to="/">{tr('Todas las apps', 'All apps')}</Link>
            <Link to="/terminos">{tr('Términos', 'Terms')}</Link>
            <Link to="/privacidad">{tr('Privacidad', 'Privacy')}</Link>
          </span>
        </div>
      </footer>
    </div>
  )
}

export function Home({ domainProduct }: { domainProduct?: string | null }) {
  const catalog = useCatalog()
  const lang = useLang()
  useEffect(() => {
    if (!domainProduct)
      setSeo(
        tr('MicroSuite: 10 micro apps para pymes y equipos de TI', 'MicroSuite: 10 micro apps for SMBs and IT teams'),
        tr('Licencias Microsoft 365, inventario TI, vencimientos, cobranza y más. Prueba gratis.', 'Microsoft 365 license savings, IT asset inventory, expiry alerts, invoice reminders and more. Free trial.'),
      )
  }, [lang, domainProduct])
  if (domainProduct) return <Landing slugOverride={domainProduct} />
  if (!catalog) return <Spinner />
  return (
    <PublicLayout>
      <div className="container">
        <section className="hero">
          <h1>{tr('Herramientas simples que te ahorran dinero desde el primer mes', 'Simple tools that save you money from month one')}</h1>
          <p className="lead">
            {tr(
              `10 micro apps para pymes, equipos de TI y profesionales. ${catalog.trial_days} días gratis, sin tarjeta. Cancela cuando quieras.`,
              `10 micro apps for SMBs, IT teams and professionals. ${catalog.trial_days}-day free trial, no card. Cancel anytime.`,
            )}
          </p>
        </section>
        <div className="grid grid-3">
          {catalog.products.map((p) => (
            <Link key={p.slug} to={`${lang === 'en' ? '/en' : ''}/p/${p.slug}`} className="card product-card">
              <div className="row">
                <div className="product-icon" style={{ background: `${p.color}1a` }}>
                  {p.icon}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{p.name}</h3>
                  <span className="muted small">
                    {tr('desde', 'from')} {money(Math.min(...p.plans.map((x) => x.price)))}/{tr('mes', 'mo')}
                    {p.market === 'co' && ' · 🇨🇴'}
                  </span>
                </div>
              </div>
              <p style={{ margin: 0 }}>{pick(p.tagline)}</p>
            </Link>
          ))}
        </div>
      </div>
    </PublicLayout>
  )
}

export function PricingTable({ product, onPick, currentPlan, busyPlan }: { product: Product; onPick: (plan: Plan, interval: 'month' | 'year') => void; currentPlan?: string; busyPlan?: string | null }) {
  const [interval, setInterval] = useState<'month' | 'year'>('month')
  return (
    <div>
      <div className="center mb">
        <div className="toggle">
          <button className={interval === 'month' ? 'on' : ''} onClick={() => setInterval('month')}>
            {tr('Mensual', 'Monthly')}
          </button>
          <button className={interval === 'year' ? 'on' : ''} onClick={() => setInterval('year')}>
            {tr('Anual (2 meses gratis)', 'Yearly (2 months free)')}
          </button>
        </div>
      </div>
      <div className="grid grid-3">
        {product.plans.map((pl) => (
          <div key={pl.code} className={`card plan-card stack ${pl.trial ? 'featured' : ''}`}>
            <div className="row between">
              <h3 style={{ margin: 0 }}>{pl.name}</h3>
              {pl.trial && <span className="badge info">{tr('Más elegido', 'Most popular')}</span>}
            </div>
            <div>
              <span className="price">{money(interval === 'year' ? pl.price_year : pl.price)}</span>
              <span className="muted"> /{interval === 'year' ? tr('año', 'yr') : tr('mes', 'mo')}</span>
            </div>
            <ul className="feature-list">
              {(pick(pl.features) || []).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className="grow" />
            <button className={`btn ${pl.trial ? 'primary' : ''} block`} disabled={currentPlan === `${pl.code}:${interval}` || busyPlan === pl.code} onClick={() => onPick(pl, interval)}>
              {currentPlan === `${pl.code}:${interval}` ? tr('Plan actual', 'Current plan') : busyPlan === pl.code ? tr('Redirigiendo…', 'Redirecting…') : tr('Elegir', 'Choose')}
            </button>
          </div>
        ))}
      </div>
      <p className="center muted small mt">{tr('Precios en USD. Pago con PayPal o tarjeta débito/crédito a través de PayPal. Cancela cuando quieras.', 'Prices in USD. Pay with PayPal or debit/credit card via PayPal. Cancel anytime.')}</p>
    </div>
  )
}

export function Landing({ slugOverride }: { slugOverride?: string }) {
  const params = useParams()
  const slug = slugOverride || params.slug
  const catalog = useCatalog()
  const { me } = useAuth()
  useLang()
  if (!catalog) return <Spinner />
  const p = catalog.products.find((x) => x.slug === slug)
  if (!p) return <Navigate to="/" />
  const start = me ? `/app/${p.slug}` : `/signup?product=${p.slug}`
  setSeo(`${p.name}: ${pick(p.tagline)}`, pick(p.description))
  return (
    <PublicLayout product={p}>
      <div className="container">
        <section className="hero">
          <div className="product-icon mb" style={{ background: `${p.color}1a`, width: 64, height: 64, fontSize: 36 }}>
            {p.icon}
          </div>
          <h1>{pick(p.tagline)}</h1>
          <p className="lead">{pick(p.description)}</p>
          <div className="row mt">
            <Link className="btn primary lg" to={start}>
              {tr(`Probar gratis ${catalog.trial_days} días`, `Try free for ${catalog.trial_days} days`)}
            </Link>
            <a className="btn lg" href="#precios">
              {tr('Ver precios', 'See pricing')}
            </a>
          </div>
          <p className="muted small mt">{tr('Sin tarjeta de crédito · Configuración en minutos', 'No credit card · Set up in minutes')}</p>
        </section>
        <section className="section-pad">
          <h2>{tr('Qué incluye', "What's included")}</h2>
          <div className="grid grid-3 mt">
            {(pick(p.features) || []).map((f) => (
              <div key={f} className="card flat">
                ✓ {f}
              </div>
            ))}
          </div>
        </section>
        <section className="section-pad" id="precios">
          <h2 className="center">{tr('Precios simples', 'Simple pricing')}</h2>
          <p className="center muted mb">{tr('Empieza con la prueba gratis del plan más elegido.', 'Start with a free trial of the most popular plan.')}</p>
          <PricingTable product={p} onPick={() => (location.href = start)} />
        </section>
        <section className="section-pad">
          <h2>{tr('Preguntas frecuentes', 'FAQ')}</h2>
          <div className="stack mt">
            {(pick(p.faq) || []).map(([q, a]) => (
              <details key={q} className="card flat">
                <summary style={{ fontWeight: 600, cursor: 'pointer' }}>{q}</summary>
                <p className="mt" style={{ marginBottom: 0 }}>
                  {a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </PublicLayout>
  )
}

export function Legal({ kind }: { kind: 'terminos' | 'privacidad' }) {
  useLang()
  return (
    <PublicLayout>
      <div className="public-page">
        {kind === 'terminos' ? (
          <>
            <h1>{tr('Términos del servicio', 'Terms of service')}</h1>
            <p>{tr('El servicio se ofrece por suscripción mensual o anual, renovable automáticamente a través de PayPal. Puedes cancelar en cualquier momento desde "Planes y pagos"; conservarás el acceso hasta el final del periodo pagado. No se hacen reembolsos parciales salvo obligación legal.', 'The service is offered as an auto-renewing monthly or yearly subscription billed through PayPal. You can cancel anytime from "Plans & billing"; access continues until the end of the paid period. No partial refunds unless required by law.')}</p>
            <p>{tr('Eres responsable de la información que cargas y del uso que haces del servicio. Hacemos copias de seguridad diarias, pero recomendamos exportar tus datos periódicamente.', 'You are responsible for the data you upload and how you use the service. We keep daily backups but recommend exporting your data periodically.')}</p>
          </>
        ) : (
          <>
            <h1>{tr('Política de privacidad', 'Privacy policy')}</h1>
            <p>{tr('Tratamos los datos de tu cuenta (nombre, correo, empresa) para prestar el servicio y facturar. Los datos que cargas en cada app te pertenecen; no los vendemos ni compartimos con terceros, salvo proveedores necesarios para operar (hosting, correo y PayPal para pagos).', 'We process your account data (name, email, company) to provide the service and bill you. The data you upload belongs to you; we do not sell or share it with third parties except providers needed to operate (hosting, email and PayPal for payments).')}</p>
            <p>{tr('Puedes solicitar la consulta, corrección o eliminación de tus datos escribiendo al correo de soporte.', 'You can request access, correction or deletion of your data by writing to the support email.')}</p>
          </>
        )}
      </div>
    </PublicLayout>
  )
}
