import { ReactNode, useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { setSeo } from '../analytics'
import { useAuth } from '../auth'
import { Plan, Product, useCatalog } from '../catalog'
import { money, pick, setLang, tr, useLang } from '../i18n'
import { Spinner } from '../components/ui'
import { toggleTheme, useTheme } from '../theme'

export function PublicLayout({ children, product }: { children: ReactNode; product?: Product }) {
  const { me } = useAuth()
  const lang = useLang()
  const loc = useLocation()
  const nav = useNavigate()
  const theme = useTheme()
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
      <div className="public-nav-wrap">
      <nav className="public-nav">
        <Link to={product ? `/p/${product.slug}` : '/'} className="brand" style={{ textDecoration: 'none' }}>
          <span className="logo-tile">{product?.icon || '⚡'}</span> {product?.name || 'MicroSuite'}
        </Link>
        <div className="row">
          <button className="btn ghost sm" onClick={toggleLang}>
            🌐 {lang === 'es' ? 'EN' : 'ES'}
          </button>
          <button className="btn ghost sm" onClick={toggleTheme} aria-label={tr('Tema claro/oscuro', 'Light/dark theme')}>
            {theme === 'dark' ? '☀️' : '🌙'}
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
      </div>
      {children}
      <footer className="footer">
        <div className="container row between">
          <span className="row" style={{ gap: 8 }}>
            <span className="logo-tile" style={{ width: 24, height: 24, fontSize: 12, borderRadius: 7 }}>⚡</span>© {new Date().getFullYear()} MicroSuite · {tr('Pagos seguros con PayPal', 'Secure payments with PayPal')}
          </span>
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
  const minPrice = Math.min(...catalog.products.flatMap((p) => p.plans.map((x) => x.price)))
  const pre = lang === 'en' ? '/en' : ''
  return (
    <PublicLayout>
      <div className="grid-bg">
        <div className="container">
          <section className="hero center">
            <div className="pill">
              <b>{tr('NUEVO', 'NEW')}</b> {tr(`${catalog.trial_days} días gratis en todas las apps · sin tarjeta`, `${catalog.trial_days}-day free trial on every app · no card`)}
            </div>
            <h1 className="gradient-text">{tr('Herramientas simples que te ahorran dinero desde el primer mes', 'Simple tools that save you money from month one')}</h1>
            <p className="lead">
              {tr(
                '10 micro apps para pymes, equipos de TI y profesionales: licencias de Microsoft 365, inventario, cobranza, vencimientos, DIAN, Habeas Data y más.',
                '10 micro apps for SMBs, IT teams and professionals: Microsoft 365 licenses, assets, collections, expiry alerts, help desk and more.',
              )}
            </p>
            <div className="row mt">
              <Link className="btn primary lg" to="/signup">
                {tr('Empezar gratis', 'Start free')} →
              </Link>
              <a className="btn lg" href="#apps">
                {tr('Explorar apps', 'Explore apps')}
              </a>
            </div>
            <div className="trust">
              <span>{tr('Configuración en minutos', 'Set up in minutes')}</span>
              <span>{tr('Español e inglés', 'Spanish & English')}</span>
              <span>{tr('Pagos seguros con PayPal', 'Secure PayPal payments')}</span>
              <span>{tr('Cancela cuando quieras', 'Cancel anytime')}</span>
            </div>
            <div className="metrics">
              <div>
                <b>10</b>
                <span>{tr('apps especializadas', 'focused apps')}</span>
              </div>
              <div>
                <b>{catalog.trial_days} {tr('días', 'days')}</b>
                <span>{tr('de prueba gratis', 'free trial')}</span>
              </div>
              <div>
                <b>{money(minPrice)}</b>
                <span>{tr('precio inicial al mes', 'starting price per month')}</span>
              </div>
              <div>
                <b>24/7</b>
                <span>{tr('alertas automáticas', 'automatic alerts')}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
      <div className="container">
        <section className="section-pad" id="apps">
          <div className="section-head center" style={{ textAlign: 'center' }}>
            <div className="eyebrow">{tr('El catálogo', 'The catalog')}</div>
            <h2>{tr('Elige la app que resuelve tu problema hoy', 'Pick the app that solves your problem today')}</h2>
            <p className="muted">{tr('Cada app funciona sola. Úsalas juntas con la misma cuenta.', 'Each app works on its own. Use them together with one account.')}</p>
          </div>
          <div className="grid grid-3">
            {catalog.products.map((p) => (
              <Link key={p.slug} to={`${pre}/p/${p.slug}`} className="card product-card" style={{ '--c': p.color } as React.CSSProperties}>
                <div className="row">
                  <div className="product-icon">{p.icon}</div>
                  <div>
                    <h3 style={{ margin: 0 }}>{p.name}</h3>
                    <span className="muted small">
                      {tr('desde', 'from')} {money(Math.min(...p.plans.map((x) => x.price)))}/{tr('mes', 'mo')}
                      {p.market === 'co' && ' · 🇨🇴'}
                    </span>
                  </div>
                </div>
                <p style={{ margin: 0 }} className="muted">
                  {pick(p.tagline)}
                </p>
                <span className="go">{tr('Ver app', 'View app')} →</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="section-pad">
          <div className="section-head center" style={{ textAlign: 'center' }}>
            <div className="eyebrow">{tr('Cómo funciona', 'How it works')}</div>
            <h2>{tr('De cero a resultados en tres pasos', 'From zero to results in three steps')}</h2>
          </div>
          <div className="grid grid-3 steps">
            {[
              [tr('Crea tu cuenta', 'Create your account'), tr('Elige la app y regístrate en 30 segundos. No pedimos tarjeta.', 'Pick the app and sign up in 30 seconds. No card required.')],
              [tr('Conecta o carga tus datos', 'Connect or load your data'), tr('Conecta Microsoft 365 o importa tu información desde Excel.', 'Connect Microsoft 365 or import your data from a spreadsheet.')],
              [tr('Recibe alertas y ahorra', 'Get alerts and save'), tr('La app trabaja sola: te avisa por correo antes de cada vencimiento o pérdida.', 'The app works for you: email alerts before every deadline or loss.')],
            ].map(([t, d]) => (
              <div key={t} className="card step">
                <h3>{t}</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {d}
                </p>
              </div>
            ))}
          </div>
        </section>
        <section className="section-pad">
          <div className="cta-band">
            <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 36px)' }}>{tr('Pruébalo hoy, sin riesgo', 'Try it today, risk free')}</h2>
            <p className="muted">{tr(`${catalog.trial_days} días gratis. Si no te ahorra tiempo o dinero, no pagas nada.`, `${catalog.trial_days} days free. If it doesn't save you time or money, you pay nothing.`)}</p>
            <Link className="btn primary lg mt" to="/signup">
              {tr('Crear cuenta gratis', 'Create free account')} →
            </Link>
          </div>
        </section>
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
        <section className="hero hero-split">
          <div>
            <div className="pill">
              <b>{p.icon}</b> {p.name} · {tr(`${catalog.trial_days} días gratis`, `${catalog.trial_days}-day free trial`)}
            </div>
            <h1 className="gradient-text">{pick(p.tagline)}</h1>
            <p className="lead">{pick(p.description)}</p>
            <div className="row mt">
              <Link className="btn primary lg" to={start}>
                {tr(`Probar gratis ${catalog.trial_days} días`, `Try free for ${catalog.trial_days} days`)} →
              </Link>
              <a className="btn lg" href="#precios">
                {tr('Ver precios', 'See pricing')}
              </a>
            </div>
            <div className="trust">
              <span>{tr('Sin tarjeta de crédito', 'No credit card')}</span>
              <span>{tr('Configuración en minutos', 'Set up in minutes')}</span>
              <span>{tr('Cancela cuando quieras', 'Cancel anytime')}</span>
            </div>
          </div>
          <div className="card preview" style={{ '--c': p.color } as React.CSSProperties}>
            <div className="preview-bar">
              <i />
              <i />
              <i />
              <span className="small muted" style={{ marginLeft: 8 }}>
                {p.name}
              </span>
            </div>
            <div className="preview-body">
              <div className="row between">
                <div className="row">
                  <div className="product-icon">{p.icon}</div>
                  <div>
                    <b>{p.name}</b>
                    <div className="small muted">
                      {tr('desde', 'from')} {money(Math.min(...p.plans.map((x) => x.price)))}/{tr('mes', 'mo')}
                    </div>
                  </div>
                </div>
                <span className="badge ok">● {tr('Activo', 'Live')}</span>
              </div>
              {(pick(p.features) || []).slice(0, 4).map((f) => (
                <div key={f} className="preview-row">
                  {f}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="section-pad">
          <div className="section-head">
            <div className="eyebrow">{tr('Funciones', 'Features')}</div>
            <h2>{tr('Qué incluye', "What's included")}</h2>
          </div>
          <div className="grid grid-3">
            {(pick(p.features) || []).map((f, i) => (
              <div key={f} className="card flat feature">
                <span className="dot">{String(i + 1).padStart(2, '0')}</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="section-pad" id="precios">
          <div className="section-head center" style={{ textAlign: 'center' }}>
            <div className="eyebrow">{tr('Precios', 'Pricing')}</div>
            <h2>{tr('Precios simples', 'Simple pricing')}</h2>
            <p className="muted">{tr('Empieza con la prueba gratis del plan más elegido.', 'Start with a free trial of the most popular plan.')}</p>
          </div>
          <PricingTable product={p} onPick={() => (location.href = start)} />
        </section>
        <section className="section-pad">
          <div className="section-head">
            <div className="eyebrow">FAQ</div>
            <h2>{tr('Preguntas frecuentes', 'Frequently asked questions')}</h2>
          </div>
          <div className="stack">
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
        <section className="section-pad">
          <div className="cta-band" style={{ '--accent': p.color } as React.CSSProperties}>
            <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 36px)' }}>{tr(`Empieza hoy con ${p.name}`, `Start today with ${p.name}`)}</h2>
            <p className="muted">{tr(`${catalog.trial_days} días gratis, sin tarjeta.`, `${catalog.trial_days} days free, no card.`)}</p>
            <Link className="btn primary lg mt" to={start}>
              {tr('Crear cuenta gratis', 'Create free account')} →
            </Link>
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
            <p>{tr('En las páginas públicas usamos cookies de analítica y de publicidad (Google Analytics y, si están activos, los píxeles de Meta y LinkedIn) para medir visitas y saber qué anuncios funcionan. No se usan en el contenido de tus apps. Puedes bloquearlas desde la configuración de tu navegador.', 'On public pages we use analytics and advertising cookies (Google Analytics and, when enabled, the Meta and LinkedIn pixels) to measure visits and which ads work. They are not used on your app data. You can block them in your browser settings.')}</p>
            <p>{tr('Puedes solicitar la consulta, corrección o eliminación de tus datos escribiendo al correo de soporte.', 'You can request access, correction or deletion of your data by writing to the support email.')}</p>
          </>
        )}
      </div>
    </PublicLayout>
  )
}
