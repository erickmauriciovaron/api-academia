// Analítica y píxeles de publicidad opcionales (GA4, Plausible, Meta, LinkedIn), configurados en Superadmin → Integraciones.
type Config = { ga4_id?: string; plausible_domain?: string; plausible_src?: string; meta_pixel_id?: string; linkedin_partner_id?: string }

type Fbq = ((...args: unknown[]) => void) & { queue: unknown[]; loaded: boolean; version: string; push: Fbq; callMethod?: (...args: unknown[]) => void }
type Lintrk = ((...args: unknown[]) => void) & { q: unknown[] }

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    plausible?: (event: string, opts?: { props?: Record<string, unknown>; revenue?: { currency: string; amount: number } }) => void
    fbq?: Fbq
    _fbq?: Fbq
    _linkedin_data_partner_ids?: string[]
    lintrk?: Lintrk
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
  if (cfg.meta_pixel_id && /^\d{6,20}$/.test(cfg.meta_pixel_id)) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args)
      else fbq.queue.push(args)
    } as Fbq
    fbq.push = fbq
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.queue = []
    window.fbq = window._fbq = fbq
    addScript('https://connect.facebook.net/en_US/fbevents.js')
    fbq('init', cfg.meta_pixel_id)
  }
  if (cfg.linkedin_partner_id && /^\d{3,12}$/.test(cfg.linkedin_partner_id)) {
    window._linkedin_data_partner_ids = [...(window._linkedin_data_partner_ids || []), cfg.linkedin_partner_id]
    const lintrk = function (...args: unknown[]) {
      lintrk.q.push(args)
    } as Lintrk
    lintrk.q = []
    window.lintrk = lintrk
    addScript('https://snap.licdn.com/li.lms-analytics/insight.min.js')
  }
  ready = true
}

export function trackPageview(path: string) {
  // Las páginas privadas (/app) no se registran con su ruta exacta.
  const clean = path.startsWith('/app/') ? '/app' : path
  window.gtag?.('event', 'page_view', { page_path: clean, page_location: location.origin + clean })
  window.fbq?.('track', 'PageView')
}

// Nombres de los eventos estándar de Meta para cada evento de negocio.
const META_EVENTS = { sign_up: 'CompleteRegistration', begin_checkout: 'InitiateCheckout', purchase: 'Purchase' } as const

/** Eventos de negocio: sign_up, begin_checkout, purchase. */
export function track(event: 'sign_up' | 'begin_checkout' | 'purchase', params: { product?: string; plan?: string; value?: number } = {}) {
  const value = params.value
  window.gtag?.('event', event, { ...params, ...(value !== undefined ? { currency: 'USD', value } : {}) })
  window.plausible?.(event, { props: { product: params.product, plan: params.plan }, ...(value !== undefined ? { revenue: { currency: 'USD', amount: value } } : {}) })
  window.fbq?.('track', META_EVENTS[event], { content_name: params.product, ...(value !== undefined ? { currency: 'USD', value } : {}) })
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
