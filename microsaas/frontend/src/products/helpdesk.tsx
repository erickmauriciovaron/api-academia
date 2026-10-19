import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import ResourcePage, { FieldDef, RecordForm } from '../components/ResourcePage'
import { Badge, ErrorBox, Modal, PageHead, Spinner, toast, useAction, useAsync } from '../components/ui'
import { fmtDateTime, tr, useLang } from '../i18n'

const PRIORITIES = (): [string, string][] => [
  ['critica', tr('Crítica', 'Critical')],
  ['alta', tr('Alta', 'High')],
  ['media', tr('Media', 'Medium')],
  ['baja', tr('Baja', 'Low')],
]
const STATUSES = (): [string, string][] => [
  ['abierto', tr('Abierto', 'Open')],
  ['en_progreso', tr('En progreso', 'In progress')],
  ['en_espera', tr('En espera', 'On hold')],
  ['resuelto', tr('Resuelto', 'Resolved')],
  ['cerrado', tr('Cerrado', 'Closed')],
]

function useAgentOptions(): [string, string][] {
  const team = useAsync(() => api<any[]>('/api/team'), [])
  return (team.data || []).map((u) => [String(u.id), u.name])
}

export function Tickets() {
  useLang()
  const agents = useAgentOptions()
  const [open, setOpen] = useState<any | null>(null)
  const [creating, setCreating] = useState(false)
  const [key, setKey] = useState(0)
  const fields: FieldDef[] = [
    { name: 'number', label: '#', form: false },
    { name: 'subject', label: tr('Asunto', 'Subject'), form: false },
    { name: 'client_name', label: tr('Cliente', 'Client'), form: false },
    { name: 'requester_name', label: tr('Solicitante', 'Requester'), form: false },
    { name: 'priority', label: tr('Prioridad', 'Priority'), type: 'select', options: PRIORITIES(), filter: true, render: (r) => <Badge tone={r.priority === 'critica' ? 'danger' : r.priority === 'alta' ? 'warn' : undefined}>{PRIORITIES().find((p) => p[0] === r.priority)?.[1]}</Badge> },
    { name: 'status', label: tr('Estado', 'Status'), type: 'select', options: STATUSES(), filter: true },
    { name: 'agent_user_id', label: tr('Agente', 'Agent'), type: 'select', options: agents, filter: true, render: (r) => r.agent_name || <span className="muted">—</span> },
    { name: 'sla_due_at', label: 'SLA', form: false, render: (r) => (r.sla_breached ? <Badge tone="danger">{tr('Incumplido', 'Breached')}</Badge> : <span className="small">{fmtDateTime(r.sla_due_at)}</span>) },
  ]
  return (
    <>
      <ResourcePage
        title={tr('Tickets', 'Tickets')}
        endpoint="/api/helpdesk/tickets"
        fields={fields}
        creatable={false}
        reloadKey={key}
        onRowClick={setOpen}
        headerActions={
          <button className="btn primary" onClick={() => setCreating(true)}>
            + {tr('Nuevo ticket', 'New ticket')}
          </button>
        }
      />
      {creating && (
        <Modal title={tr('Nuevo ticket', 'New ticket')} onClose={() => setCreating(false)}>
          <RecordForm
            fields={[
              { name: 'subject', label: tr('Asunto', 'Subject'), required: true },
              { name: 'requester_name', label: tr('Solicitante', 'Requester'), required: true },
              { name: 'requester_email', label: tr('Correo solicitante', 'Requester email'), type: 'email', required: true },
              { name: 'priority', label: tr('Prioridad', 'Priority'), type: 'select', options: PRIORITIES(), default: 'media', required: true },
              { name: 'client_id', label: tr('Cliente', 'Client'), type: 'ref', ref: { endpoint: '/api/helpdesk/clients', label: 'name' } },
              { name: 'agent_user_id', label: tr('Agente', 'Agent'), type: 'select', options: agents },
              { name: 'category', label: tr('Categoría', 'Category') },
              { name: 'description', label: tr('Descripción', 'Description'), type: 'textarea', required: true },
            ]}
            initial={{}}
            onSubmit={async (d) => {
              await api('/api/helpdesk/tickets/new', { body: { ...d, agent_user_id: d.agent_user_id ? Number(d.agent_user_id) : null } })
              toast(tr('Ticket creado', 'Ticket created'))
              setCreating(false)
              setKey((k) => k + 1)
            }}
          />
        </Modal>
      )}
      {open && (
        <TicketDetail
          id={open.id}
          agents={agents}
          onClose={() => {
            setOpen(null)
            setKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}

function TicketDetail({ id, agents, onClose }: { id: number; agents: [string, string][]; onClose: () => void }) {
  const t = useAsync(() => api<any>(`/api/helpdesk/tickets/${id}`), [id])
  const comments = useAsync(() => api<any[]>(`/api/helpdesk/tickets/${id}/comments`), [id])
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const { busy, run } = useAction()
  const patch = (data: any) => run(() => api(`/api/helpdesk/tickets/${id}`, { method: 'PATCH', body: data })).then(t.reload)
  if (!t.data) return null
  const tk = t.data
  return (
    <Modal wide title={`#${tk.number} · ${tk.subject}`} onClose={onClose}>
      <div className="stack">
        <div className="row">
          <select style={{ width: 'auto' }} value={tk.status} onChange={(e) => patch({ status: e.target.value })}>
            {STATUSES().map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select style={{ width: 'auto' }} value={tk.priority} onChange={(e) => patch({ priority: e.target.value })}>
            {PRIORITIES().map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select style={{ width: 'auto' }} value={tk.agent_user_id || ''} onChange={(e) => patch({ agent_user_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">{tr('Sin agente', 'Unassigned')}</option>
            {agents.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          {tk.sla_breached ? <Badge tone="danger">SLA {tr('incumplido', 'breached')}</Badge> : <Badge>SLA {fmtDateTime(tk.sla_due_at)}</Badge>}
        </div>
        <div className="card flat">
          <div className="small muted">
            {tk.requester_name} &lt;{tk.requester_email}&gt; · {fmtDateTime(tk.created_at)} {tk.client_name && `· ${tk.client_name}`}
          </div>
          <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{tk.description}</p>
        </div>
        {comments.data?.map((c) => (
          <div key={c.id} className="card flat" style={{ borderLeft: `3px solid ${c.internal ? 'var(--warn)' : c.from_requester ? 'var(--border)' : 'var(--accent)'}` }}>
            <div className="row between small muted">
              <b>
                {c.author_name} {c.internal && `· ${tr('nota interna', 'internal note')}`}
              </b>
              <span>{fmtDateTime(c.created_at)}</span>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{c.body}</p>
          </div>
        ))}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr('Escribe una respuesta…', 'Write a reply…')} />
        <div className="row between">
          <label className="check">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> {tr('Nota interna (no se envía al solicitante)', 'Internal note (not sent to requester)')}
          </label>
          <button
            className="btn primary"
            disabled={busy || !body.trim()}
            onClick={() =>
              run(() => api(`/api/helpdesk/tickets/${id}/comments`, { body: { body, internal } })).then((r) => {
                if (r) {
                  setBody('')
                  comments.reload()
                  t.reload()
                }
              })
            }
          >
            {internal ? tr('Guardar nota', 'Save note') : tr('Responder', 'Reply')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function Clients() {
  useLang()
  const fields: FieldDef[] = [
    { name: 'name', label: tr('Cliente', 'Client'), required: true },
    { name: 'email_domain', label: tr('Dominio de correo', 'Email domain'), hint: tr('Ej. acme.com: los tickets de @acme.com se asignan a este cliente', 'E.g. acme.com: tickets from @acme.com map to this client') },
    { name: 'contact_email', label: tr('Correo para reporte mensual', 'Monthly report email'), type: 'email' },
  ]
  return <ResourcePage title={tr('Clientes', 'Clients')} endpoint="/api/helpdesk/clients" fields={fields} />
}

export function Report() {
  useLang()
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const r = useAsync(() => api<any>(`/api/helpdesk/report?month=${month}`), [month])
  return (
    <div className="card stack">
      <div className="row between">
        <div>
          <h1>{tr('Reporte SLA mensual', 'Monthly SLA report')}</h1>
          <p className="muted">{r.data?.tenant}</p>
        </div>
        <div className="row no-print">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn" onClick={() => print()}>
            🖨 PDF
          </button>
        </div>
      </div>
      <ErrorBox error={r.error} />
      {!r.data ? (
        <Spinner />
      ) : r.data.rows.length === 0 ? (
        <p className="muted">{tr('Sin tickets en el mes.', 'No tickets this month.')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{tr('Cliente', 'Client')}</th>
              <th>{tr('Tickets', 'Tickets')}</th>
              <th>{tr('Resueltos', 'Resolved')}</th>
              <th>{tr('% dentro de SLA', '% within SLA')}</th>
              <th>{tr('Resolución promedio (h)', 'Avg resolution (h)')}</th>
              <th>{tr('Por prioridad', 'By priority')}</th>
            </tr>
          </thead>
          <tbody>
            {r.data.rows.map((x: any) => (
              <tr key={x.client}>
                <td>{x.client}</td>
                <td>{x.total}</td>
                <td>{x.resolved}</td>
                <td>{x.sla_pct === null ? '—' : <Badge tone={x.sla_pct >= 90 ? 'ok' : x.sla_pct >= 75 ? 'warn' : 'danger'}>{x.sla_pct}%</Badge>}</td>
                <td>{x.avg_resolution_hours ?? '—'}</td>
                <td className="small">
                  {Object.entries(x.by_priority)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function Settings() {
  useLang()
  const { me } = useAuth()
  const s = useAsync(() => api<any>('/api/helpdesk/settings'), [])
  const agents = useAsync(() => api<{ items: any[] }>('/api/helpdesk/agents'), [])
  const team = useAsync(() => api<any[]>('/api/team'), [])
  const [sla, setSla] = useState<any>(null)
  const { busy, run } = useAction()
  useEffect(() => {
    if (s.data) setSla(s.data.sla)
  }, [s.data])
  if (!s.data || !sla) return s.error ? <ErrorBox error={s.error} /> : <Spinner />
  const agentIds = new Set((agents.data?.items || []).map((a) => a.user_id))
  return (
    <div style={{ maxWidth: 760 }} className="stack">
      <PageHead title={tr('Configuración', 'Settings')} />
      <div className="card stack">
        <h3>{tr('Portal de soporte', 'Support portal')}</h3>
        <div className="row">
          <input readOnly value={s.data.portal_url} className="grow" onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={() => navigator.clipboard.writeText(s.data.portal_url).then(() => toast(tr('Copiado', 'Copied')))}>
            {tr('Copiar', 'Copy')}
          </button>
        </div>
      </div>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault()
          run(() => api('/api/helpdesk/settings', { method: 'PUT', body: Object.fromEntries(Object.entries(sla).map(([k, v]) => [k, Number(v)])) }), tr('Guardado', 'Saved'))
        }}
      >
        <h3>{tr('SLA de resolución (horas)', 'Resolution SLA (hours)')}</h3>
        <div className="grid grid-4">
          {PRIORITIES().map(([k, l]) => (
            <label key={k} className="field">
              {l}
              <input type="number" min={1} value={sla[k]} onChange={(e) => setSla({ ...sla, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <button className="btn primary" disabled={busy}>
          {tr('Guardar', 'Save')}
        </button>
      </form>
      <div className="card stack">
        <h3>{tr('Agentes', 'Agents')}</h3>
        <p className="muted small" style={{ margin: 0 }}>
          {tr('Los agentes cuentan para el límite del plan. Invita usuarios en "Equipo".', 'Agents count toward the plan limit. Invite users in "Team".')}
        </p>
        {team.data?.map((u) => {
          const agent = agents.data?.items.find((a) => a.user_id === u.id)
          return (
            <div key={u.id} className="row between">
              <span>
                {u.name} <span className="muted small">{u.email}</span>
              </span>
              {me?.role !== 'member' &&
                (agentIds.has(u.id) ? (
                  <button className="btn sm danger" onClick={() => run(() => api(`/api/helpdesk/agents/${agent.id}`, { method: 'DELETE' })).then(agents.reload)}>
                    {tr('Quitar agente', 'Remove agent')}
                  </button>
                ) : (
                  <button className="btn sm" onClick={() => run(() => api('/api/helpdesk/agents', { body: { user_id: u.id } })).then(agents.reload)}>
                    {tr('Hacer agente', 'Make agent')}
                  </button>
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
