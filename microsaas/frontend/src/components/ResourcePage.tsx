import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { api, download } from '../api'
import { fmtDate, fmtDateTime, money, tr } from '../i18n'
import { Badge, Empty, ErrorBox, Modal, PageHead, Spinner, toast, useAction, useAsync } from './ui'

export type FieldDef = {
  name: string
  label: string
  type?: 'text' | 'number' | 'date' | 'datetime' | 'email' | 'select' | 'textarea' | 'checkbox' | 'ref' | 'money' | 'tags' | 'multi'
  options?: [string, string][]
  ref?: { endpoint: string; label: string }
  required?: boolean
  list?: boolean
  form?: boolean
  hint?: string
  render?: (row: any) => ReactNode
  default?: unknown
  filter?: boolean
}

type Props = {
  title: string
  subtitle?: ReactNode
  endpoint: string
  fields: FieldDef[]
  query?: Record<string, string | number | undefined>
  importable?: boolean
  exportable?: boolean
  creatable?: boolean
  editable?: boolean
  deletable?: boolean
  rowActions?: (row: any, reload: () => void) => ReactNode
  headerActions?: ReactNode
  onRowClick?: (row: any) => void
  hideHead?: boolean
  emptyText?: string
  importHint?: string
  reloadKey?: number
}

export function useRefOptions(fields: FieldDef[]) {
  const [opts, setOpts] = useState<Record<string, [string, string][]>>({})
  useEffect(() => {
    fields
      .filter((f) => f.type === 'ref' && f.ref)
      .forEach((f) => {
        api<{ items: any[] }>(`${f.ref!.endpoint}?limit=1000`)
          .then((r) => setOpts((o) => ({ ...o, [f.name]: r.items.map((x) => [String(x.id), String(x[f.ref!.label] ?? x.id)]) })))
          .catch(() => undefined)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.map((f) => f.name).join(',')])
  return opts
}

export function displayValue(f: FieldDef, row: any, refOpts: Record<string, [string, string][]>): ReactNode {
  if (f.render) return f.render(row)
  const v = row[f.name]
  if (v === null || v === undefined || v === '') return <span className="muted">—</span>
  switch (f.type) {
    case 'date':
      return fmtDate(v)
    case 'datetime':
      return fmtDateTime(v)
    case 'money':
      return money(v, row.currency || 'USD')
    case 'checkbox':
      return v ? '✓' : '—'
    case 'select':
      return <Badge>{f.options?.find((o) => o[0] === String(v))?.[1] ?? v}</Badge>
    case 'ref':
      return refOpts[f.name]?.find((o) => o[0] === String(v))?.[1] ?? `#${v}`
    case 'tags':
      return Array.isArray(v) ? v.join(', ') : String(v)
    case 'multi':
      return Array.isArray(v) ? v.map((x) => f.options?.find((o) => o[0] === x)?.[1] ?? x).join(', ') : String(v)
    default:
      return String(v)
  }
}

function toFormValue(f: FieldDef, v: unknown): any {
  if (f.type === 'multi') return Array.isArray(v) ? v : []
  if (v === null || v === undefined) return f.type === 'checkbox' ? false : ''
  if (f.type === 'tags' && Array.isArray(v)) return v.join(', ')
  if (f.type === 'datetime' && typeof v === 'string') return v.slice(0, 16)
  return v
}

function fromFormValue(f: FieldDef, v: any): unknown {
  if (f.type === 'checkbox') return !!v
  if (f.type === 'multi') return v || []
  if (v === '' || v === undefined) return null
  if (f.type === 'number') return Number(v)
  if (f.type === 'ref') return Number(v)
  if (f.type === 'tags') return String(v).split(',').map((x) => x.trim()).filter(Boolean)
  return v
}

export function FieldInput({ f, value, onChange, refOpts }: { f: FieldDef; value: any; onChange: (v: any) => void; refOpts: Record<string, [string, string][]> }) {
  const common = { id: `f-${f.name}`, required: f.required }
  let input: ReactNode
  switch (f.type) {
    case 'textarea':
      input = <textarea {...common} value={value} onChange={(e) => onChange(e.target.value)} />
      break
    case 'select':
      input = (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)}>
          {!f.required && <option value="">—</option>}
          {f.options?.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      )
      break
    case 'ref':
      input = (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{tr('— Seleccionar —', '— Select —')}</option>
          {(refOpts[f.name] || []).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      )
      break
    case 'multi':
      input = (
        <div className="stack" style={{ gap: 4 }}>
          {f.options?.map(([k, l]) => (
            <label key={k} className="check">
              <input
                type="checkbox"
                checked={(value || []).includes(k)}
                onChange={(e) => onChange(e.target.checked ? [...(value || []), k] : (value || []).filter((x: string) => x !== k))}
              />
              {l}
            </label>
          ))}
        </div>
      )
      break
    case 'checkbox':
      return (
        <label className="check">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.label}
        </label>
      )
    default: {
      const type = f.type === 'money' ? 'number' : f.type === 'datetime' ? 'datetime-local' : f.type === 'tags' ? 'text' : f.type || 'text'
      input = <input {...common} type={type} step={f.type === 'money' ? '0.01' : f.type === 'number' ? 'any' : undefined} value={value} onChange={(e) => onChange(e.target.value)} />
    }
  }
  return (
    <label className="field" htmlFor={common.id}>
      <span>
        {f.label}
        {f.required && ' *'}
      </span>
      {input}
      {f.hint && <span className="hint">{f.hint}</span>}
    </label>
  )
}

export function RecordForm({
  fields,
  initial,
  onSubmit,
  submitLabel,
}: {
  fields: FieldDef[]
  initial: any
  onSubmit: (data: any) => Promise<void>
  submitLabel?: string
}) {
  const formFields = fields.filter((f) => f.form !== false)
  const refOpts = useRefOptions(formFields)
  const [values, setValues] = useState<any>(() => Object.fromEntries(formFields.map((f) => [f.name, toFormValue(f, initial?.[f.name] ?? f.default)])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const data: any = {}
      for (const f of formFields) data[f.name] = fromFormValue(f, values[f.name])
      await onSubmit(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="grid grid-2">
        {formFields.map((f) => (
          <div key={f.name} style={f.type === 'textarea' || f.type === 'multi' ? { gridColumn: '1 / -1' } : undefined}>
            <FieldInput f={f} value={values[f.name]} onChange={(v) => setValues((s: any) => ({ ...s, [f.name]: v }))} refOpts={refOpts} />
          </div>
        ))}
      </div>
      <ErrorBox error={error} />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary" disabled={busy}>
          {busy ? tr('Guardando…', 'Saving…') : submitLabel || tr('Guardar', 'Save')}
        </button>
      </div>
    </form>
  )
}

export default function ResourcePage(p: Props) {
  const { creatable = true, editable = true, deletable = true } = p
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<any | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const qs = useMemo(() => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    Object.entries({ ...p.query, ...filters }).forEach(([k, v]) => v !== undefined && v !== '' && params.set(k, String(v)))
    return params.toString()
  }, [q, filters, p.query])
  const list = useAsync(() => api<{ items: any[]; total: number }>(`${p.endpoint}?${qs}`), [p.endpoint, qs, p.reloadKey])
  const listFields = p.fields.filter((f) => f.list !== false)
  const refOpts = useRefOptions(p.fields)
  const filterFields = p.fields.filter((f) => f.filter && (f.options || f.type === 'ref'))
  const { run } = useAction()

  const save = async (data: any) => {
    if (editing?.id) await api(`${p.endpoint}/${editing.id}`, { method: 'PATCH', body: data })
    else await api(p.endpoint, { method: 'POST', body: { ...p.query, ...data } })
    setEditing(null)
    toast(tr('Guardado', 'Saved'))
    list.reload()
  }

  const remove = (row: any) => {
    if (!confirm(tr('¿Eliminar este registro?', 'Delete this record?'))) return
    run(() => api(`${p.endpoint}/${row.id}`, { method: 'DELETE' }), tr('Eliminado', 'Deleted')).then(() => list.reload())
  }

  return (
    <div>
      {!p.hideHead && (
        <PageHead
          title={p.title}
          subtitle={p.subtitle}
          actions={
            <>
              {p.headerActions}
              {p.exportable !== false && (
                <button className="btn" onClick={() => run(() => download(`${p.endpoint}/export`, `${p.title}.csv`))}>
                  ⬇ CSV
                </button>
              )}
              {p.importable && (
                <button className="btn" onClick={() => setImportOpen(true)}>
                  ⬆ {tr('Importar', 'Import')}
                </button>
              )}
              {creatable && (
                <button className="btn primary" onClick={() => setEditing({})}>
                  + {tr('Nuevo', 'New')}
                </button>
              )}
            </>
          }
        />
      )}
      {p.hideHead && creatable && (
        <div className="row mb" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary sm" onClick={() => setEditing({})}>
            + {tr('Agregar', 'Add')}
          </button>
        </div>
      )}
      <div className="row mb">
        <input className="grow" style={{ maxWidth: 340 }} placeholder={tr('Buscar…', 'Search…')} value={q} onChange={(e) => setQ(e.target.value)} />
        {filterFields.map((f) => (
          <select key={f.name} style={{ width: 'auto' }} value={filters[f.name] || ''} onChange={(e) => setFilters((s) => ({ ...s, [f.name]: e.target.value }))}>
            <option value="">{f.label}: {tr('todos', 'all')}</option>
            {(f.options || refOpts[f.name] || []).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        ))}
        {list.data && <span className="muted small">{list.data.total} {tr('registros', 'records')}</span>}
      </div>
      <ErrorBox error={list.error} />
      {list.loading && !list.data ? (
        <Spinner />
      ) : list.data && list.data.items.length === 0 ? (
        <Empty>{p.emptyText || tr('Aún no hay registros.', 'No records yet.')}</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {listFields.map((f) => (
                  <th key={f.name}>{f.label}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((row) => (
                <tr key={row.id} className={p.onRowClick ? 'clickable' : ''} onClick={() => p.onRowClick?.(row)}>
                  {listFields.map((f) => (
                    <td key={f.name}>{displayValue(f, row, refOpts)}</td>
                  ))}
                  <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                    {p.rowActions?.(row, list.reload)}
                    {editable && (
                      <button className="btn sm ghost" onClick={() => setEditing(row)} title={tr('Editar', 'Edit')}>
                        ✎
                      </button>
                    )}
                    {deletable && (
                      <button className="btn sm ghost danger" onClick={() => remove(row)} title={tr('Eliminar', 'Delete')}>
                        🗑
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={editing.id ? tr('Editar', 'Edit') : tr('Nuevo registro', 'New record')} onClose={() => setEditing(null)}>
          <RecordForm fields={p.fields} initial={editing} onSubmit={save} />
        </Modal>
      )}
      {importOpen && <ImportModal endpoint={p.endpoint} fields={p.fields} hint={p.importHint} onClose={() => setImportOpen(false)} onDone={list.reload} />}
    </div>
  )
}

function ImportModal({ endpoint, fields, hint, onClose, onDone }: { endpoint: string; fields: FieldDef[]; hint?: string; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null)
  const { busy, run } = useAction()
  const cols = fields.filter((f) => f.form !== false && f.type !== 'ref').map((f) => f.name)
  const upload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    const r = await run(() => api(`${endpoint}/import`, { form }))
    if (r) {
      setResult(r)
      onDone()
    }
  }
  return (
    <Modal title={tr('Importar desde CSV', 'Import from CSV')} onClose={onClose}>
      <div className="stack">
        <p className="muted">
          {tr('Archivo CSV (coma o punto y coma) con encabezados. Columnas disponibles:', 'CSV file (comma or semicolon) with headers. Available columns:')}{' '}
          <code>{cols.join(', ')}</code>
        </p>
        {hint && <p className="muted small">{hint}</p>}
        <input type="file" accept=".csv,text/csv" ref={fileRef} />
        <button className="btn primary" disabled={busy} onClick={upload}>
          {busy ? tr('Importando…', 'Importing…') : tr('Importar', 'Import')}
        </button>
        {result && (
          <div className={`alert ${result.errors.length ? 'warn' : 'ok'}`}>
            {tr('Creados', 'Created')}: {result.created}
            {result.errors.length > 0 && (
              <ul className="small">
                {result.errors.map((e) => (
                  <li key={e.row}>
                    {tr('Fila', 'Row')} {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
