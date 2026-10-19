import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import ResourcePage, { FieldDef } from '../components/ResourcePage'
import { Badge, ErrorBox, PageHead, Spinner, toast, useAction, useAsync } from '../components/ui'
import { fmtDate, tr, useLang } from '../i18n'

const RATING: Record<string, [string, string, 'danger' | 'warn' | 'ok']> = {
  critico: ['Crítico', 'Critical', 'danger'],
  moderadamente_aceptable: ['Moderadamente aceptable', 'Moderately acceptable', 'warn'],
  aceptable: ['Aceptable', 'Acceptable', 'ok'],
}

function Rating({ r, score }: { r: string | null; score?: number | null }) {
  if (!r) return <span className="muted">—</span>
  const x = RATING[r]
  return (
    <Badge tone={x[2]}>
      {score !== undefined && score !== null ? `${score.toFixed(1)}% · ` : ''}
      {tr(x[0], x[1])}
    </Badge>
  )
}

export function Companies() {
  useLang()
  const nav = useNavigate()
  const fields: FieldDef[] = [
    { name: 'name', label: tr('Empresa', 'Company'), required: true },
    { name: 'nit', label: 'NIT' },
    { name: 'workers', label: tr('N.º de trabajadores', 'Workers'), type: 'number', required: true, default: 1 },
    { name: 'risk_level', label: tr('Nivel de riesgo (I-V)', 'Risk level (I-V)'), type: 'select', options: [['1', 'I'], ['2', 'II'], ['3', 'III'], ['4', 'IV'], ['5', 'V']], default: '1', required: true },
    { name: 'standard', label: tr('Tabla', 'Table'), form: false, render: (r) => <Badge tone="info">{r.standard} {tr('ítems', 'items')}</Badge> },
    { name: 'last_rating', label: tr('Última evaluación', 'Last assessment'), form: false, render: (r) => <Rating r={r.last_rating} score={r.last_score} /> },
    { name: 'economic_activity', label: tr('Actividad económica', 'Economic activity'), list: false },
    { name: 'contact_name', label: tr('Contacto', 'Contact'), list: false },
    { name: 'contact_email', label: tr('Correo contacto', 'Contact email'), type: 'email', list: false },
  ]
  return <ResourcePage title={tr('Empresas', 'Companies')} endpoint="/api/sst0312/companies" fields={fields} onRowClick={(r) => nav(`/app/sst0312/company/${r.id}`)} />
}

export function CompanyDetail() {
  useLang()
  const { id } = useParams()
  const nav = useNavigate()
  const company = useAsync(() => api<any>(`/api/sst0312/companies/${id}`), [id])
  const assessments = useAsync(() => api<{ items: any[] }>(`/api/sst0312/assessments?company_id=${id}`), [id])
  const { busy, run } = useAction()
  if (!company.data) return company.error ? <ErrorBox error={company.error} /> : <Spinner />
  const c = company.data
  return (
    <div>
      <PageHead
        title={c.name}
        subtitle={`${c.workers} ${tr('trabajadores', 'workers')} · ${tr('riesgo', 'risk')} ${c.risk_level} · ${tr('aplica tabla de', 'applies table of')} ${c.standard} ${tr('estándares', 'standards')}`}
        actions={
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => run(() => api<any>('/api/sst0312/assessments', { body: { company_id: c.id, standard: c.standard, answers: {} } })).then((a) => a && nav(`/app/sst0312/assessment/${a.id}`))}
          >
            + {tr('Nueva autoevaluación', 'New assessment')}
          </button>
        }
      />
      <h3>{tr('Autoevaluaciones', 'Assessments')}</h3>
      <div className="table-wrap mb">
        <table>
          <tbody>
            {assessments.data?.items.map((a) => (
              <tr key={a.id} className="clickable" onClick={() => nav(`/app/sst0312/assessment/${a.id}`)}>
                <td>{fmtDate(a.assessed_on)}</td>
                <td>
                  {a.standard} {tr('ítems', 'items')}
                </td>
                <td>
                  <Rating r={a.rating} score={a.score} />
                </td>
                <td className="muted">{a.evaluator}</td>
              </tr>
            ))}
            {assessments.data?.items.length === 0 && (
              <tr>
                <td className="muted">{tr('Sin autoevaluaciones.', 'No assessments yet.')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h3>{tr('Plan de mejoramiento', 'Improvement plan')}</h3>
      <ActionsTable companyId={Number(id)} />
    </div>
  )
}

export function AssessmentEditor() {
  useLang()
  const { id } = useParams()
  const nav = useNavigate()
  const a = useAsync(() => api<any>(`/api/sst0312/assessments/${id}`), [id])
  const items = useAsync(async () => (a.data ? api<any[]>(`/api/sst0312/standards/${a.data.standard}`) : []), [a.data?.standard])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [obs, setObs] = useState<Record<string, string>>({})
  const { busy, run } = useAction()
  useEffect(() => {
    if (a.data) {
      setAnswers(a.data.answers || {})
      setObs(a.data.observations || {})
    }
  }, [a.data])
  if (!a.data || !items.data) return a.error ? <ErrorBox error={a.error} /> : <Spinner />
  const total = items.data.reduce((s, i) => s + (['cumple', 'no_aplica'].includes(answers[i.code]) ? i.weight : 0), 0)
  const answered = items.data.filter((i) => answers[i.code]).length
  const save = () => run(() => api(`/api/sst0312/assessments/${id}`, { method: 'PATCH', body: { answers, observations: obs } }), tr('Guardado', 'Saved')).then(a.reload)
  let lastGroup = ''
  return (
    <div>
      <PageHead
        title={tr('Autoevaluación de estándares mínimos', 'Minimum standards assessment')}
        subtitle={`${tr('Resolución 0312 de 2019', 'Resolution 0312/2019')} · ${a.data.standard} ${tr('ítems', 'items')} · ${fmtDate(a.data.assessed_on)}`}
        actions={
          <>
            <button className="btn" onClick={() => nav(`/app/sst0312/report/${id}`)}>
              📄 {tr('Informe', 'Report')}
            </button>
            <button
              className="btn"
              onClick={() =>
                save().then(() => run(() => api<any>(`/api/sst0312/assessments/${id}/plan`, { body: { days: 90 } })).then((r) => r && toast(tr(`${r.created} acciones creadas en el plan`, `${r.created} actions added to the plan`))))
              }
            >
              ⚙ {tr('Generar plan', 'Build plan')}
            </button>
            <button className="btn primary" disabled={busy} onClick={save}>
              {tr('Guardar', 'Save')}
            </button>
          </>
        }
      />
      <div className="card mb row between" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
        <span>
          {tr('Respondidos', 'Answered')}: {answered}/{items.data.length}
        </span>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{total.toFixed(1)}%</span>
        <Rating r={total < 60 ? 'critico' : total <= 85 ? 'moderadamente_aceptable' : 'aceptable'} />
      </div>
      <div className="stack">
        {items.data.map((i) => {
          const header = i.group !== lastGroup
          lastGroup = i.group
          return (
            <div key={i.code}>
              {header && (
                <h3 className="mt">
                  {i.cycle} · {i.group}
                </h3>
              )}
              <div className="card flat stack" style={{ gap: 8 }}>
                <div className="row between">
                  <span>
                    <b>{i.code}</b> {i.text} <span className="muted small">({Number(i.weight.toFixed(2))}%)</span>
                  </span>
                  <div className="toggle">
                    {[
                      ['cumple', tr('Cumple', 'Meets')],
                      ['no_cumple', tr('No cumple', 'Fails')],
                      ['no_aplica', tr('No aplica', 'N/A')],
                    ].map(([v, l]) => (
                      <button key={v} className={answers[i.code] === v ? 'on' : ''} onClick={() => setAnswers({ ...answers, [i.code]: v })}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                {answers[i.code] && answers[i.code] !== 'cumple' && (
                  <input placeholder={tr('Observación / justificación', 'Observation / justification')} value={obs[i.code] || ''} onChange={(e) => setObs({ ...obs, [i.code]: e.target.value })} />
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary lg" disabled={busy} onClick={save}>
          {tr('Guardar', 'Save')}
        </button>
      </div>
    </div>
  )
}

export function Report() {
  useLang()
  const { id } = useParams()
  const r = useAsync(() => api<any>(`/api/sst0312/assessments/${id}/report`), [id])
  if (!r.data) return r.error ? <ErrorBox error={r.error} /> : <Spinner />
  const { company, assessment, items, groups, actions } = r.data
  const label = (v: string) => (v === 'cumple' ? tr('Cumple', 'Meets') : v === 'no_cumple' ? tr('No cumple', 'Fails') : v === 'no_aplica' ? tr('No aplica', 'N/A') : '—')
  return (
    <div className="card stack">
      <div className="row between">
        <div>
          <h1>{tr('Informe de autoevaluación SG-SST', 'OHS self-assessment report')}</h1>
          <p className="muted">
            {company.name} {company.nit && `· NIT ${company.nit}`} · {fmtDate(assessment.assessed_on)} · {tr('Evaluador', 'Evaluator')}: {assessment.evaluator} ({r.data.tenant})
          </p>
        </div>
        <button className="btn" onClick={() => print()}>
          🖨 {tr('Imprimir / PDF', 'Print / PDF')}
        </button>
      </div>
      <div className="row">
        <span style={{ fontSize: 32, fontWeight: 800 }}>{assessment.score.toFixed(1)}%</span>
        <Rating r={assessment.rating} />
      </div>
      <p className="small muted">
        {assessment.rating === 'critico'
          ? tr('Crítico (<60%): plan de mejoramiento inmediato, enviarlo a la ARL y reportar a la Dirección Territorial del Ministerio del Trabajo; seguimiento anual.', 'Critical (<60%): immediate improvement plan.')
          : assessment.rating === 'moderadamente_aceptable'
            ? tr('Moderadamente aceptable (60-85%): plan de mejoramiento, enviarlo a la ARL y seguimiento.', 'Moderately acceptable (60-85%): improvement plan and follow-up.')
            : tr('Aceptable (>85%): mantener la calificación e incluir mejoras en el plan anual.', 'Acceptable (>85%): keep the score and include improvements in the annual plan.')}
      </p>
      <table>
        <thead>
          <tr>
            <th>{tr('Grupo', 'Group')}</th>
            <th>{tr('Obtenido', 'Obtained')}</th>
            <th>{tr('Máximo', 'Max')}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries<any>(groups).map(([g, v]) => (
            <tr key={g}>
              <td>
                {v.cycle} · {g}
              </td>
              <td>{v.obtained}</td>
              <td>{v.max}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>{tr('Detalle', 'Detail')}</h3>
      <table>
        <tbody>
          {items.map((i: any) => (
            <tr key={i.code}>
              <td className="nowrap">{i.code}</td>
              <td>
                {i.text}
                {i.observation && <div className="muted small">{i.observation}</div>}
              </td>
              <td className="nowrap">{label(i.answer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {actions.length > 0 && (
        <>
          <h3>{tr('Plan de mejoramiento', 'Improvement plan')}</h3>
          <table>
            <tbody>
              {actions.map((x: any) => (
                <tr key={x.id}>
                  <td>{x.item_code}</td>
                  <td>{x.description}</td>
                  <td>{x.responsible}</td>
                  <td className="nowrap">{fmtDate(x.due_date)}</td>
                  <td>{x.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="row mt" style={{ gap: 60 }}>
        <div>
          <br />
          ______________________________
          <br />
          {tr('Responsable SG-SST', 'OHS lead')}
        </div>
        <div>
          <br />
          ______________________________
          <br />
          {tr('Representante legal', 'Legal representative')}
        </div>
      </div>
    </div>
  )
}

function ActionsTable({ companyId }: { companyId?: number }) {
  useLang()
  const fields: FieldDef[] = [
    ...(companyId ? [] : [{ name: 'company_id', label: tr('Empresa', 'Company'), type: 'ref' as const, ref: { endpoint: '/api/sst0312/companies', label: 'name' }, required: true, filter: true }]),
    { name: 'item_code', label: tr('Ítem', 'Item') },
    { name: 'description', label: tr('Acción', 'Action'), type: 'textarea', required: true },
    { name: 'responsible', label: tr('Responsable', 'Owner') },
    { name: 'responsible_email', label: tr('Correo responsable', 'Owner email'), type: 'email', list: false },
    { name: 'due_date', label: tr('Fecha límite', 'Due date'), type: 'date' },
    { name: 'status', label: tr('Estado', 'Status'), type: 'select', options: [['pendiente', tr('Pendiente', 'Pending')], ['en_curso', tr('En curso', 'In progress')], ['cerrada', tr('Cerrada', 'Closed')]], default: 'pendiente', filter: true },
  ]
  return <ResourcePage title={tr('Plan de mejoramiento', 'Improvement plan')} hideHead={!!companyId} endpoint="/api/sst0312/actions" fields={fields} query={companyId ? { company_id: companyId } : undefined} />
}

export function Actions() {
  return <ActionsTable />
}
