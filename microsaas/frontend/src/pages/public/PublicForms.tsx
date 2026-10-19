import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import { useAuth } from '../../auth'
import SignaturePad, { SignaturePadHandle } from '../../components/SignaturePad'
import { ErrorBox, Spinner, Tabs, useAsync } from '../../components/ui'
import { fmtDate, fmtDateTime, setLang, tr, useLang } from '../../i18n'

function Frame({ company, children }: { company?: string; children: React.ReactNode }) {
  const lang = useLang()
  return (
    <div className="public-page">
      <div className="row between mb">
        <strong style={{ fontSize: 18 }}>{company}</strong>
        <button className="btn ghost sm" onClick={() => setLang(lang === 'es' ? 'en' : 'es')}>
          🌐 {lang.toUpperCase()}
        </button>
      </div>
      {children}
      <p className="muted small center mt">Powered by MicroSuite</p>
    </div>
  )
}

/* ---------- AssetTrack: firma de acta ---------- */
export function HandoverDocument({ h }: { h: any }) {
  const a = h.asset || {}
  const p = h.person || {}
  const title = h.kind === 'entrega' ? tr('ACTA DE ENTREGA DE EQUIPO', 'EQUIPMENT HANDOVER FORM') : tr('ACTA DE DEVOLUCIÓN DE EQUIPO', 'EQUIPMENT RETURN FORM')
  return (
    <div className="card stack">
      <h2 className="center">{title}</h2>
      <p className="center muted">
        {h.company} · {fmtDate(h.created_at)} · N.º {h.id}
      </p>
      <table>
        <tbody>
          <tr><th>{tr('Empleado', 'Employee')}</th><td>{p.name} {p.document_id && `· ${p.document_id}`}</td></tr>
          <tr><th>{tr('Cargo / Área', 'Position / Area')}</th><td>{[p.position, p.area].filter(Boolean).join(' · ') || '—'}</td></tr>
          <tr><th>{tr('Activo', 'Asset')}</th><td>{a.tag} · {a.category} {a.brand} {a.model}</td></tr>
          <tr><th>{tr('Serial', 'Serial')}</th><td>{a.serial || '—'}</td></tr>
          <tr><th>{tr('Especificaciones', 'Specs')}</th><td style={{ whiteSpace: 'pre-wrap' }}>{a.specs || '—'}</td></tr>
          <tr><th>{tr('Accesorios', 'Accessories')}</th><td>{h.accessories || '—'}</td></tr>
          <tr><th>{tr('Estado del equipo', 'Condition')}</th><td>{h.condition || tr('Bueno', 'Good')}</td></tr>
          <tr><th>{tr('Entregado por', 'Delivered by')}</th><td>{h.delivered_by}</td></tr>
        </tbody>
      </table>
      <p className="small">
        {h.kind === 'entrega'
          ? tr(
              'Declaro que recibo el equipo descrito en buen estado y me comprometo a usarlo exclusivamente para labores de la empresa, cuidarlo y devolverlo cuando se me solicite o al terminar mi vínculo laboral. Reportaré de inmediato cualquier daño, pérdida o robo.',
              'I confirm I received the equipment described in good condition and agree to use it only for company work, take care of it and return it when requested or when my employment ends. I will immediately report any damage, loss or theft.',
            )
          : tr('Declaro que devuelvo el equipo descrito en el estado indicado.', 'I confirm I am returning the equipment described in the stated condition.')}
      </p>
      {h.signed_at && (
        <div>
          <img src={h.signature} alt="firma" style={{ maxWidth: 320, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} />
          <p className="small muted">
            {tr('Firmado por', 'Signed by')} {h.signer_name} · {fmtDateTime(h.signed_at)} · IP {h.signer_ip}
          </p>
        </div>
      )}
    </div>
  )
}

export function SignHandover() {
  useLang()
  const { token } = useParams()
  const h = useAsync(() => api<any>(`/api/public/assettrack/handover/${token}`), [token])
  const pad = useRef<SignaturePadHandle>(null)
  const [name, setName] = useState('')
  const [accept, setAccept] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!h.data) return <Frame>{h.error ? <ErrorBox error={h.error} /> : <Spinner />}</Frame>
  const sign = async () => {
    setError(null)
    if (pad.current?.isEmpty()) return setError(tr('Dibuja tu firma', 'Draw your signature'))
    setBusy(true)
    try {
      h.setData(await api(`/api/public/assettrack/handover/${token}/sign`, { body: { signer_name: name, signature: pad.current!.toDataURL() } }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Frame company={h.data.company}>
      <HandoverDocument h={h.data} />
      {h.data.signed_at ? (
        <div className="alert ok mt">
          {tr('Acta firmada. Puedes imprimirla o guardarla en PDF.', 'Form signed. You can print it or save it as PDF.')}{' '}
          <button className="btn sm" onClick={() => print()}>
            🖨
          </button>
        </div>
      ) : (
        <div className="card stack mt">
          <label className="field">
            {tr('Nombre completo', 'Full name')}
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div>
            <div className="row between">
              <span>{tr('Firma', 'Signature')}</span>
              <button className="btn sm ghost" onClick={() => pad.current?.clear()}>
                {tr('Borrar', 'Clear')}
              </button>
            </div>
            <SignaturePad ref={pad} />
          </div>
          <label className="check">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} /> {tr('Acepto el contenido de esta acta', 'I accept the content of this form')}
          </label>
          <ErrorBox error={error} />
          <button className="btn primary" disabled={!accept || name.length < 3 || busy} onClick={sign}>
            {tr('Firmar', 'Sign')}
          </button>
        </div>
      )}
    </Frame>
  )
}

/* ---------- DatosOK: autorización y solicitudes ---------- */
const KINDS: [string, string, string][] = [
  ['consulta', 'Consulta (qué datos tienen)', 'Inquiry (what data you hold)'],
  ['actualizacion', 'Actualización', 'Update'],
  ['rectificacion', 'Rectificación', 'Correction'],
  ['supresion', 'Supresión (eliminar mis datos)', 'Deletion'],
  ['revocatoria', 'Revocar autorización', 'Revoke consent'],
  ['reclamo', 'Reclamo', 'Complaint'],
]

export function DatosForm() {
  useLang()
  const { key } = useParams()
  const info = useAsync(() => api<any>(`/api/public/datosok/${key}`), [key])
  const [tab, setTab] = useState<'auth' | 'req' | 'status'>('auth')
  if (!info.data) return <Frame>{info.error ? <ErrorBox error={info.error} /> : <Spinner />}</Frame>
  return (
    <Frame company={info.data.company}>
      <h1>{tr('Protección de datos personales', 'Personal data protection')}</h1>
      <Tabs value={tab} onChange={setTab} items={[['auth', tr('Autorizar', 'Consent')], ['req', tr('Hacer una solicitud', 'Make a request')], ['status', tr('Consultar radicado', 'Check request')]]} />
      {tab === 'auth' && <ConsentForm k={key!} policy={info.data.policy} />}
      {tab === 'req' && <RequestForm k={key!} />}
      {tab === 'status' && <StatusLookup k={key!} />}
    </Frame>
  )
}

function ConsentForm({ k, policy }: { k: string; policy: any }) {
  const [f, setF] = useState({ full_name: '', doc_type: 'CC', doc_number: '', email: '', phone: '' })
  const [purposes, setPurposes] = useState<string[]>(() => (policy?.purposes || []).filter((p: any) => p.required).map((p: any) => p.key))
  const [accept, setAccept] = useState(false)
  const [done, setDone] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  if (!policy) return <div className="alert">{tr('La empresa aún no ha publicado su autorización.', 'The company has not published its consent form yet.')}</div>
  if (done)
    return (
      <div className="alert ok">
        {tr('Autorización registrada. Código de evidencia:', 'Consent recorded. Evidence code:')} <b>{done.evidence}</b>
      </div>
    )
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      setDone(await api(`/api/public/datosok/${k}/consent`, { body: { ...f, email: f.email || null, purposes_accepted: purposes, accept } }))
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <form className="card stack" onSubmit={submit}>
      <h3>{policy.title}</h3>
      <div style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto' }} className="small">
        {policy.text}
      </div>
      {policy.policy_url && (
        <a href={policy.policy_url} target="_blank" rel="noreferrer">
          {tr('Ver política de tratamiento completa', 'See full privacy policy')} ↗
        </a>
      )}
      <div className="grid grid-2">
        <label className="field">
          {tr('Nombre completo', 'Full name')} *
          <input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        </label>
        <label className="field">
          {tr('Documento', 'ID number')} *
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <select style={{ width: 90 }} value={f.doc_type} onChange={(e) => setF({ ...f, doc_type: e.target.value })}>
              {['CC', 'CE', 'NIT', 'PP', 'TI', 'PPT'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <input required value={f.doc_number} onChange={(e) => setF({ ...f, doc_number: e.target.value })} />
          </div>
        </label>
        <label className="field">
          {tr('Correo', 'Email')}
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </label>
        <label className="field">
          {tr('Celular', 'Phone')}
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <strong>{tr('Finalidades', 'Purposes')}</strong>
        {(policy.purposes || []).map((p: any) => (
          <label key={p.key} className="check">
            <input
              type="checkbox"
              disabled={p.required}
              checked={purposes.includes(p.key)}
              onChange={(e) => setPurposes((s) => (e.target.checked ? [...s, p.key] : s.filter((x) => x !== p.key)))}
            />
            {p.label} {p.required && <span className="muted small">({tr('obligatoria', 'required')})</span>}
          </label>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
        {tr('Autorizo de manera previa, expresa e informada el tratamiento de mis datos personales.', 'I give prior, express and informed consent to the processing of my personal data.')}
      </label>
      <ErrorBox error={error} />
      <button className="btn primary" disabled={!accept}>
        {tr('Autorizar', 'Give consent')}
      </button>
    </form>
  )
}

function RequestForm({ k }: { k: string }) {
  const [f, setF] = useState({ kind: 'consulta', full_name: '', doc_number: '', email: '', phone: '', description: '' })
  const [done, setDone] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  if (done)
    return (
      <div className="alert ok">
        {tr('Solicitud radicada:', 'Request filed:')} <b>{done.radicado}</b>. {tr('Fecha máxima de respuesta:', 'Response due by:')} <b>{fmtDate(done.due_on)}</b>
      </div>
    )
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          setDone(await api(`/api/public/datosok/${k}/request`, { body: { ...f, phone: f.phone || null } }))
        } catch (err) {
          setError((err as Error).message)
        }
      }}
    >
      <label className="field">
        {tr('Tipo de solicitud', 'Request type')}
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          {KINDS.map(([v, es, en]) => (
            <option key={v} value={v}>
              {tr(es, en)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-2">
        <label className="field">
          {tr('Nombre completo', 'Full name')} *
          <input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        </label>
        <label className="field">
          {tr('Número de documento', 'ID number')} *
          <input required value={f.doc_number} onChange={(e) => setF({ ...f, doc_number: e.target.value })} />
        </label>
        <label className="field">
          {tr('Correo para la respuesta', 'Email for the response')} *
          <input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </label>
        <label className="field">
          {tr('Celular', 'Phone')}
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </label>
      </div>
      <label className="field">
        {tr('Descripción', 'Description')} *
        <textarea required minLength={10} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <ErrorBox error={error} />
      <button className="btn primary">{tr('Enviar solicitud', 'Submit request')}</button>
    </form>
  )
}

function StatusLookup({ k }: { k: string }) {
  const [rad, setRad] = useState('')
  const [doc, setDoc] = useState('')
  const [res, setRes] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="card stack">
      <div className="grid grid-2">
        <label className="field">
          {tr('Radicado', 'Request number')}
          <input value={rad} onChange={(e) => setRad(e.target.value)} />
        </label>
        <label className="field">
          {tr('Número de documento', 'ID number')}
          <input value={doc} onChange={(e) => setDoc(e.target.value)} />
        </label>
      </div>
      <button
        className="btn primary"
        onClick={async () => {
          setError(null)
          try {
            setRes(await api(`/api/public/datosok/${k}/request/${encodeURIComponent(rad.trim())}?doc=${encodeURIComponent(doc.trim())}`))
          } catch (e) {
            setRes(null)
            setError((e as Error).message)
          }
        }}
      >
        {tr('Consultar', 'Check')}
      </button>
      <ErrorBox error={error} />
      {res && (
        <div className="alert">
          <b>{res.radicado}</b> · {res.status} · {tr('vence', 'due')} {fmtDate(res.due_on)}
          {res.response && <p style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{res.response}</p>}
        </div>
      )}
    </div>
  )
}

/* ---------- HelpDesk: portal ---------- */
export function SupportPortal() {
  useLang()
  const { key } = useParams()
  const nav = useNavigate()
  const info = useAsync(() => api<any>(`/api/public/helpdesk/${key}`), [key])
  const [f, setF] = useState({ requester_name: '', requester_email: '', subject: '', description: '', priority: 'media' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!info.data) return <Frame>{info.error ? <ErrorBox error={info.error} /> : <Spinner />}</Frame>
  return (
    <Frame company={info.data.company}>
      <h1>{tr('Soporte', 'Support')}</h1>
      <p className="muted">{tr('Cuéntanos qué necesitas y te responderemos por correo.', "Tell us what you need and we'll reply by email.")}</p>
      <form
        className="card stack"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            const r = await api<any>(`/api/public/helpdesk/${key}/tickets`, { body: f })
            nav(`/soporte/${key}/t/${r.token}`)
          } catch (err) {
            setError((err as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="grid grid-2">
          <label className="field">
            {tr('Nombre', 'Name')} *
            <input required value={f.requester_name} onChange={(e) => setF({ ...f, requester_name: e.target.value })} />
          </label>
          <label className="field">
            {tr('Correo', 'Email')} *
            <input type="email" required value={f.requester_email} onChange={(e) => setF({ ...f, requester_email: e.target.value })} />
          </label>
        </div>
        <label className="field">
          {tr('Asunto', 'Subject')} *
          <input required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        </label>
        <label className="field">
          {tr('Prioridad', 'Priority')}
          <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            <option value="baja">{tr('Baja', 'Low')}</option>
            <option value="media">{tr('Media', 'Medium')}</option>
            <option value="alta">{tr('Alta', 'High')}</option>
            <option value="critica">{tr('Crítica (todo detenido)', 'Critical (everything down)')}</option>
          </select>
        </label>
        <label className="field">
          {tr('Descripción', 'Description')} *
          <textarea required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy}>
          {tr('Crear ticket', 'Create ticket')}
        </button>
      </form>
    </Frame>
  )
}

export function SupportTicket() {
  useLang()
  const { key, token } = useParams()
  const t = useAsync(() => api<any>(`/api/public/helpdesk/${key}/t/${token}`), [key, token])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  if (!t.data) return <Frame>{t.error ? <ErrorBox error={t.error} /> : <Spinner />}</Frame>
  const tk = t.data.ticket
  return (
    <Frame company={t.data.company}>
      <div className="row between">
        <h2>
          #{tk.number} · {tk.subject}
        </h2>
        <span className="badge info">{tk.status}</span>
      </div>
      <div className="card stack">
        <p style={{ whiteSpace: 'pre-wrap' }}>{tk.description}</p>
        <span className="muted small">{fmtDateTime(tk.created_at)}</span>
      </div>
      <div className="stack mt">
        {t.data.comments.map((c: any, i: number) => (
          <div key={i} className="card flat" style={{ borderLeft: `3px solid ${c.from_requester ? 'var(--border)' : 'var(--accent)'}` }}>
            <div className="row between small muted">
              <b>{c.author_name}</b> <span>{fmtDateTime(c.created_at)}</span>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{c.body}</p>
          </div>
        ))}
      </div>
      <div className="card stack mt">
        <textarea placeholder={tr('Escribe una respuesta…', 'Write a reply…')} value={body} onChange={(e) => setBody(e.target.value)} />
        <button
          className="btn primary"
          disabled={!body.trim() || busy}
          onClick={async () => {
            setBusy(true)
            try {
              await api(`/api/public/helpdesk/${key}/t/${token}/comments`, { body: { body } })
              setBody('')
              t.reload()
            } finally {
              setBusy(false)
            }
          }}
        >
          {tr('Responder', 'Reply')}
        </button>
      </div>
      <p className="center mt">
        <Link to={`/soporte/${key}`}>{tr('Crear otro ticket', 'Create another ticket')}</Link>
      </p>
    </Frame>
  )
}

/* ---------- Callback de consentimiento Microsoft 365 ---------- */
export function M365Callback() {
  const nav = useNavigate()
  const { me, loading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (loading) return
    if (!me) {
      setError(tr('Inicia sesión y vuelve a intentar la conexión.', 'Log in and try connecting again.'))
      return
    }
    const p = new URLSearchParams(location.search)
    api<any>('/api/m365/callback', {
      body: { state: p.get('state'), tenant: p.get('tenant'), admin_consent: p.get('admin_consent'), error: p.get('error'), error_description: p.get('error_description') },
    })
      .then((r) => nav(`/app/${r.product}?connected=1`))
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])
  return <div className="public-page">{error ? <ErrorBox error={error} /> : <Spinner />}</div>
}
