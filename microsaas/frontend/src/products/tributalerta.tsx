import { useState } from 'react'
import { api } from '../api'
import ResourcePage, { FieldDef } from '../components/ResourcePage'
import { Badge, Empty, ErrorBox, PageHead, Spinner, Stat, useAction, useAsync } from '../components/ui'
import { fmtDate, tr, useLang } from '../i18n'

function useObligations() {
  return useAsync(() => api<Record<string, string>>('/api/tributalerta/obligations'), [])
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function Deadlines() {
  useLang()
  const today = new Date()
  const [start, setStart] = useState(iso(new Date(today.getTime() - 7 * 864e5)))
  const [end, setEnd] = useState(iso(new Date(today.getTime() + 60 * 864e5)))
  const [hideFiled, setHideFiled] = useState(true)
  const list = useAsync(() => api<any[]>(`/api/tributalerta/deadlines?start=${start}&end=${end}`), [start, end])
  const years = useAsync(() => api<number[]>('/api/tributalerta/calendar/years'), [])
  const { run } = useAction()
  const items = (list.data || []).filter((x) => !hideFiled || !x.filed)
  const pending = (list.data || []).filter((x) => !x.filed)

  const toggle = (x: any) => {
    if (x.kind === 'custom') return run(() => api(`/api/tributalerta/custom/${x.custom_id}`, { method: 'PATCH', body: { done: !x.filed } })).then(list.reload)
    if (x.filed) return run(() => api(`/api/tributalerta/filings/${x.filing_id}`, { method: 'DELETE' })).then(list.reload)
    return run(() => api('/api/tributalerta/filings', { body: { client_id: x.client_id, obligation: x.obligation, period: x.period, due_date: x.due_date } }), tr('Marcado como presentado', 'Marked as filed')).then(list.reload)
  }

  return (
    <div>
      <PageHead title={tr('Vencimientos tributarios', 'Tax deadlines')} subtitle={tr('Calculados por el último dígito del NIT de cada cliente.', "Calculated from each client's NIT last digit.")} />
      {years.data && !years.data.includes(today.getFullYear()) && (
        <div className="alert warn mb">{tr('El calendario DIAN de este año aún no está cargado en la plataforma. Puedes agregar vencimientos propios mientras tanto.', "This year's DIAN calendar is not loaded yet. You can add custom deadlines meanwhile.")}</div>
      )}
      <div className="grid grid-3 mb">
        <Stat label={tr('Pendientes en el rango', 'Pending in range')} value={pending.length} />
        <Stat label={tr('Vencen en 7 días', 'Due within 7 days')} value={pending.filter((x) => x.days_left >= 0 && x.days_left <= 7).length} tone="warn" />
        <Stat label={tr('Vencidos sin presentar', 'Overdue not filed')} value={pending.filter((x) => x.days_left < 0).length} tone="danger" />
      </div>
      <div className="row mb">
        <label className="field">
          {tr('Desde', 'From')}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          {tr('Hasta', 'To')}
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="check" style={{ marginTop: 18 }}>
          <input type="checkbox" checked={hideFiled} onChange={(e) => setHideFiled(e.target.checked)} /> {tr('Ocultar presentados', 'Hide filed')}
        </label>
      </div>
      <ErrorBox error={list.error} />
      {!list.data ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Empty>{tr('Sin vencimientos en el rango. Agrega clientes con sus obligaciones.', 'No deadlines in range. Add clients with their obligations.')}</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr('Vence', 'Due')}</th>
                <th>{tr('Cliente', 'Client')}</th>
                <th>{tr('Obligación', 'Obligation')}</th>
                <th>{tr('Estado', 'Status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={i}>
                  <td className="nowrap">{fmtDate(x.due_date)}</td>
                  <td>
                    {x.client_name} {x.nit && <span className="muted small">{x.nit}</span>}
                  </td>
                  <td>
                    {x.obligation_label} <span className="muted small">{x.period}</span>
                  </td>
                  <td>
                    {x.filed ? (
                      <Badge tone="ok">{tr('Presentado', 'Filed')}</Badge>
                    ) : x.days_left < 0 ? (
                      <Badge tone="danger">{tr(`Vencido hace ${-x.days_left} d`, `${-x.days_left} d overdue`)}</Badge>
                    ) : x.days_left <= 7 ? (
                      <Badge tone="warn">{x.days_left === 0 ? tr('Hoy', 'Today') : tr(`En ${x.days_left} d`, `In ${x.days_left} d`)}</Badge>
                    ) : (
                      <Badge>{tr(`En ${x.days_left} d`, `In ${x.days_left} d`)}</Badge>
                    )}
                  </td>
                  <td className="right">
                    <button className="btn sm" onClick={() => toggle(x)}>
                      {x.filed ? tr('Deshacer', 'Undo') : tr('✓ Presentado', '✓ Filed')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function Clients() {
  useLang()
  const obl = useObligations()
  if (!obl.data) return obl.error ? <ErrorBox error={obl.error} /> : <Spinner />
  const fields: FieldDef[] = [
    { name: 'name', label: tr('Razón social / nombre', 'Name'), required: true },
    { name: 'nit', label: tr('NIT (sin DV)', 'NIT (no check digit)'), required: true },
    { name: 'dv', label: 'DV', list: false },
    { name: 'taxpayer_type', label: tr('Tipo', 'Type'), type: 'select', required: true, default: 'pj', options: [['pj', tr('Persona jurídica', 'Company')], ['pn', tr('Persona natural', 'Individual')], ['gc', tr('Gran contribuyente', 'Large taxpayer')]] },
    { name: 'obligations', label: tr('Obligaciones', 'Obligations'), type: 'multi', options: Object.entries(obl.data) },
    { name: 'email', label: tr('Correo del cliente', 'Client email'), type: 'email', list: false },
    { name: 'phone', label: tr('Celular', 'Phone'), list: false },
    { name: 'notify_client', label: tr('Enviar recordatorio al cliente (7 y 1 día antes)', 'Send reminder to client (7 and 1 day before)'), type: 'checkbox', list: false },
    { name: 'notes', label: tr('Notas', 'Notes'), type: 'textarea', list: false },
  ]
  return <ResourcePage title={tr('Clientes', 'Clients')} endpoint="/api/tributalerta/clients" fields={fields} />
}

export function Custom() {
  useLang()
  const fields: FieldDef[] = [
    { name: 'title', label: tr('Vencimiento', 'Deadline'), required: true, hint: tr('Ej. ICA Bogotá bimestre 5, renovación matrícula mercantil', 'E.g. municipal tax, business registry renewal') },
    { name: 'client_id', label: tr('Cliente (opcional)', 'Client (optional)'), type: 'ref', ref: { endpoint: '/api/tributalerta/clients', label: 'name' } },
    { name: 'due_date', label: tr('Fecha', 'Date'), type: 'date', required: true },
    { name: 'done', label: tr('Cumplido', 'Done'), type: 'checkbox' },
  ]
  return <ResourcePage title={tr('Vencimientos propios', 'Custom deadlines')} subtitle={tr('ICA, matrícula mercantil, supersociedades y cualquier otra fecha.', 'Municipal taxes, renewals and any other date.')} endpoint="/api/tributalerta/custom" fields={fields} />
}
