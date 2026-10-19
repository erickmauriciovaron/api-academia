import { Link } from 'react-router-dom'
import { api } from '../api'
import ResourcePage, { FieldDef } from '../components/ResourcePage'
import { Badge, Empty, ErrorBox, PageHead, Spinner, Stat, useAsync } from '../components/ui'
import { fmtDate, tr, useLang } from '../i18n'

const KINDS = (): [string, string][] => [
  ['vehiculo', tr('Vehículo', 'Vehicle')],
  ['persona', tr('Persona', 'Person')],
  ['empresa', tr('Empresa', 'Company')],
  ['contrato', tr('Contrato', 'Contract')],
  ['equipo', tr('Equipo', 'Equipment')],
  ['otro', tr('Otro', 'Other')],
]

export function StatusTag({ row }: { row: any }) {
  if (row.status === 'vencido') return <Badge tone="danger">{tr(`Vencido (${-row.days_left} d)`, `Expired (${-row.days_left} d)`)}</Badge>
  if (row.status === 'por_vencer') return <Badge tone="warn">{tr(`Vence en ${row.days_left} d`, `Due in ${row.days_left} d`)}</Badge>
  return <Badge tone="ok">{tr('Al día', 'OK')}</Badge>
}

export function Dashboard() {
  useLang()
  const d = useAsync(() => api<any>('/api/venceya/dashboard'), [])
  if (!d.data) return d.error ? <ErrorBox error={d.error} /> : <Spinner />
  const c = d.data.counts
  return (
    <div>
      <PageHead title={tr('Vencimientos', 'Expirations')} subtitle={tr('Te avisamos por correo y WhatsApp a 30, 15, 7 y 1 día.', 'We alert you by email and WhatsApp 30, 15, 7 and 1 day before.')} />
      <div className="grid grid-3 mb">
        <Stat label={tr('Vencidos', 'Expired')} value={c.vencido} tone="danger" />
        <Stat label={tr('Por vencer (30 días)', 'Due in 30 days')} value={c.por_vencer} tone="warn" />
        <Stat label={tr('Al día', 'OK')} value={c.al_dia} tone="ok" />
      </div>
      {d.data.upcoming.length === 0 ? (
        <Empty>
          {tr('Todo al día. ', 'All good. ')}
          <Link to="documents">{tr('Agrega documentos', 'Add documents')}</Link>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr('Documento', 'Document')}</th>
                <th>{tr('De', 'For')}</th>
                <th>{tr('Vence', 'Expires')}</th>
                <th>{tr('Estado', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {d.data.upcoming.map((x: any) => (
                <tr key={x.id}>
                  <td>
                    {x.doc_type} {x.number && <span className="muted small">#{x.number}</span>}
                  </td>
                  <td>{x.entity_name}</td>
                  <td>{fmtDate(x.expires_on)}</td>
                  <td>
                    <StatusTag row={x} />
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

export function Entities() {
  useLang()
  const fields: FieldDef[] = [
    { name: 'name', label: tr('Nombre', 'Name'), required: true },
    { name: 'kind', label: tr('Tipo', 'Type'), type: 'select', options: KINDS(), default: 'vehiculo', filter: true },
    { name: 'reference', label: tr('Referencia (placa, cédula, NIT)', 'Reference (plate, ID)') },
    { name: 'notes', label: tr('Notas', 'Notes'), type: 'textarea', list: false },
  ]
  return <ResourcePage title={tr('Vehículos, personas y contratos', 'Vehicles, people & contracts')} endpoint="/api/venceya/entities" fields={fields} importable />
}

export function Documents() {
  useLang()
  const fields: FieldDef[] = [
    { name: 'entity_id', label: tr('Pertenece a', 'Belongs to'), type: 'ref', ref: { endpoint: '/api/venceya/entities', label: 'name' }, required: true, filter: true },
    { name: 'doc_type', label: tr('Documento', 'Document'), required: true, hint: tr('SOAT, Técnico-mecánica, Póliza, Licencia, Certificado de alturas…', 'Insurance, inspection, license, certificate…') },
    { name: 'number', label: tr('Número', 'Number') },
    { name: 'expires_on', label: tr('Vence', 'Expires'), type: 'date', required: true },
    { name: 'status', label: tr('Estado', 'Status'), form: false, render: (r) => <StatusTag row={r} /> },
    { name: 'responsible_email', label: tr('Correo responsable', 'Owner email'), type: 'email', list: false },
    { name: 'responsible_phone', label: tr('WhatsApp responsable', 'Owner WhatsApp'), list: false, hint: tr('Con indicativo, ej. 573001234567', 'With country code, e.g. 15551234567') },
    { name: 'notes', label: tr('Notas', 'Notes'), type: 'textarea', list: false },
  ]
  return (
    <ResourcePage
      title={tr('Documentos', 'Documents')}
      endpoint="/api/venceya/documents"
      fields={fields}
      importable
      importHint={tr('Incluye la columna entity_id con el ID de la entidad (ver exportación de entidades).', 'Include entity_id column with the entity ID (see entities export).')}
    />
  )
}
