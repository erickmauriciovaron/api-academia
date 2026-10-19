import { useState } from 'react'
import { api } from '../api'
import ResourcePage, { FieldDef } from '../components/ResourcePage'
import { Badge, ErrorBox, Modal, PageHead, Spinner, Stat, toast, useAction, useAsync } from '../components/ui'
import { fmtDate, tr, useLang } from '../i18n'

export function Dashboard() {
  useLang()
  const s = useAsync(() => api<any>('/api/datosok/stats'), [])
  if (!s.data) return s.error ? <ErrorBox error={s.error} /> : <Spinner />
  const url = `${location.origin}/datos/${s.data.public_key}`
  return (
    <div>
      <PageHead title="Habeas Data" subtitle={tr('Ley 1581 de 2012 y Decreto 1377 de 2013.', 'Colombian Law 1581/2012.')} />
      <div className="grid grid-4 mb">
        <Stat label={tr('Autorizaciones', 'Consents')} value={s.data.consents_total} />
        <Stat label={tr('Este mes', 'This month')} value={s.data.consents_month} />
        <Stat label={tr('Solicitudes abiertas', 'Open requests')} value={s.data.requests_open} tone="warn" />
        <Stat label={tr('Vencidas', 'Overdue')} value={s.data.requests_overdue} tone="danger" />
      </div>
      <div className="card stack">
        <h3>{tr('Tu formulario público', 'Your public form')}</h3>
        <p className="muted" style={{ margin: 0 }}>
          {tr('Compártelo por WhatsApp, ponlo en tu web o en un código QR en recepción. Los titulares autorizan, hacen consultas y reclamos desde aquí.', 'Share it via WhatsApp, on your website or a QR code. Data subjects consent and file requests from here.')}
        </p>
        <div className="row">
          <input readOnly value={url} className="grow" onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={() => navigator.clipboard.writeText(url).then(() => toast(tr('Copiado', 'Copied')))}>
            {tr('Copiar', 'Copy')}
          </button>
          <a className="btn" href={url} target="_blank" rel="noreferrer">
            ↗
          </a>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {tr('Para insertarlo en tu web:', 'To embed on your website:')} <code>{`<iframe src="${url}" width="100%" height="900" style="border:0"></iframe>`}</code>
        </p>
      </div>
    </div>
  )
}

export function Policies() {
  useLang()
  const fields: FieldDef[] = [
    { name: 'version', label: tr('Versión', 'Version'), required: true, default: '1.0' },
    { name: 'title', label: tr('Título', 'Title'), default: 'Autorización de tratamiento de datos personales' },
    { name: 'is_current', label: tr('Publicar como vigente', 'Publish as current'), type: 'checkbox', render: (r) => (r.is_current ? <Badge tone="ok">{tr('Vigente', 'Current')}</Badge> : '—') },
    { name: 'policy_url', label: tr('URL de la política completa', 'Full policy URL'), list: false },
    {
      name: 'text',
      label: tr('Texto de la autorización', 'Consent text'),
      type: 'textarea',
      required: true,
      list: false,
      default:
        'Autorizo de manera previa, expresa e informada a [EMPRESA], identificada con NIT [NIT], como responsable del tratamiento, para recolectar, almacenar, usar y suprimir mis datos personales conforme a su Política de Tratamiento de Datos y a la Ley 1581 de 2012. Como titular tengo derecho a conocer, actualizar, rectificar y suprimir mis datos, revocar esta autorización y presentar quejas ante la Superintendencia de Industria y Comercio. Canal de atención: [CORREO].',
    },
    { name: 'purposes', label: tr('Finalidades (JSON)', 'Purposes (JSON)'), form: false, list: false },
  ]
  const [editing, setEditing] = useState<any | null>(null)
  const [key, setKey] = useState(0)
  return (
    <>
      <ResourcePage
        title={tr('Autorizaciones publicadas', 'Published consent forms')}
        subtitle={tr('Cada cambio de texto debe ser una nueva versión. Las evidencias guardan la versión aceptada.', 'Each text change should be a new version. Evidence stores the accepted version.')}
        endpoint="/api/datosok/policies"
        fields={fields}
        deletable={false}
        reloadKey={key}
        rowActions={(r) => (
          <button className="btn sm" onClick={() => setEditing(r)}>
            {tr('Finalidades', 'Purposes')} ({(r.purposes || []).length})
          </button>
        )}
      />
      {editing && (
        <PurposesEditor
          policy={editing}
          onClose={() => {
            setEditing(null)
            setKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}

function PurposesEditor({ policy, onClose }: { policy: any; onClose: () => void }) {
  const [items, setItems] = useState<{ key: string; label: string; required: boolean }[]>(
    policy.purposes?.length
      ? policy.purposes
      : [
          { key: 'servicio', label: 'Prestación del servicio contratado y facturación', required: true },
          { key: 'contacto', label: 'Contacto y atención de solicitudes', required: true },
          { key: 'marketing', label: 'Envío de información comercial y promociones', required: false },
        ],
  )
  const { busy, run } = useAction()
  return (
    <Modal title={tr('Finalidades del tratamiento', 'Processing purposes')} onClose={onClose}>
      <div className="stack">
        {items.map((it, i) => (
          <div key={i} className="row">
            <input className="grow" value={it.label} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value, key: x.key || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30) } : x)))} />
            <label className="check">
              <input type="checkbox" checked={it.required} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> {tr('Obligatoria', 'Required')}
            </label>
            <button className="btn sm ghost danger" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <button className="btn" onClick={() => setItems([...items, { key: `f${Date.now() % 100000}`, label: '', required: false }])}>
          + {tr('Agregar finalidad', 'Add purpose')}
        </button>
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => run(() => api(`/api/datosok/policies/${policy.id}`, { method: 'PATCH', body: { purposes: items.filter((x) => x.label.trim()) } }), tr('Guardado', 'Saved')).then((r) => r && onClose())}
        >
          {tr('Guardar', 'Save')}
        </button>
      </div>
    </Modal>
  )
}

export function Consents() {
  useLang()
  const fields: FieldDef[] = [
    { name: 'created_at', label: tr('Fecha', 'Date'), type: 'datetime', form: false },
    { name: 'full_name', label: tr('Titular', 'Data subject'), required: true },
    { name: 'doc_type', label: tr('Tipo doc.', 'ID type'), default: 'CC', list: false },
    { name: 'doc_number', label: tr('Documento', 'ID number'), required: true },
    { name: 'email', label: tr('Correo', 'Email'), type: 'email' },
    { name: 'phone', label: tr('Celular', 'Phone'), list: false },
    { name: 'policy_id', label: tr('Versión de autorización', 'Consent version'), type: 'ref', ref: { endpoint: '/api/datosok/policies', label: 'version' }, required: true },
    { name: 'purposes_accepted', label: tr('Finalidades', 'Purposes'), type: 'tags', hint: tr('Claves separadas por coma', 'Comma-separated keys') },
    { name: 'source', label: tr('Origen', 'Source'), form: false },
    { name: 'evidence_hash', label: tr('Evidencia', 'Evidence'), form: false, render: (r) => <code className="small">{String(r.evidence_hash).slice(0, 16)}</code> },
  ]
  return (
    <ResourcePage
      title={tr('Autorizaciones recibidas', 'Consents received')}
      subtitle={tr('Registro con fecha, IP, navegador y huella SHA-256.', 'Log with date, IP, browser and SHA-256 fingerprint.')}
      endpoint="/api/datosok/consents"
      fields={fields}
      editable={false}
      deletable={false}
    />
  )
}

export function Requests() {
  useLang()
  const [resp, setResp] = useState<any | null>(null)
  const [text, setText] = useState('')
  const [key, setKey] = useState(0)
  const { busy, run } = useAction()
  const fields: FieldDef[] = [
    { name: 'radicado', label: tr('Radicado', 'Number'), form: false },
    { name: 'kind', label: tr('Tipo', 'Type'), type: 'select', options: [['consulta', 'Consulta'], ['reclamo', 'Reclamo'], ['actualizacion', 'Actualización'], ['rectificacion', 'Rectificación'], ['supresion', 'Supresión'], ['revocatoria', 'Revocatoria']], filter: true, form: false },
    { name: 'full_name', label: tr('Titular', 'Data subject'), form: false },
    { name: 'received_on', label: tr('Recibida', 'Received'), type: 'date', form: false },
    {
      name: 'due_on',
      label: tr('Vence', 'Due'),
      form: false,
      render: (r) => (
        <span>
          {fmtDate(r.due_on)}{' '}
          {r.business_days_left !== null && <Badge tone={r.business_days_left < 0 ? 'danger' : r.business_days_left <= 3 ? 'warn' : undefined}>{r.business_days_left} {tr('d. hábiles', 'bus. days')}</Badge>}
        </span>
      ),
    },
    { name: 'status', label: tr('Estado', 'Status'), type: 'select', options: [['recibida', tr('Recibida', 'Received')], ['en_tramite', tr('En trámite', 'In progress')], ['respondida', tr('Respondida', 'Answered')]], filter: true },
    { name: 'description', label: tr('Descripción', 'Description'), list: false, form: false },
  ]
  return (
    <>
      <ResourcePage
        title={tr('Consultas y reclamos', 'Requests')}
        subtitle={tr('Consultas: 10 días hábiles. Reclamos: 15 días hábiles.', 'Inquiries: 10 business days. Complaints: 15 business days.')}
        endpoint="/api/datosok/requests"
        fields={fields}
        creatable={false}
        deletable={false}
        reloadKey={key}
        rowActions={(r) =>
          r.status !== 'respondida' && (
            <button
              className="btn sm primary"
              onClick={() => {
                setResp(r)
                setText('')
              }}
            >
              {tr('Responder', 'Respond')}
            </button>
          )
        }
      />
      {resp && (
        <Modal title={`${tr('Responder', 'Respond')} ${resp.radicado}`} onClose={() => setResp(null)}>
          <div className="stack">
            <div className="card flat">
              <b>{resp.full_name}</b> · {resp.doc_number} · {resp.email}
              <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{resp.description}</p>
            </div>
            <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('Respuesta que se enviará por correo al titular', 'Response emailed to the data subject')} />
            <button
              className="btn primary"
              disabled={busy || text.length < 10}
              onClick={() =>
                run(() => api(`/api/datosok/requests/${resp.id}/respond`, { body: { response: text } }), tr('Respuesta enviada', 'Response sent')).then((r) => {
                  if (r) {
                    setResp(null)
                    setKey((k) => k + 1)
                  }
                })
              }
            >
              {tr('Enviar respuesta', 'Send response')}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
