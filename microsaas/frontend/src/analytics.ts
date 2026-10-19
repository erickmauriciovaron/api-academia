// Analítica opcional (Google Analytics 4 y/o Plausible), configurada en Superadmin → Integraciones.
type Config = { ga4_id?: string; plausible_domain?: string; plausible_src?: string }

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    plausible?: (event: string, opts?: { props?: Record<string, unknown>; revenue?: { currency: string; amount: number } }) => void
  }
}

let ready = false

function addScript(src: string, attrs: Record<string, string> = {}) {
  const s = document.createElement('script')
  s.async = true
  s.src = src
  Object.entries(attrs).forEach(([k, v]) => s.setAttribute(k, v))
  document.head.appendChild(s)
}

export function initAnalytics(cfg: Config | undefined) {
  if (ready || !cfg) return
  if (cfg.ga4_id && /^G-[A-Z0-9]+$/i.test(cfg.ga4_id)) {
    addScript(`https://www.googletagmanager.com/gtag/js?id=${cfg.ga4_id}`)
    window.dataLayer = window.dataLayer || []
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments)
    }
    window.gtag('js', new Date())
    window.gtag('config', cfg.ga4_id, { send_page_view: false })
  }
  if (cfg.plausible_domain) {
    addScript(cfg.plausible_src || 'https://plausible.io/js/script.js', { 'data-domain': cfg.plausible_domain })
    window.plausible =
      window.plausible ||
      function (...args: unknown[]) {
        ;((window.plausible as unknown as { q?: unknown[] }).q = (window.plausible as unknown as { q?: unknown[] }).q || []).push(args)
      }
  }
  ready = true
}

export function trackPageview(path: string) {
  // Las páginas privadas (/app) no se registran con su ruta exacta.
  const clean = path.startsWith('/app/') ? '/app' : path
  window.gtag?.('event', 'page_view', { page_path: clean, page_location: location.origin + clean })
}

/** Eventos de negocio: sign_up, begin_checkout, purchase. */
export function track(event: 'sign_up' | 'begin_checkout' | 'purchase', params: { product?: string; plan?: string; value?: number } = {}) {
  const value = params.value
  window.gtag?.('event', event, { ...params, ...(value !== undefined ? { currency: 'USD', value } : {}) })
  window.plausible?.(event, { props: { product: params.product, plan: params.plan }, ...(value !== undefined ? { revenue: { currency: 'USD', amount: value } } : {}) })
}

export function setSeo(title: string, description?: string) {
  document.title = title
  if (description) {
    let m = document.querySelector('meta[name="description"]')
    if (!m) {
      m = document.createElement('meta')
      m.setAttribute('name', 'description')
      document.head.appendChild(m)
    }
    m.setAttribute('content', description)
  }
}
