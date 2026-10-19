import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, download } from '../api'
import { Badge, Empty, ErrorBox, Modal, PageHead, Spinner, Stat, Tabs, toast, useAction, useAsync } from '../components/ui'
import { fmtDateTime, money, tr, useLang } from '../i18n'

function ConnectButton({ product }: { product: string }) {
  const { busy, run } = useAction()
  return (
    <button
      className="btn primary"
      disabled={busy}
      onClick={() => run(() => api<{ url: string }>(`/api/${product}/connect-url`)).then((r) => r && (location.href = r.url))}
    >
      🔗 {tr('Conectar tenant de Microsoft 365', 'Connect Microsoft 365 tenant')}
    </button>
  )
}

function useConnectedToast() {
  const [params] = useSearchParams()
  useEffect(() => {
    if (params.get('connected')) toast(tr('Tenant conectado', 'Tenant connected'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

const TYPE: Record<string, [string, string, 'danger' | 'warn' | 'info']> = {
  disabled: ['Cuenta deshabilitada', 'Disabled account', 'danger'],
  inactive: ['Usuario inactivo', 'Inactive user', 'warn'],
  unassigned: ['Sin asignar', 'Unassigned', 'info'],
  redundant: ['Redundante', 'Redundant', 'warn'],
}

/* ---------------- LicenciaLens ---------------- */
export function LensDashboard() {
  useLang()
  useConnectedToast()
  const conns = useAsync(() => api<any[]>('/api/licencialens/connections'), [])
  const [scanId, setScanId] = useState<number | null>(null)
  const { busy, run } = useAction()
  if (!conns.data) return conns.error ? <ErrorBox error={conns.error} /> : <Spinner />
  return (
    <div>
      <PageHead title={tr('Licencias desperdiciadas', 'Wasted licenses')} subtitle={tr('Conexión de solo lectura a Microsoft Graph.', 'Read-only Microsoft Graph connection.')} actions={<ConnectButton product="licencialens" />} />
      {conns.data.length === 0 ? (
        <Empty>
          <p>{tr('Conecta tu tenant: un administrador global aprueba los permisos de solo lectura y en segundos verás cuánto estás perdiendo.', 'Connect your tenant: a global admin approves read-only permissions and in seconds you will see how much you are losing.')}</p>
          <ConnectButton product="licencialens" />
        </Empty>
      ) : (
        <div className="stack">
          {conns.data.map((c) => (
            <div key={c.id} className="card stack">
              <div className="row between">
                <div>
                  <h3 style={{ margin: 0 }}>{c.display_name || c.default_domain || c.ms_tenant_id}</h3>
                  <span className="muted small">
                    {c.default_domain} · {tr('Última sincronización', 'Last sync')}: {fmtDateTime(c.last_sync_at)}
                  </span>
                </div>
                <div className="row">
                  <button className="btn primary" disabled={busy} onClick={() => run(() => api<any>(`/api/licencialens/connections/${c.id}/scan`, { method: 'POST' }), tr('Análisis completado', 'Scan complete')).then((s) => (conns.reload(), s && setScanId(s.id)))}>
                    {busy ? tr('Analizando…', 'Scanning…') : tr('Analizar ahora', 'Scan now')}
                  </button>
                  <button className="btn ghost danger" onClick={() => confirm(tr('¿Desconectar este tenant?', 'Disconnect this tenant?')) && run(() => api(`/api/licencialens/connections/${c.id}`, { method: 'DELETE' })).then(conns.reload)}>
                    🗑
                  </button>
                </div>
              </div>
              {c.last_error && <div className="alert error small">{c.last_error}</div>}
              {c.last_scan && (
                <div className="row between card flat">
                  <span>
                    {tr('Desperdicio detectado', 'Waste detected')}: <b style={{ fontSize: 22, color: 'var(--danger)' }}>{money(c.last_scan.waste_month)}</b> /{tr('mes', 'mo')} ·{' '}
                    <b>{money(c.last_scan.waste_month * 12)}</b> /{tr('año', 'yr')}
                  </span>
                  <button className="btn" onClick={() => setScanId(c.last_scan.id)}>
                    {tr('Ver detalle', 'See details')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {scanId && <ScanDetail id={scanId} onClose={() => setScanId(null)} />}
    </div>
  )
}

function ScanDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const s = useAsync(() => api<any>(`/api/licencialens/scans/${id}`), [id])
  const [tab, setTab] = useState<'findings' | 'skus'>('findings')
  const [filter, setFilter] = useState('')
  if (!s.data) return null
  const d = s.data
  const t = d.summary.totals
  const findings = d.findings.filter((f: any) => !filter || f.type === filter)
  return (
    <Modal wide title={`${tr('Análisis', 'Scan')} · ${fmtDateTime(d.ran_at)}`} onClose={onClose}>
      <div className="stack">
        <div className="grid grid-4">
          <Stat label={tr('Total / mes', 'Total / mo')} value={money(d.waste_month)} tone="danger" />
          <Stat label={tr('Deshabilitadas', 'Disabled')} value={money(t.disabled)} />
          <Stat label={tr('Inactivos', 'Inactive')} value={money(t.inactive)} />
          <Stat label={tr('Sin asignar + redundantes', 'Unassigned + redundant')} value={money(t.unassigned + t.redundant)} />
        </div>
        {!d.signin_available && (
          <div className="alert warn small">{tr('El tenant no expone la fecha de último inicio de sesión (requiere Entra ID P1 y AuditLog.Read.All). No se evaluaron usuarios inactivos.', 'The tenant does not expose last sign-in (requires Entra ID P1 and AuditLog.Read.All). Inactive users were not evaluated.')}</div>
        )}
        {d.summary.unknown_price_skus?.length > 0 && (
          <div className="alert small">
            {tr('SKUs sin precio configurado (no suman al ahorro):', 'SKUs without configured price (not counted):')} <code>{d.summary.unknown_price_skus.join(', ')}</code>. {tr('Agrégalos en "Precios".', 'Add them in "Prices".')}
          </div>
        )}
        <div className="row between">
          <Tabs value={tab} onChange={setTab} items={[['findings', `${tr('Hallazgos', 'Findings')} (${d.findings.length})`], ['skus', `${tr('Licencias', 'Licenses')} (${d.skus.length})`]]} />
          <button className="btn sm" onClick={() => download(`/api/licencialens/scans/${id}/csv`, `licencialens-${id}.csv`)}>
            ⬇ CSV
          </button>
        </div>
        {tab === 'findings' ? (
          <>
            <select style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">{tr('Todos', 'All')}</option>
              {Object.entries(TYPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {tr(v[0], v[1])}
                </option>
              ))}
            </select>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tr('Tipo', 'Type')}</th>
                    <th>{tr('Usuario', 'User')}</th>
                    <th>{tr('Licencias', 'Licenses')}</th>
                    <th>{tr('Detalle', 'Detail')}</th>
                    <th className="right">USD/{tr('mes', 'mo')}</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((f: any, i: number) => (
                    <tr key={i}>
                      <td>
                        <Badge tone={TYPE[f.type][2]}>{tr(TYPE[f.type][0], TYPE[f.type][1])}</Badge>
                      </td>
                      <td>
                        {f.user || '—'}
                        <div className="muted small">{f.upn}</div>
                      </td>
                      <td className="small">{(f.licenses || []).join(', ')}</td>
                      <td className="small">{f.detail}</td>
                      <td className="right">{money(f.monthly)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>{tr('Compradas', 'Purchased')}</th>
                  <th>{tr('Asignadas', 'Assigned')}</th>
                  <th>{tr('Libres', 'Free')}</th>
                  <th>{tr('Precio', 'Price')}</th>
                </tr>
              </thead>
              <tbody>
                {d.skus.map((x: any) => (
                  <tr key={x.sku}>
                    <td>{x.sku}</td>
                    <td>{x.enabled}</td>
                    <td>{x.consumed}</td>
                    <td>{x.unassigned ? <Badge tone="warn">{x.unassigned}</Badge> : 0}</td>
                    <td>{x.price ? money(x.price) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function LensHistory() {
  useLang()
  const scans = useAsync(() => api<any[]>('/api/licencialens/scans'), [])
  const [scanId, setScanId] = useState<number | null>(null)
  if (!scans.data) return <Spinner />
  return (
    <div>
      <PageHead title={tr('Historial de análisis', 'Scan history')} subtitle={tr('Se analiza automáticamente el día 1 de cada mes y se envía el reporte por correo.', 'Scans run automatically on the 1st of each month with an email report.')} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{tr('Fecha', 'Date')}</th>
              <th>{tr('Usuarios', 'Users')}</th>
              <th>{tr('Con licencia', 'Licensed')}</th>
              <th>{tr('Desperdicio / mes', 'Waste / mo')}</th>
            </tr>
          </thead>
          <tbody>
            {scans.data.map((s) => (
              <tr key={s.id} className="clickable" onClick={() => setScanId(s.id)}>
                <td>{fmtDateTime(s.ran_at)}</td>
                <td>{s.users_scanned}</td>
                <td>{s.licensed_users}</td>
                <td>{money(s.waste_month)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scanId && <ScanDetail id={scanId} onClose={() => setScanId(null)} />}
    </div>
  )
}

export function LensSettings() {
  useLang()
  const prices = useAsync(() => api<Record<string, number>>('/api/licencialens/prices'), [])
  const settings = useAsync(() => api<any>('/api/licencialens/settings'), [])
  const [p, setP] = useState<Record<string, number | string>>({})
  const [newSku, setNewSku] = useState('')
  const [cfg, setCfg] = useState<any>(null)
  const { busy, run } = useAction()
  useEffect(() => {
    if (prices.data) setP(prices.data)
  }, [prices.data])
  useEffect(() => {
    if (settings.data) setCfg({ ...settings.data, report_emails: settings.data.report_emails.join(', ') })
  }, [settings.data])
  if (!prices.data || !cfg) return <Spinner />
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHead title={tr('Configuración', 'Settings')} />
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => api('/api/licencialens/settings', { method: 'PUT', body: { inactive_days: Number(cfg.inactive_days), report_emails: cfg.report_emails.split(',').map((x: string) => x.trim()).filter(Boolean) } }), tr('Guardado', 'Saved'))
        }}
      >
        <label className="field">
          {tr('Días sin iniciar sesión para considerar inactivo', 'Days without sign-in to consider inactive')}
          <input type="number" min={7} max={365} value={cfg.inactive_days} onChange={(e) => setCfg({ ...cfg, inactive_days: e.target.value })} />
        </label>
        <label className="field">
          {tr('Correos adicionales para el reporte mensual', 'Extra emails for the monthly report')}
          <input value={cfg.report_emails} onChange={(e) => setCfg({ ...cfg, report_emails: e.target.value })} placeholder="cfo@empresa.com, ti@empresa.com" />
        </label>
        <button className="btn primary" disabled={busy}>
          {tr('Guardar', 'Save')}
        </button>
      </form>
      <div className="card stack">
        <h3>{tr('Precios por licencia (USD/usuario/mes)', 'License prices (USD/user/month)')}</h3>
        <p className="muted small" style={{ margin: 0 }}>
          {tr('Valores de lista aproximados. Ajústalos a lo que realmente pagas (CSP, EA o descuentos).', 'Approximate list prices. Adjust to what you actually pay (CSP, EA or discounts).')}
        </p>
        <div className="grid grid-2">
          {Object.keys(p)
            .sort()
            .map((sku) => (
              <label key={sku} className="field">
                <span className="small">{sku}</span>
                <input type="number" step="0.01" min={0} value={p[sku]} onChange={(e) => setP({ ...p, [sku]: e.target.value })} />
              </label>
            ))}
        </div>
        <div className="row">
          <input placeholder={tr('Agregar SKU (ej. Microsoft_365_Copilot)', 'Add SKU (e.g. Microsoft_365_Copilot)')} value={newSku} onChange={(e) => setNewSku(e.target.value)} className="grow" />
          <button className="btn" type="button" onClick={() => newSku.trim() && (setP({ ...p, [newSku.trim()]: 0 }), setNewSku(''))}>
            +
          </button>
        </div>
        <button className="btn primary" disabled={busy} onClick={() => run(() => api('/api/licencialens/prices', { method: 'PUT', body: { prices: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Number(v)])) } }), tr('Precios guardados', 'Prices saved'))}>
          {tr('Guardar precios', 'Save prices')}
        </button>
      </div>
    </div>
  )
}

/* ---------------- OffboardKit ---------------- */
export function OffboardHome() {
  useLang()
  useConnectedToast()
  const conns = useAsync(() => api<any[]>('/api/offboardkit/connections'), [])
  const [conn, setConn] = useState<any | null>(null)
  const { run } = useAction()
  useEffect(() => {
    if (conns.data?.length && !conn) setConn(conns.data[0])
  }, [conns.data, conn])
  if (!conns.data) return conns.error ? <ErrorBox error={conns.error} /> : <Spinner />
  return (
    <div>
      <PageHead title={tr('Retiro de empleados', 'Employee offboarding')} actions={<ConnectButton product="offboardkit" />} />
      {conns.data.length === 0 ? (
        <Empty>
          <p>{tr('Conecta tu tenant de Microsoft 365. Un administrador global aprueba los permisos de administración de usuarios.', 'Connect your Microsoft 365 tenant. A global admin approves user management permissions.')}</p>
          <ConnectButton product="offboardkit" />
        </Empty>
      ) : (
        <div className="stack">
          <div className="row">
            <span>Tenant:</span>
            <select style={{ width: 'auto' }} value={conn?.id || ''} onChange={(e) => setConn(conns.data!.find((c) => c.id === Number(e.target.value)))}>
              {conns.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.default_domain || c.ms_tenant_id}
                </option>
              ))}
            </select>
            {conn && (
              <button className="btn sm ghost danger" onClick={() => confirm(tr('¿Desconectar?', 'Disconnect?')) && run(() => api(`/api/offboardkit/connections/${conn.id}`, { method: 'DELETE' })).then(() => (setConn(null), conns.reload()))}>
                🗑
              </button>
            )}
          </div>
          {conn?.last_error && <div className="alert error small">{conn.last_error}</div>}
          {conn && <OffboardWizard conn={conn} />}
        </div>
      )}
    </div>
  )
}

function OffboardWizard({ conn }: { conn: any }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [user, setUser] = useState<any | null>(null)
  const [confirmUpn, setConfirmUpn] = useState('')
  const [reason, setReason] = useState('')
  const [steps, setSteps] = useState<string[]>([])
  const [run_, setRun] = useState<any | null>(null)
  const settings = useAsync(() => api<any>('/api/offboardkit/settings'), [])
  const { busy, run } = useAction()
  useEffect(() => {
    if (settings.data) setSteps(settings.data.steps)
  }, [settings.data])
  useEffect(() => {
    if (q.trim().length < 2) return setResults([])
    const t = setTimeout(() => api<any[]>(`/api/offboardkit/connections/${conn.id}/users?q=${encodeURIComponent(q)}`).then(setResults).catch((e) => toast(e.message, 'error')), 350)
    return () => clearTimeout(t)
  }, [q, conn.id])
  if (run_) return <RunReport run={run_} onBack={() => (setRun(null), setUser(null), setQ(''), setConfirmUpn(''))} />
  return (
    <div className="grid grid-2">
      <div className="card stack">
        <h3>1. {tr('Buscar usuario', 'Find user')}</h3>
        <input placeholder={tr('Nombre o correo…', 'Name or email…')} value={q} onChange={(e) => setQ(e.target.value)} />
        {results.map((u) => (
          <button
            key={u.id}
            className={`btn ${user?.id === u.id ? 'primary' : ''}`}
            style={{ justifyContent: 'flex-start' }}
            onClick={() => run(() => api(`/api/offboardkit/connections/${conn.id}/users/${u.id}`)).then((d) => d && setUser(d))}
          >
            {u.displayName} <span className="small muted">{u.userPrincipalName}</span> {u.accountEnabled === false && <Badge tone="danger">{tr('bloqueado', 'blocked')}</Badge>}
          </button>
        ))}
      </div>
      <div className="card stack">
        <h3>2. {tr('Confirmar retiro', 'Confirm offboarding')}</h3>
        {!user ? (
          <p className="muted">{tr('Selecciona un usuario.', 'Select a user.')}</p>
        ) : (
          <>
            <div>
              <b>{user.displayName}</b> · {user.userPrincipalName}
              <div className="small muted">{[user.jobTitle, user.department].filter(Boolean).join(' · ')}</div>
              <div className="small">
                {tr('Licencias', 'Licenses')}: {user.licenses.join(', ') || '—'} · <b>{money(user.estimated_savings)}/{tr('mes', 'mo')}</b>
              </div>
              <div className="small">
                {tr('Grupos', 'Groups')}: {user.groups.length}
              </div>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              {settings.data &&
                Object.entries<string>(settings.data.available_steps).map(([k, l]) => (
                  <label key={k} className="check">
                    <input type="checkbox" checked={steps.includes(k)} onChange={(e) => setSteps(e.target.checked ? [...steps, k] : steps.filter((x) => x !== k))} /> {l}
                  </label>
                ))}
            </div>
            <label className="field">
              {tr('Motivo (para el acta)', 'Reason (for the report)')}
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <label className="field">
              {tr('Escribe el correo del usuario para confirmar', 'Type the user email to confirm')}
              <input value={confirmUpn} onChange={(e) => setConfirmUpn(e.target.value)} placeholder={user.userPrincipalName} />
            </label>
            <button
              className="btn primary"
              style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              disabled={busy || confirmUpn.trim().toLowerCase() !== user.userPrincipalName.toLowerCase() || steps.length === 0}
              onClick={() => run(() => api(`/api/offboardkit/connections/${conn.id}/offboard`, { body: { user_id: user.id, steps, reason: reason || null, confirm_upn: confirmUpn } })).then((r) => r && setRun(r))}
            >
              {busy ? tr('Ejecutando…', 'Running…') : tr('Ejecutar retiro', 'Run offboarding')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function RunReport({ run, onBack }: { run: any; onBack?: () => void }) {
  return (
    <div className="card stack">
      <div className="row between">
        <h2>{tr('Acta de retiro de usuario', 'User offboarding report')}</h2>
        <div className="row no-print">
          {onBack && (
            <button className="btn" onClick={onBack}>
              ← {tr('Nuevo retiro', 'New offboarding')}
            </button>
          )}
          <button className="btn" onClick={() => print()}>
            🖨 PDF
          </button>
        </div>
      </div>
      <table>
        <tbody>
          <tr><th>{tr('Usuario', 'User')}</th><td>{run.target_name} · {run.target_upn}</td></tr>
          <tr><th>{tr('Fecha', 'Date')}</th><td>{fmtDateTime(run.created_at)}</td></tr>
          <tr><th>{tr('Ejecutado por', 'Run by')}</th><td>{run.requested_by}</td></tr>
          <tr><th>{tr('Motivo', 'Reason')}</th><td>{run.reason || '—'}</td></tr>
          <tr><th>{tr('Resultado', 'Result')}</th><td><Badge tone={run.status === 'completed' ? 'ok' : run.status === 'partial' ? 'warn' : 'danger'}>{run.status}</Badge></td></tr>
          <tr><th>{tr('Ahorro mensual estimado', 'Estimated monthly savings')}</th><td>{money(run.monthly_savings)}</td></tr>
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>{tr('Paso', 'Step')}</th>
            <th>{tr('Resultado', 'Result')}</th>
            <th>{tr('Detalle', 'Detail')}</th>
            <th>{tr('Hora', 'Time')}</th>
          </tr>
        </thead>
        <tbody>
          {run.steps.map((s: any) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td>{s.status === 'ok' ? <Badge tone="ok">OK</Badge> : <Badge tone="danger">Error</Badge>}</td>
              <td className="small">{s.detail}</td>
              <td className="small nowrap">{fmtDateTime(s.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function OffboardRuns() {
  useLang()
  const runs = useAsync(() => api<any>('/api/offboardkit/runs'), [])
  const [view, setView] = useState<any | null>(null)
  if (!runs.data) return <Spinner />
  return (
    <div>
      <PageHead title={tr('Historial de retiros', 'Offboarding history')} subtitle={`${tr('Este mes', 'This month')}: ${runs.data.this_month}`} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{tr('Fecha', 'Date')}</th>
              <th>{tr('Usuario', 'User')}</th>
              <th>{tr('Por', 'By')}</th>
              <th>{tr('Resultado', 'Result')}</th>
              <th>{tr('Ahorro', 'Savings')}</th>
            </tr>
          </thead>
          <tbody>
            {runs.data.items.map((r: any) => (
              <tr key={r.id} className="clickable" onClick={() => setView(r)}>
                <td>{fmtDateTime(r.created_at)}</td>
                <td>
                  {r.target_name} <div className="muted small">{r.target_upn}</div>
                </td>
                <td className="small">{r.requested_by}</td>
                <td>
                  <Badge tone={r.status === 'completed' ? 'ok' : r.status === 'partial' ? 'warn' : 'danger'}>{r.status}</Badge>
                </td>
                <td>{money(r.monthly_savings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view && (
        <Modal wide title={tr('Acta', 'Report')} onClose={() => setView(null)}>
          <RunReport run={view} />
        </Modal>
      )}
    </div>
  )
}

export function OffboardSettings() {
  useLang()
  const s = useAsync(() => api<any>('/api/offboardkit/settings'), [])
  const [f, setF] = useState<any>(null)
  const { busy, run } = useAction()
  useEffect(() => {
    if (s.data) setF(s.data)
  }, [s.data])
  if (!f) return <Spinner />
  return (
    <div style={{ maxWidth: 680 }}>
      <PageHead title={tr('Plantilla de retiro', 'Offboarding template')} />
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => api('/api/offboardkit/settings', { method: 'PUT', body: { steps: f.steps, auto_reply: f.auto_reply, contact_email: f.contact_email } }), tr('Guardado', 'Saved'))
        }}
      >
        <strong>{tr('Pasos por defecto', 'Default steps')}</strong>
        {Object.entries<string>(f.available_steps).map(([k, l]) => (
          <label key={k} className="check">
            <input type="checkbox" checked={f.steps.includes(k)} onChange={(e) => setF({ ...f, steps: e.target.checked ? [...f.steps, k] : f.steps.filter((x: string) => x !== k) })} /> {l}
          </label>
        ))}
        <label className="field">
          {tr('Respuesta automática', 'Auto-reply')}
          <textarea value={f.auto_reply} onChange={(e) => setF({ ...f, auto_reply: e.target.value })} />
          <span className="hint">{'{nombre} {empresa} {contacto}'}</span>
        </label>
        <label className="field">
          {tr('Correo de contacto', 'Contact email')}
          <input type="email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} />
        </label>
        <button className="btn primary" disabled={busy}>
          {tr('Guardar', 'Save')}
        </button>
      </form>
    </div>
  )
}
