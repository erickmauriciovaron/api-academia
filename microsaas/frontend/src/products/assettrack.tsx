import { useState } from 'react'
import { api } from '../api'
import ResourcePage, { FieldDef, RecordForm } from '../components/ResourcePage'
import { Badge, Modal, PageHead, Spinner, toast, useAction, useAsync } from '../components/ui'
import { fmtDate, fmtDateTime, money, tr, useLang } from '../i18n'
import { HandoverDocument } from '../pages/public/PublicForms'

const STATUS = (): [string, string][] => [
  ['disponible', tr('Disponible', 'Available')],
  ['asignado', tr('Asignado', 'Assigned')],
  ['reparacion', tr('En reparación', 'In repair')],
  ['baja', tr('De baja', 'Retired')],
]

function statusTone(s: string) {
  return s === 'asignado' ? 'info' : s === 'disponible' ? 'ok' : s === 'baja' ? 'danger' : 'warn'
}

export function Assets() {
  useLang()
  const [detail, setDetail] = useState<any | null>(null)
  const [key, setKey] = useState(0)
  const fields: FieldDef[] = [
    { name: 'tag', label: tr('Placa / código', 'Asset tag'), required: true },
    { name: 'category', label: tr('Categoría', 'Category'), default: 'Portátil', hint: tr('Portátil, Escritorio, Monitor, Celular, Impresora…', 'Laptop, Desktop, Monitor, Phone, Printer…') },
    { name: 'brand', label: tr('Marca', 'Brand') },
    { name: 'model', label: tr('Modelo', 'Model') },
    { name: 'serial', label: 'Serial' },
    { name: 'status', label: tr('Estado', 'Status'), type: 'select', options: STATUS(), default: 'disponible', filter: true, render: (r) => <Badge tone={statusTone(r.status) as any}>{STATUS().find((s) => s[0] === r.status)?.[1]}</Badge> },
    { name: 'person_name', label: tr('Asignado a', 'Assigned to'), form: false },
    { name: 'location', label: tr('Ubicación', 'Location'), list: false },
    { name: 'purchase_date', label: tr('Fecha de compra', 'Purchase date'), type: 'date', list: false },
    { name: 'cost', label: tr('Costo', 'Cost'), type: 'money', list: false },
    { name: 'warranty_until', label: tr('Garantía hasta', 'Warranty until'), type: 'date' },
    { name: 'specs', label: tr('Especificaciones', 'Specs'), type: 'textarea', list: false },
    { name: 'notes', label: tr('Notas', 'Notes'), type: 'textarea', list: false },
  ]
  return (
    <>
      <ResourcePage title={tr('Activos', 'Assets')} endpoint="/api/assettrack/assets" fields={fields} importable onRowClick={setDetail} reloadKey={key} />
      {detail && (
        <AssetDetail
          asset={detail}
          onClose={() => {
            setDetail(null)
            setKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}

function AssetDetail({ asset, onClose }: { asset: any; onClose: () => void }) {
  const events = useAsync(() => api<{ items: any[] }>(`/api/assettrack/events?asset_id=${asset.id}`), [asset.id])
  const handovers = useAsync(() => api<any[]>(`/api/assettrack/handovers?asset_id=${asset.id}`), [asset.id])
  const [mode, setMode] = useState<'none' | 'handover' | 'event'>('none')
  const [view, setView] = useState<any | null>(null)
  const isAssigned = asset.status === 'asignado'
  return (
    <Modal wide title={`${asset.tag} · ${asset.brand || ''} ${asset.model || ''}`} onClose={onClose}>
      <div className="stack">
        <div className="row">
          <Badge tone={statusTone(asset.status) as any}>{asset.status}</Badge>
          {asset.person_name && <span>👤 {asset.person_name}</span>}
          {asset.serial && <span className="muted">SN {asset.serial}</span>}
          {asset.warranty_until && <span className="muted">{tr('Garantía', 'Warranty')}: {fmtDate(asset.warranty_until)}</span>}
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => setMode('handover')}>
            📝 {isAssigned ? tr('Acta de devolución', 'Return form') : tr('Acta de entrega', 'Handover form')}
          </button>
          <button className="btn" onClick={() => setMode('event')}>
            🔧 {tr('Registrar mantenimiento', 'Log maintenance')}
          </button>
        </div>
        {mode === 'handover' && (
          <HandoverForm
            asset={asset}
            kind={isAssigned ? 'devolucion' : 'entrega'}
            onDone={(h) => {
              setMode('none')
              handovers.reload()
              setView(h)
            }}
          />
        )}
        {mode === 'event' && (
          <div className="card flat">
            <RecordForm
              fields={[
                { name: 'kind', label: tr('Tipo', 'Type'), type: 'select', options: [['mantenimiento', tr('Mantenimiento', 'Maintenance')], ['reparacion', tr('Reparación', 'Repair')], ['actualizacion', tr('Actualización', 'Upgrade')], ['nota', tr('Nota', 'Note')]], default: 'mantenimiento', required: true },
                { name: 'event_date', label: tr('Fecha', 'Date'), type: 'date', required: true, default: new Date().toISOString().slice(0, 10) },
                { name: 'cost', label: tr('Costo', 'Cost'), type: 'money' },
                { name: 'description', label: tr('Descripción', 'Description'), type: 'textarea', required: true },
              ]}
              initial={{}}
              onSubmit={async (d) => {
                await api('/api/assettrack/events', { body: { ...d, asset_id: asset.id } })
                toast(tr('Registrado', 'Saved'))
                setMode('none')
                events.reload()
              }}
            />
          </div>
        )}
        <h3>{tr('Actas', 'Forms')}</h3>
        {handovers.data?.length === 0 && <p className="muted">{tr('Sin actas.', 'No forms yet.')}</p>}
        {handovers.data?.map((h) => (
          <div key={h.id} className="row between card flat">
            <span>
              {h.kind === 'entrega' ? '📤' : '📥'} {h.person?.name} · {fmtDate(h.created_at)}
            </span>
            <span className="row">
              {h.signed_at ? <Badge tone="ok">{tr('Firmada', 'Signed')}</Badge> : <Badge tone="warn">{tr('Pendiente de firma', 'Pending signature')}</Badge>}
              <button className="btn sm" onClick={() => api(`/api/assettrack/handovers/${h.id}`).then(setView)}>
                {tr('Ver', 'View')}
              </button>
              {!h.signed_at && (
                <button className="btn sm" onClick={() => navigator.clipboard.writeText(h.sign_url).then(() => toast(tr('Enlace copiado', 'Link copied')))}>
                  🔗
                </button>
              )}
            </span>
          </div>
        ))}
        <h3>{tr('Hoja de vida', 'History')}</h3>
        {events.data?.items.length === 0 && <p className="muted">{tr('Sin registros.', 'No records.')}</p>}
        {events.data?.items.map((e) => (
          <div key={e.id} className="card flat">
            <div className="row between small muted">
              <span>
                {fmtDate(e.event_date)} · {e.kind}
              </span>
              {e.cost && <span>{money(e.cost)}</span>}
            </div>
            <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{e.description}</p>
          </div>
        ))}
      </div>
      {view && (
        <Modal wide title={tr('Acta', 'Form')} onClose={() => setView(null)}>
          <HandoverDocument h={view} />
          <div className="row mt">
            {!view.signed_at && (
              <>
                <input readOnly value={view.sign_url} className="grow" onFocus={(e) => e.target.select()} />
                <button className="btn" onClick={() => navigator.clipboard.writeText(view.sign_url).then(() => toast(tr('Enlace copiado', 'Link copied')))}>
                  {tr('Copiar enlace de firma', 'Copy signing link')}
                </button>
              </>
            )}
            <a className="btn" href={view.sign_url} target="_blank" rel="noreferrer">
              🖨 {tr('Abrir / imprimir', 'Open / print')}
            </a>
          </div>
        </Modal>
      )}
    </Modal>
  )
}

function HandoverForm({ asset, kind, onDone }: { asset: any; kind: 'entrega' | 'devolucion'; onDone: (h: any) => void }) {
  const { busy, run } = useAction()
  const people = useAsync(() => api<{ items: any[] }>('/api/assettrack/people?limit=1000'), [])
  const [f, setF] = useState({ person_id: asset.person_id ? String(asset.person_id) : '', condition: '', accessories: '', send_email: true })
  if (!people.data) return <Spinner />
  return (
    <form
      className="card flat stack"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => api('/api/assettrack/handovers', { body: { asset_id: asset.id, person_id: Number(f.person_id), kind, condition: f.condition || null, accessories: f.accessories || null, send_email: f.send_email } }), tr('Acta creada', 'Form created')).then(
          (h) => h && onDone(h),
        )
      }}
    >
      <label className="field">
        {tr('Empleado', 'Employee')}
        <select required value={f.person_id} onChange={(e) => setF({ ...f, person_id: e.target.value })}>
          <option value="">—</option>
          {people.data.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {people.data.items.length === 0 && <span className="hint">{tr('Primero crea empleados en "Personas".', 'Create employees in "People" first.')}</span>}
      </label>
      <label className="field">
        {tr('Accesorios', 'Accessories')}
        <input value={f.accessories} onChange={(e) => setF({ ...f, accessories: e.target.value })} placeholder={tr('Cargador, mouse, maletín', 'Charger, mouse, bag')} />
      </label>
      <label className="field">
        {tr('Estado del equipo', 'Condition')}
        <input value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} placeholder={tr('Bueno, sin golpes', 'Good, no damage')} />
      </label>
      <label className="check">
        <input type="checkbox" checked={f.send_email} onChange={(e) => setF({ ...f, send_email: e.target.checked })} /> {tr('Enviar enlace de firma por correo', 'Email signing link')}
      </label>
      <button className="btn primary" disabled={busy}>
        {tr('Generar acta', 'Generate form')}
      </button>
    </form>
  )
}

export function People() {
  useLang()
  const fields: FieldDef[] = [
    { name: 'name', label: tr('Nombre', 'Name'), required: true },
    { name: 'document_id', label: tr('Documento', 'ID number') },
    { name: 'email', label: tr('Correo', 'Email'), type: 'email' },
    { name: 'area', label: tr('Área', 'Department') },
    { name: 'position', label: tr('Cargo', 'Position') },
  ]
  return <ResourcePage title={tr('Personas', 'People')} endpoint="/api/assettrack/people" fields={fields} importable />
}

export function Handovers() {
  useLang()
  const list = useAsync(() => api<any[]>('/api/assettrack/handovers'), [])
  const [view, setView] = useState<any | null>(null)
  return (
    <div>
      <PageHead title={tr('Actas', 'Forms')} subtitle={tr('Entregas y devoluciones con firma digital.', 'Handovers and returns with e-signature.')} />
      {!list.data ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>N.º</th>
                <th>{tr('Tipo', 'Type')}</th>
                <th>{tr('Activo', 'Asset')}</th>
                <th>{tr('Empleado', 'Employee')}</th>
                <th>{tr('Fecha', 'Date')}</th>
                <th>{tr('Firma', 'Signature')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((h) => (
                <tr key={h.id} className="clickable" onClick={() => api(`/api/assettrack/handovers/${h.id}`).then(setView)}>
                  <td>{h.id}</td>
                  <td>{h.kind === 'entrega' ? tr('Entrega', 'Handover') : tr('Devolución', 'Return')}</td>
                  <td>{h.asset?.tag}</td>
                  <td>{h.person?.name}</td>
                  <td>{fmtDate(h.created_at)}</td>
                  <td>{h.signed_at ? <Badge tone="ok">{fmtDateTime(h.signed_at)}</Badge> : <Badge tone="warn">{tr('Pendiente', 'Pending')}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view && (
        <Modal wide title={tr('Acta', 'Form')} onClose={() => setView(null)}>
          <HandoverDocument h={view} />
          <div className="row mt">
            <a className="btn" href={view.sign_url} target="_blank" rel="noreferrer">
              🖨 {tr('Abrir / imprimir', 'Open / print')}
            </a>
          </div>
        </Modal>
      )}
    </div>
  )
}
