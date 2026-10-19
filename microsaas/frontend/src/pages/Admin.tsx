import { useRef, useState } from 'react'
import { api } from '../api'
import { useCatalog } from '../catalog'
import { fmtDate, fmtDateTime, money, useLang } from '../i18n'
import { Badge, ErrorBox, PageHead, Spinner, Stat, Tabs, useAction, useAsync } from '../components/ui'
import { StatusBadge } from './Account'

export default function Admin() {
  useLang()
  const [tab, setTab] = useState<'resumen' | 'clientes' | 'pagos' | 'calendario'>('resumen')
  return (
    <div>
      <PageHead title="Superadmin" subtitle="Ingresos, clientes y suscripciones de todas las apps." />
      <Tabs value={tab} onChange={setTab} items={[['resumen', 'Resumen'], ['clientes', 'Clientes'], ['pagos', 'Pagos'], ['calendario', 'Calendario DIAN']]} />
      {tab === 'resumen' && <Summary />}
      {tab === 'clientes' && <Tenants />}
      {tab === 'pagos' && <Payments />}
      {tab === 'calendario' && <Calendar />}
    </div>
  )
}

function Summary() {
  const s = useAsync(() => api<any>('/api/admin/stats'), [])
  if (!s.data) return s.error ? <ErrorBox error={s.error} /> : <Spinner />
  const d = s.data
  return (
    <div className="stack">
      <div className="grid grid-4">
        <Stat label="MRR (USD)" value={money(d.mrr)} tone="ok" />
        <Stat label="Cobrado 30 días" value={money(d.revenue_30d)} />
        <Stat label="Empresas" value={d.tenants} />
        <Stat label="Usuarios" value={d.users} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>App</th>
              <th>En prueba</th>
              <th>Pagando</th>
              <th>Canceladas</th>
              <th>MRR</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries<any>(d.by_product).map(([slug, v]) => (
              <tr key={slug}>
                <td>{v.name}</td>
                <td>{v.trialing}</td>
                <td>{v.active}</td>
                <td>{v.churned}</td>
                <td>{money(v.mrr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Tenants() {
  const [q, setQ] = useState('')
  const list = useAsync(() => api<any[]>(`/api/admin/tenants?q=${encodeURIComponent(q)}`), [q])
  const catalog = useCatalog()
  const { run } = useAction()
  const patchSub = (id: number, body: any) => run(() => api(`/api/admin/subscriptions/${id}`, { method: 'PATCH', body }), 'Actualizado').then(list.reload)
  return (
    <div className="stack">
      <input placeholder="Buscar empresa…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
      <ErrorBox error={list.error} />
      {list.data?.map((t) => (
        <div key={t.id} className="card stack">
          <div className="row between">
            <div>
              <h3 style={{ margin: 0 }}>
                {t.name} <span className="muted small">#{t.id} · {t.country}</span>
              </h3>
              <span className="muted small">
                {t.owner?.name} · {t.owner?.email} · {t.users} usuarios · desde {fmtDate(t.created_at)}
              </span>
            </div>
            <button className={`btn sm ${t.is_active ? 'danger' : ''}`} onClick={() => run(() => api(`/api/admin/tenants/${t.id}`, { method: 'PATCH', body: { is_active: !t.is_active } })).then(list.reload)}>
              {t.is_active ? 'Suspender' : 'Reactivar'}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <tbody>
                {t.subscriptions.map((s: any) => {
                  const p = catalog?.products.find((x) => x.slug === s.product)
                  return (
                    <tr key={s.id}>
                      <td>{s.product_name}</td>
                      <td>
                        <select value={s.plan} style={{ width: 'auto' }} onChange={(e) => patchSub(s.id, { plan: e.target.value })}>
                          {p?.plans.map((pl) => (
                            <option key={pl.code} value={pl.code}>
                              {pl.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <StatusBadge s={s} /> {s.comp && <Badge tone="info">cortesía</Badge>} {s.paypal_linked && <Badge>PayPal</Badge>}
                      </td>
                      <td className="small">{fmtDate(s.status === 'trialing' ? s.trial_ends_at : s.current_period_end)}</td>
                      <td className="right nowrap">
                        <button className="btn sm" onClick={() => patchSub(s.id, { extend_trial_days: 14 })}>
                          +14 días prueba
                        </button>{' '}
                        <button className="btn sm" onClick={() => patchSub(s.id, { comp: !s.comp })}>
                          {s.comp ? 'Quitar cortesía' : 'Cortesía'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function Payments() {
  const list = useAsync(() => api<any[]>('/api/admin/payments'), [])
  if (!list.data) return list.error ? <ErrorBox error={list.error} /> : <Spinner />
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Empresa</th>
            <th>App</th>
            <th>Valor</th>
            <th>Estado</th>
            <th>Ref. PayPal</th>
          </tr>
        </thead>
        <tbody>
          {list.data.map((p) => (
            <tr key={p.id}>
              <td>{fmtDateTime(p.created_at)}</td>
              <td>{p.tenant || '—'}</td>
              <td>{p.product}</td>
              <td>{money(p.amount, p.currency)}</td>
              <td>
                <Badge tone={p.status === 'completed' ? 'ok' : 'warn'}>{p.status}</Badge>
              </td>
              <td className="small">{p.ref}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Calendar() {
  const [year, setYear] = useState(new Date().getFullYear())
  const list = useAsync(() => api<any[]>(`/api/admin/tributalerta/calendar?year=${year}`), [year])
  const file = useRef<HTMLInputElement>(null)
  const { busy, run } = useAction()
  const [result, setResult] = useState<any>(null)
  return (
    <div className="stack">
      <div className="alert">
        Carga el calendario tributario oficial del año (decreto DIAN) en CSV con columnas: <code>year,obligation,period,digits,digit_from,digit_to,due_date</code>. Obligaciones válidas:{' '}
        <code>renta_gc, renta_pj, renta_pn, iva_bim, iva_cuat, retefuente, exogena, simple_anticipo, simple_anual, patrimonio, activos_exterior</code>. Al importar se reemplaza el año completo.
      </div>
      <div className="row">
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 110 }} />
        <input type="file" accept=".csv" ref={file} style={{ maxWidth: 300 }} />
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => {
            const f = file.current?.files?.[0]
            if (!f) return
            const form = new FormData()
            form.append('file', f)
            run(() => api('/api/admin/tributalerta/calendar/import', { form })).then((r) => {
              setResult(r)
              list.reload()
            })
          }}
        >
          Importar
        </button>
      </div>
      {result && <div className={`alert ${result.errors?.length ? 'error' : 'ok'}`}>Creados: {result.created} {result.errors?.length ? `· Errores: ${JSON.stringify(result.errors.slice(0, 5))}` : ''}</div>}
      <p className="muted">{list.data?.length ?? 0} fechas cargadas para {year}.</p>
      {list.data && list.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Obligación</th>
                <th>Periodo</th>
                <th>Dígitos</th>
                <th>Vence</th>
              </tr>
            </thead>
            <tbody>
              {list.data.slice(0, 500).map((r) => (
                <tr key={r.id}>
                  <td>{r.obligation}</td>
                  <td>{r.period}</td>
                  <td>
                    {r.digit_from}–{r.digit_to} ({r.digits})
                  </td>
                  <td>{fmtDate(r.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
