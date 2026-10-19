// Genera HTML estático por página pública (ES y EN) para SEO y vistas previas en redes.
// Se ejecuta después de `vite build`. `__SITE__` lo reemplaza Nginx por https://<dominio>.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist')
const { products, trial_days: trialDays } = JSON.parse(fs.readFileSync(path.join(root, 'seo', 'catalog.json'), 'utf8'))
const shell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const money = (n) => `US$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`
const T = {
  es: {
    suiteTitle: 'MicroSuite: 10 micro apps para pymes y equipos de TI',
    suiteDesc: `Licencias Microsoft 365, inventario TI, vencimientos, cobranza, calendario DIAN, Habeas Data, SG-SST y mesa de ayuda. ${trialDays} días gratis, sin tarjeta.`,
    hero: 'Herramientas simples que te ahorran dinero desde el primer mes',
    from: 'desde', mo: 'mes', yr: 'año', try: `Probar gratis ${trialDays} días`, pricing: 'Precios', faq: 'Preguntas frecuentes', features: 'Qué incluye', allApps: 'Todas las apps',
  },
  en: {
    suiteTitle: 'MicroSuite: 10 micro apps for SMBs and IT teams',
    suiteDesc: `Microsoft 365 license savings, IT asset inventory, expiry alerts, invoice reminders, help desk and more. ${trialDays}-day free trial, no card.`,
    hero: 'Simple tools that save you money from month one',
    from: 'from', mo: 'mo', yr: 'yr', try: `Try free for ${trialDays} days`, pricing: 'Pricing', faq: 'FAQ', features: "What's included", allApps: 'All apps',
  },
}

function head({ lang, title, desc, pathEs, pathEn, image, jsonld }) {
  const self = lang === 'es' ? pathEs : pathEn
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="__SITE__${self}" />`,
    `<link rel="alternate" hreflang="es" href="__SITE__${pathEs}" />`,
    `<link rel="alternate" hreflang="en" href="__SITE__${pathEn}" />`,
    `<link rel="alternate" hreflang="x-default" href="__SITE__${pathEs}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="MicroSuite" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="__SITE__${self}" />`,
    `<meta property="og:image" content="__SITE__${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${lang === 'es' ? 'es_CO' : 'en_US'}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
    `<meta name="twitter:image" content="__SITE__${image}" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ')
}

function page({ lang, headHtml, body }) {
  let html = shell.replace(/<html lang="[^"]*">/, `<html lang="${lang}">`)
  html = html.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta name="description"[^>]*>/, '')
  html = html.replace('</head>', `    ${headHtml}\n  </head>`)
  // Contenido visible para buscadores y navegadores sin JS; React lo reemplaza al montar.
  html = html.replace('<div id="root"></div>', `<div id="root"><main style="max-width:960px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif">${body}</main></div>`)
  return html
}

function write(rel, html) {
  const file = path.join(dist, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, html)
}

for (const lang of ['es', 'en']) {
  const t = T[lang]
  const pre = lang === 'en' ? '/en' : ''

  // Inicio (catálogo)
  const list = products
    .map((p) => `<li><a href="${pre}/p/${p.slug}"><strong>${esc(p.name)}</strong></a>: ${esc(p.tagline[lang])} (${t.from} ${money(Math.min(...p.plans.map((x) => x.price)))}/${t.mo})</li>`)
    .join('')
  const homeLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: t.suiteTitle,
    itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `__SITE__${pre}/p/${p.slug}`, name: p.name })),
  }
  write(
    lang === 'es' ? 'index.seo.html' : 'en/index.html',
    page({
      lang,
      headHtml: head({ lang, title: t.suiteTitle, desc: t.suiteDesc, pathEs: '/', pathEn: '/en', image: '/og/suite.png', jsonld: homeLd }),
      body: `<h1>${esc(t.hero)}</h1><p>${esc(t.suiteDesc)}</p><ul>${list}</ul>`,
    }),
  )

  // Landing de cada app
  for (const p of products) {
    const prices = p.plans.map((x) => x.price)
    const title = `${p.name}: ${p.tagline[lang]}`
    const desc = p.description[lang]
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: p.name,
      description: desc,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: `__SITE__${pre}/p/${p.slug}`,
      image: `__SITE__/og/${p.slug}.png`,
      inLanguage: lang,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        lowPrice: Math.min(...prices),
        highPrice: Math.max(...prices),
        offerCount: p.plans.length,
      },
    }
    const faqLd = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: (p.faq[lang] || []).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    }
    const plans = p.plans
      .map((pl) => `<li><strong>${esc(pl.name)}</strong>: ${money(pl.price)}/${t.mo} · ${money(pl.price_year)}/${t.yr} (${esc((pl.features[lang] || []).join(', '))})</li>`)
      .join('')
    const body =
      `<p><a href="${pre || '/'}">${esc(t.allApps)}</a></p>` +
      `<h1>${esc(p.tagline[lang])}</h1><p>${esc(desc)}</p>` +
      `<p><a href="/signup?product=${p.slug}">${esc(t.try)}</a></p>` +
      `<h2>${esc(t.features)}</h2><ul>${(p.features[lang] || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` +
      `<h2>${esc(t.pricing)}</h2><ul>${plans}</ul>` +
      `<h2>${esc(t.faq)}</h2>${(p.faq[lang] || []).map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}`
    write(
      `${pre.slice(1)}${pre ? '/' : ''}p/${p.slug}/index.html`,
      page({
        lang,
        headHtml: head({ lang, title, desc, pathEs: `/p/${p.slug}`, pathEn: `/en/p/${p.slug}`, image: `/og/${p.slug}.png`, jsonld: [ld, faqLd] }),
        body,
      }),
    )
  }
}
console.log(`Prerender SEO: ${products.length * 2 + 2} páginas`)
