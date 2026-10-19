// Prueba de humo de punta a punta (requiere PAYPAL_MODE=mock y un superadmin admin@example.com / AdminPass123).
// Uso: cd e2e && npm i && npx playwright install chromium && BASE_URL=http://localhost:8080 npm run smoke
import { chromium } from 'playwright'
const BASE = process.env.BASE_URL || 'http://localhost:8080'
const OUT = process.argv[2] || '.'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es-CO' })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(`pageerror ${page.url()}: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && problems.push(`console ${page.url()}: ${m.text()}`))
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: false })
const errBoxes = async (label) => {
  const n = await page.locator('.alert.error').count()
  if (n) problems.push(`${label}: ${await page.locator('.alert.error').first().innerText()}`)
}

await page.goto(BASE)
await page.waitForSelector('.product-card')
await shot('01-home')
await page.goto(`${BASE}/p/licencialens`)
await page.waitForSelector('.plan-card')
await shot('02-landing-licencialens')

// Registro por UI
await page.goto(`${BASE}/signup?product=venceya`)
await page.fill('input[autocomplete=name]', 'Erick Prueba')
await page.fill('input[autocomplete=organization]', 'Empresa Demo SAS')
const email = `demo${Date.now()}@example.com`
await page.fill('input[type=email]', email)
await page.fill('input[type=password]', 'Clave12345')
await page.click('button.primary')
await page.waitForURL(/\/app\/venceya/)
await page.waitForSelector('.stat')
await errBoxes('venceya dashboard')

// Crear entidad y documento por la UI
await page.goto(`${BASE}/app/venceya/entities`)
await page.click('text=+ Nuevo')
await page.fill('#f-name', 'Camión ABC123')
await page.fill('#f-reference', 'ABC123')
await page.click('.modal button.primary')
await page.waitForSelector('td:has-text("Camión ABC123")')
await page.goto(`${BASE}/app/venceya/documents`)
await page.click('text=+ Nuevo')
await page.waitForSelector('#f-entity_id option:nth-child(2)', { state: 'attached' })
await page.selectOption('#f-entity_id', { index: 1 })
await page.fill('#f-doc_type', 'SOAT')
const d = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10)
await page.fill('#f-expires_on', d)
await page.click('.modal button.primary')
await page.waitForSelector('td:has-text("SOAT")')
await page.goto(`${BASE}/app/venceya`)
await page.waitForSelector('td:has-text("SOAT")')
await shot('03-venceya-dashboard')

// Activar todas las demás apps
const token = await page.evaluate(() => localStorage.getItem('ms_token'))
const prods = ['licencialens', 'offboardkit', 'assettrack', 'cobrabot', 'tributalerta', 'lineacontrol', 'datosok', 'sst0312', 'helpdesk']
for (const p of prods) {
  await page.evaluate(async ([p, t]) => fetch(`/api/auth/activate/${p}`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } }), [p, token])
}
const pages = {
  licencialens: ['', 'history', 'settings'],
  offboardkit: ['', 'runs', 'settings'],
  assettrack: ['', 'people', 'handovers'],
  cobrabot: ['', 'invoices', 'customers', 'settings'],
  tributalerta: ['', 'clients', 'custom'],
  lineacontrol: ['', 'lines', 'bills'],
  datosok: ['', 'requests', 'consents', 'policies'],
  sst0312: ['', 'actions'],
  helpdesk: ['', 'clients', 'report', 'settings'],
}
for (const [p, subs] of Object.entries(pages)) {
  for (const s of subs) {
    await page.goto(`${BASE}/app/${p}${s ? '/' + s : ''}`)
    await page.waitForSelector('h1', { timeout: 10000 }).catch(() => problems.push(`sin h1 en ${p}/${s}`))
    await page.waitForTimeout(400)
    await errBoxes(`${p}/${s}`)
    if (!s) await shot(`10-${p}`)
  }
}

// AssetTrack: crear persona, activo y acta; firmar desde enlace público
const api = (path, body, method) => page.evaluate(async ([path, body, method, t]) => {
  const r = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  return r.json()
}, [path, body, method, token])
const person = await api('/api/assettrack/people', { name: 'Laura Gómez', email: 'laura@example.com', area: 'Ventas' })
const asset = await api('/api/assettrack/assets', { tag: 'PC-001', category: 'Portátil', brand: 'Lenovo', model: 'ThinkPad E14', serial: 'PF3ABC12' })
const ho = await api('/api/assettrack/handovers', { asset_id: asset.id, person_id: person.id, accessories: 'Cargador, mouse', send_email: false })
await page.goto(ho.sign_url.replace('http://localhost:8080', BASE))
await page.waitForSelector('canvas.sigpad')
await page.fill('input', 'Laura Gómez')
const box = await page.locator('canvas.sigpad').boundingBox()
await page.mouse.move(box.x + 30, box.y + 120); await page.mouse.down()
for (let i = 0; i < 30; i++) await page.mouse.move(box.x + 30 + i * 12, box.y + 100 + Math.sin(i / 3) * 40)
await page.mouse.up()
await page.check('input[type=checkbox]')
await page.click('button.primary')
await page.waitForSelector('.alert.ok')
await shot('20-acta-firmada')

// SST: empresa + evaluación desde la UI
const comp = await api('/api/sst0312/companies', { name: 'Constructora Demo', workers: 30, risk_level: 3 })
await page.goto(`${BASE}/app/sst0312/company/${comp.id}`)
await page.click('text=+ Nueva autoevaluación')
await page.waitForURL(/assessment/)
await page.waitForSelector('.toggle button')
const toggles = page.locator('.card.flat .toggle')
const n = await toggles.count()
for (let i = 0; i < n; i++) await toggles.nth(i).locator('button').nth(i % 4 === 0 ? 1 : 0).click()
await page.click('.page-head button.primary')
await page.waitForTimeout(600)
await shot('21-sst-evaluacion')
await page.click('text=Informe')
await page.waitForSelector('text=Informe de autoevaluación')
await shot('22-sst-informe')

// DatosOK: política + formulario público
await api('/api/datosok/policies', { version: '1.0', text: 'Autorizo a Empresa Demo SAS a tratar mis datos...', is_current: true, purposes: [{ key: 'servicio', label: 'Prestación del servicio', required: true }, { key: 'mkt', label: 'Marketing', required: false }] })
const me = await api('/api/auth/me')
await page.goto(`${BASE}/datos/${me.tenant.public_key}`)
await page.waitForSelector('text=Prestación del servicio')
await shot('23-datos-publico')

// HelpDesk: portal público
await page.goto(`${BASE}/soporte/${me.tenant.public_key}`)
await page.fill('form input >> nth=0', 'Pedro Pérez')
await page.fill('form input[type=email]', 'pedro@cliente.com')
await page.fill('form input >> nth=2', 'No funciona la impresora')
await page.fill('form textarea', 'La impresora del piso 2 no imprime')
await page.click('form button.primary')
await page.waitForURL(/\/t\//)
await shot('24-ticket-publico')

// Cobro (modo mock): elegir plan
await page.goto(`${BASE}/app/billing?product=venceya`)
await page.waitForSelector('.plan-card')
await shot('30-billing-planes')
await page.locator('.plan-card button').nth(1).click()
await page.waitForURL(/mock=ok/)
await page.waitForSelector('text=Activa')
await shot('31-billing-activo')

// Superadmin
await page.evaluate(() => localStorage.removeItem('ms_token'))
await page.goto(`${BASE}/login`)
await page.fill('input[type=email]', 'admin@example.com')
await page.fill('input[type=password]', 'AdminPass123')
await page.click('button.primary')
await page.waitForURL(/\/app/)
await page.goto(`${BASE}/app/admin`)
await page.waitForSelector('.stat')
await shot('40-superadmin')

// Móvil
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${BASE}/p/venceya`)
await page.waitForSelector('.plan-card')
await shot('50-movil-landing')

console.log(JSON.stringify({ problems }, null, 1))
await browser.close()
