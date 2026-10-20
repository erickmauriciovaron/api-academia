import { useEffect, useState } from 'react'
import { api } from '../api'
import ResourcePage, { FieldDef } from '../components/ResourcePage'
import { Badge, ErrorBox, GettingStarted, PageHead, Spinner, Stat, useAction, useAsync } from '../components/ui'
import { money, tr, useLang } from '../i18n'

export function Dashboard() {
  useLang()
  const d = useAsync(() => api<any>('/api/cobrabot/dashboard'), [])
  if (!d.data) return d.error ? <ErrorBox error={d.error} /> : <Spinner />
  const currencies = Object.entries<any>(d.data.by_currency)
  return (
    <div>
      <PageHead title={tr('Cartera', 'Receivables')} subtitle={tr('Recordatorios automáticos antes y después del vencimiento.', 'Automatic reminders before and after due date.')} />
      {currencies.length === 0 && (
        <GettingStarted
          intro={tr('CobraBot les recuerda a tus clientes que te paguen, por correo y WhatsApp, con tu enlace de pago. Configúralo en 3 pasos:', 'CobraBot reminds your customers to pay you by email and WhatsApp, with your payment link. Set it up in 3 steps:')}
          steps={[
            { title: tr('Agrega tus clientes', 'Add your customers'), text: tr('Nombre, correo y WhatsApp de quien te debe.', 'Name, email and WhatsApp of who owes you.'), to: '/app/cobrabot/customers', cta: tr('Ir a Clientes', 'Go to Customers') },
            { title: tr('Carga las facturas pendientes', 'Load open invoices'), text: tr('Valor, moneda y fecha de vencimiento. También desde CSV.', 'Amount, currency and due date. Or import a CSV.'), to: '/app/cobrabot/invoices', cta: tr('Ir a Facturas', 'Go to Invoices') },
            { title: tr('Pon tu enlace de pago', 'Add your payment link'), text: tr('PayPal, Wompi o datos de transferencia, y ajusta los textos y días de aviso.', 'PayPal, Wompi or bank details, then tune texts and timing.'), to: '/app/cobrabot/settings', cta: tr('Ir a Recordatorios', 'Go to Reminders') },
          ]}
        />
      )}
      {currencies.map(([cur, v]) => (
        <div key={cur} className="grid grid-3 mb">
          <Stat label={`${tr('Por cobrar', 'Open')} (${cur})`} value={money(v.open, cur)} />
          <Stat label={`${tr('Vencida', 'Overdue')} (${cur})`} value={money(v.overdue, cur)} tone="danger" />
          <Stat label={`${tr('Recuperado 30 días', 'Recovered 30 days')} (${cur})`} value={money(v.recovered_30d, cur)} tone="ok" />
        </div>
      ))}
      {d.data.overdue.length > 0 && (
        <>
          <h2>{tr('Facturas vencidas', 'Overdue invoices')}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr('Factura', 'Invoice')}</th>
                  <th>{tr('Cliente', 'Customer')}</th>
                  <th>{tr('Valor', 'Amount')}</th>
                  <th>{tr('Días vencida', 'Days overdue')}</th>
                  <th>{tr('Recordatorios', 'Reminders')}</th>
                </tr>
              </thead>
              <tbody>
                {d.data.overdue.map((i: any) => (
                  <tr key={i.id}>
                    <td>{i.number}</td>
                    <td>{i.customer_name}</td>
                    <td>{money(i.amount, i.currency)}</td>
                    <td>
                      <Badge tone="danger">{i.days_overdue}</Badge>
                    </td>
                    <td>{i.reminders_sent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export function Customers() {
  useLang()
  const fields: FieldDef[] = [
    { name: 'name', label: tr('Nombre', 'Name'), required: true },
    { name: 'email', label: tr('Correo', 'Email'), type: 'email' },
    { name: 'phone', label: 'WhatsApp', hint: tr('Con indicativo, ej. 573001234567', 'With country code') },
    { name: 'tax_id', label: tr('NIT / ID fiscal', 'Tax ID') },
    { name: 'notes', label: tr('Notas', 'Notes'), type: 'textarea', list: false },
  ]
  return <ResourcePage title={tr('Clientes', 'Customers')} endpoint="/api/cobrabot/customers" fields={fields} importable />
}

export function Invoices() {
  useLang()
  const { run } = useAction()
  const fields: FieldDef[] = [
    { name: 'customer_id', label: tr('Cliente', 'Customer'), type: 'ref', ref: { endpoint: '/api/cobrabot/customers', label: 'name' }, required: true, filter: true },
    { name: 'number', label: tr('N.º factura', 'Invoice #'), required: true },
    { name: 'amount', label: tr('Valor', 'Amount'), type: 'money', required: true },
    { name: 'currency', label: tr('Moneda', 'Currency'), type: 'select', options: [['USD', 'USD'], ['COP', 'COP'], ['MXN', 'MXN'], ['EUR', 'EUR'], ['PEN', 'PEN'], ['CLP', 'CLP']], default: 'USD', required: true, list: false },
    { name: 'issued_on', label: tr('Emitida', 'Issued'), type: 'date', list: false },
    { name: 'due_on', label: tr('Vence', 'Due'), type: 'date', required: true },
    {
      name: 'status',
      label: tr('Estado', 'Status'),
      type: 'select',
      options: [['open', tr('Pendiente', 'Open')], ['paid', tr('Pagada', 'Paid')], ['void', tr('Anulada', 'Void')]],
      default: 'open',
      filter: true,
      render: (r) => (r.status === 'paid' ? <Badge tone="ok">{tr('Pagada', 'Paid')}</Badge> : r.status === 'void' ? <Badge>{tr('Anulada', 'Void')}</Badge> : r.days_overdue > 0 ? <Badge tone="danger">{tr(`Vencida ${r.days_overdue} d`, `${r.days_overdue} d overdue`)}</Badge> : <Badge tone="info">{tr('Pendiente', 'Open')}</Badge>),
    },
    { name: 'payment_url', label: tr('Enlace de pago (opcional)', 'Payment link (optional)'), list: false, hint: tr('Si está vacío se usa el enlace general de Configuración.', 'If empty, the default link from Settings is used.') },
    { name: 'reminders_sent', label: tr('Recordatorios', 'Reminders'), form: false },
    { name: 'notes', label: tr('Notas', 'Notes'), type: 'textarea', list: false },
  ]
  return (
    <ResourcePage
      title={tr('Facturas', 'Invoices')}
      endpoint="/api/cobrabot/invoices"
      fields={fields}
      importable
      importHint={tr('Columnas mínimas: customer_id, number, amount, due_on (AAAA-MM-DD).', 'Minimum columns: customer_id, number, amount, due_on (YYYY-MM-DD).')}
      rowActions={(r, reload) =>
        r.status === 'open' && (
          <>
            <button className="btn sm" onClick={() => run(() => api(`/api/cobrabot/invoices/${r.id}/remind`, { method: 'POST' }), tr('Recordatorio enviado', 'Reminder sent')).then(reload)}>
              📨
            </button>{' '}
            <button className="btn sm" onClick={() => run(() => api(`/api/cobrabot/invoices/${r.id}`, { method: 'PATCH', body: { status: 'paid' } }), tr('Marcada como pagada', 'Marked as paid')).then(reload)}>
              ✓ {tr('Pagada', 'Paid')}
            </button>
          </>
        )
      }
    />
  )
}

export function Settings() {
  useLang()
  const s = useAsync(() => api<any>('/api/cobrabot/settings'), [])
  const [f, setF] = useState<any>(null)
  const { busy, run } = useAction()
  useEffect(() => {
    if (s.data) setF({ ...s.data, offsets: s.data.offsets.join(', ') })
  }, [s.data])
  if (!f) return s.error ? <ErrorBox error={s.error} /> : <Spinner />
  return (
    <div style={{ maxWidth: 720 }}>
      <PageHead title={tr('Configuración de recordatorios', 'Reminder settings')} />
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault()
          const offsets = String(f.offsets).split(',').map((x: string) => parseInt(x.trim(), 10)).filter((x: number) => !isNaN(x))
          run(() => api('/api/cobrabot/settings', { method: 'PUT', body: { ...f, offsets } }), tr('Guardado', 'Saved'))
        }}
      >
        <label className="field">
          {tr('Días respecto al vencimiento', 'Days relative to due date')}
          <input value={f.offsets} onChange={(e) => setF({ ...f, offsets: e.target.value })} />
          <span className="hint">{tr('Negativo = antes, 0 = el día, positivo = después. Ej: -3, 0, 3, 7, 15, 30', 'Negative = before, 0 = due day, positive = after. E.g. -3, 0, 3, 7, 15, 30')}</span>
        </label>
        <label className="field">
          {tr('Enlace de pago general', 'Default payment link')}
          <input value={f.payment_url} onChange={(e) => setF({ ...f, payment_url: e.target.value })} placeholder="https://paypal.me/tuempresa" />
        </label>
        <label className="field">
          {tr('Nombre del remitente', 'Sender name')}
          <input value={f.sender_name} onChange={(e) => setF({ ...f, sender_name: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.checked })} /> {tr('Enviar también por WhatsApp', 'Also send via WhatsApp')}
        </label>
        <label className="field">
          {tr('Asunto', 'Subject')}
          <input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        </label>
        <label className="field">
          {tr('Mensaje', 'Message')}
          <textarea rows={9} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <span className="hint">{'{cliente} {numero} {monto} {moneda} {vence} {dias} {estado} {enlace} {empresa}'}</span>
        </label>
        <button className="btn primary" disabled={busy}>
          {tr('Guardar', 'Save')}
        </button>
      </form>
      <p className="muted small mt">{tr('Los recordatorios se envían automáticamente todos los días a las 7:00 a. m. (hora de Colombia).', 'Reminders are sent automatically every day at 7:00 am (Colombia time).')}</p>
    </div>
  )
}
