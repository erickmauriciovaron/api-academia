import { api } from '../api'
import ResourcePage, { FieldDef } from '../components/ResourcePage'
import { Badge, ErrorBox, PageHead, Spinner, Stat, useAsync } from '../components/ui'
import { fmtDate, money, tr, useLang } from '../i18n'

function LineTable({ title, rows, extra }: { title: string; rows: any[]; extra?: (r: any) => React.ReactNode }) {
  if (!rows.length) return null
  return (
    <div className="mb">
      <h3>
        {title} <Badge tone="warn">{rows.length}</Badge>
      </h3>
      <div className="table-wrap">
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.number}</td>
                <td>{r.operator}</td>
                <td>{r.person_name || <span className="muted">{tr('sin asignar', 'unassigned')}</span>}</td>
                <td>{money(r.plan_cost, r.currency)}</td>
                <td>{extra?.(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Dashboard() {
  useLang()
  const d = useAsync(() => api<any>('/api/lineacontrol/dashboard'), [])
  if (!d.data) return d.error ? <ErrorBox error={d.error} /> : <Spinner />
  const a = d.data
  return (
    <div>
      <PageHead title={tr('Resumen de líneas', 'Lines overview')} />
      <div className="grid grid-4 mb">
        <Stat label={tr('Líneas activas', 'Active lines')} value={a.lines_active} />
        {Object.entries<number>(a.monthly_cost).map(([cur, v]) => (
          <Stat key={cur} label={`${tr('Costo mensual', 'Monthly cost')} (${cur})`} value={money(v, cur)} />
        ))}
        <Stat label={tr('Ahorro potencial / mes', 'Potential savings / mo')} value={money(a.potential_savings)} tone="ok" />
      </div>
      {Object.keys(a.by_cost_center).length > 0 && (
        <div className="card mb">
          <h3>{tr('Costo por centro de costo', 'Cost by cost center')}</h3>
          {Object.entries<number>(a.by_cost_center).map(([cc, v]) => {
            const max = Math.max(...Object.values<number>(a.by_cost_center))
            return (
              <div key={cc} className="mb">
                <div className="row between small">
                  <span>{cc}</span>
                  <span>{money(v)}</span>
                </div>
                <div className="bar">
                  <span style={{ width: `${(100 * v) / (max || 1)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      <LineTable title={tr('Con sobrecosto vs. plan', 'Overcharged vs. plan')} rows={a.overcharged} extra={(r) => <Badge tone="danger">+{money(r.extra, r.currency)} ({r.period})</Badge>} />
      <LineTable title={tr('Sin uso en el último periodo', 'No usage last period')} rows={a.unused} extra={(r) => <span className="muted small">{r.period}</span>} />
      <LineTable title={tr('Sin asignar', 'Unassigned')} rows={a.unassigned} />
      <LineTable title={tr('Contratos que vencen en 60 días', 'Contracts ending in 60 days')} rows={a.contracts_ending} extra={(r) => fmtDate(r.contract_end)} />
    </div>
  )
}

export function Lines() {
  useLang()
  const fields: FieldDef[] = [
    { name: 'number', label: tr('Número', 'Number'), required: true },
    { name: 'operator', label: tr('Operador', 'Carrier'), required: true },
    { name: 'plan_name', label: tr('Plan', 'Plan'), list: false },
    { name: 'plan_cost', label: tr('Cargo fijo', 'Plan cost'), type: 'money', required: true },
    { name: 'currency', label: tr('Moneda', 'Currency'), type: 'select', options: [['USD', 'USD'], ['COP', 'COP'], ['MXN', 'MXN'], ['EUR', 'EUR'], ['PEN', 'PEN']], default: 'USD', list: false },
    { name: 'status', label: tr('Estado', 'Status'), type: 'select', options: [['activa', tr('Activa', 'Active')], ['suspendida', tr('Suspendida', 'Suspended')], ['cancelada', tr('Cancelada', 'Cancelled')]], default: 'activa', filter: true },
    { name: 'person_name', label: tr('Responsable', 'Assigned to') },
    { name: 'person_email', label: tr('Correo responsable', 'Owner email'), type: 'email', list: false },
    { name: 'cost_center', label: tr('Centro de costo', 'Cost center') },
    { name: 'sim_iccid', label: 'ICCID', list: false },
    { name: 'device', label: tr('Equipo', 'Device'), list: false },
    { name: 'contract_end', label: tr('Fin de contrato', 'Contract end'), type: 'date' },
    { name: 'notes', label: tr('Notas', 'Notes'), type: 'textarea', list: false },
  ]
  return <ResourcePage title={tr('Líneas', 'Lines')} endpoint="/api/lineacontrol/lines" fields={fields} importable />
}

export function Bills() {
  useLang()
  const fields: FieldDef[] = [
    { name: 'line_id', label: tr('Línea', 'Line'), type: 'ref', ref: { endpoint: '/api/lineacontrol/lines', label: 'number' }, required: true, filter: true },
    { name: 'period', label: tr('Periodo (AAAA-MM)', 'Period (YYYY-MM)'), required: true, default: new Date().toISOString().slice(0, 7) },
    { name: 'amount', label: tr('Valor facturado', 'Billed amount'), type: 'money', required: true },
    { name: 'data_gb', label: tr('Datos (GB)', 'Data (GB)'), type: 'number' },
    { name: 'minutes', label: tr('Minutos', 'Minutes'), type: 'number' },
    { name: 'notes', label: tr('Notas', 'Notes'), type: 'textarea', list: false },
  ]
  return (
    <ResourcePage
      title={tr('Facturación mensual', 'Monthly billing')}
      subtitle={tr('Registra lo facturado por línea para detectar sobrecostos y líneas sin uso.', 'Log billed amounts per line to find overcharges and unused lines.')}
      endpoint="/api/lineacontrol/bills"
      fields={fields}
      importable
      importHint={tr('Columnas: line_id, period, amount, data_gb, minutes', 'Columns: line_id, period, amount, data_gb, minutes')}
    />
  )
}
