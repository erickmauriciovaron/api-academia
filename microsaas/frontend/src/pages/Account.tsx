import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { track } from '../analytics'
import { Sub, useAuth } from '../auth'
import { loadCatalog, useCatalog } from '../catalog'
import { fmtDate, fmtDateTime, money, pick, tr, useLang } from '../i18n'
import { Badge, ErrorBox, Modal, PageHead, Spinner, toast, useAction, useAsync } from '../components/ui'
import { PricingTable } from './Public'

const STATUS: Record<string, [string, string, 'ok' | 'warn' | 'danger' | 'info']> = {
  trialing: ['Prueba', 'Trial', 'info'],
  active: ['Activa', 'Active', 'ok'],
  past_due: ['Pago pendiente', 'Past due', 'danger'],
  cancelled: ['Cancelada', 'Cancelled', 'warn'],
  expired: ['Vencida', 'Expired', 'danger'],
}

export function StatusBadge({ s }: { s: Sub }) {
  const st = STATUS[s.status] || [s.status, s.status, 'info']
  return <Badge tone={s.has_access ? st[2] : 'danger'}>{tr(st[0], st[1])}</Badge>
}

export function Billing() {
  useLang()
  const { me, refresh } = useAuth()
  const catalog = useCatalog()
  const [params] = useSearchParams()
  const [choose, setChoose] = useState<string | null>(params.get('product'))
  const [busyPlan, setBusyPlan] = useState<string | null>(null)
  const payments = useAsync(() => api<any[]>('/api/billing/payments'), [])
  const { run } = useAction()

  useEffect(() => {
    if (params.get('mock')) toast(tr('Plan activado (modo prueba)', 'Plan activated (test mode)'))
    if (params.get('cancelled')) toast(tr('Pago cancelado', 'Payment cancelled'), 'error')
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!me || !catalog) return <Spinner />
  const product = catalog.products.find((p) => p.slug === choose)
  const current = me.subscriptions.find((s) => s.product === choose)

  const pick_ = async (plan: { code: string }, interval: 'month' | 'year') => {
    setBusyPlan(plan.code)
    track('begin_checkout', { product: choose || undefined, plan: plan.code })
    const r = await run(() => api<{ approve_url: string }>('/api/billing/checkout', { body: { product: choose, plan: plan.code, interval } }))
    if (r?.approve_url) location.href = r.approve_url
    else setBusyPlan(null)
  }

  const cancel = (s: Sub) => {
    if (!confirm(tr(`¿Cancelar la suscripción de ${s.product_name}? Mantendrás el acceso hasta el fin del periodo pagado.`, `Cancel ${s.product_name}? You keep access until the end of the paid period.`))) return
    run(() => api('/api/billing/cancel', { body: { product: s.product } }), tr('Suscripción cancelada', 'Subscription cancelled')).then(refresh)
  }

  return (
    <div>
      <PageHead title={tr('Planes y pagos', 'Plans & billing')} subtitle={tr('Pagos recurrentes con PayPal (cuenta PayPal o tarjeta).', 'Recurring payments with PayPal (PayPal account or card).')} />
      <div className="table-wrap mb">
        <table>
          <thead>
            <tr>
              <th>App</th>
              <th>{tr('Plan', 'Plan')}</th>
              <th>{tr('Estado', 'Status')}</th>
              <th>{tr('Vigencia', 'Valid until')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {me.subscriptions.map((s) => {
              const p = catalog.products.find((x) => x.slug === s.product)
              const plan = p?.plans.find((x) => x.code === s.plan)
              return (
                <tr key={s.id}>
                  <td>
                    {p?.icon} <Link to={`/app/${s.product}`}>{s.product_name}</Link>
                  </td>
                  <td>
                    {plan?.name} {s.status !== 'trialing' && plan && <span className="muted small">· {money(s.interval === 'year' ? plan.price_year : plan.price)}/{s.interval === 'year' ? tr('año', 'yr') : tr('mes', 'mo')}</span>}
                  </td>
                  <td>
                    <StatusBadge s={s} />
                  </td>
                  <td>{fmtDate(s.status === 'trialing' ? s.trial_ends_at : s.current_period_end)}</td>
                  <td className="right nowrap">
                    <button className="btn sm primary" onClick={() => setChoose(s.product)}>
                      {s.status === 'active' ? tr('Cambiar plan', 'Change plan') : tr('Activar plan', 'Activate plan')}
                    </button>{' '}
                    {s.status === 'active' && !s.comp && (
                      <button className="btn sm ghost danger" onClick={() => cancel(s)}>
                        {tr('Cancelar', 'Cancel')}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <h2>{tr('Historial de pagos', 'Payment history')}</h2>
      {payments.data && payments.data.length === 0 && <p className="muted">{tr('Sin pagos aún.', 'No payments yet.')}</p>}
      {payments.data && payments.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{tr('Fecha', 'Date')}</th>
                <th>App</th>
                <th>{tr('Valor', 'Amount')}</th>
                <th>{tr('Estado', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.data.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.created_at)}</td>
                  <td>{catalog.products.find((x) => x.slug === p.product)?.name || p.product}</td>
                  <td>{money(p.amount, p.currency)}</td>
                  <td>
                    <Badge tone={p.status === 'completed' ? 'ok' : 'warn'}>{p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {product && (
        <Modal wide title={`${product.icon} ${product.name}`} onClose={() => setChoose(null)}>
          {!current ? (
            <p>{tr('Activa primero la prueba de esta app.', 'Activate this app trial first.')}</p>
          ) : (
            <PricingTable product={product} onPick={pick_} busyPlan={busyPlan} currentPlan={current.status === 'active' ? `${current.plan}:${current.interval}` : undefined} />
          )}
        </Modal>
      )}
    </div>
  )
}

export function BillingReturn() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { refresh } = useAuth()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const product = params.get('product')
    api<Sub>('/api/billing/confirm', { body: { product, subscription_id: params.get('subscription_id') } })
      .then(async (s) => {
        const pl = (await loadCatalog()).products.find((x) => x.slug === s.product)?.plans.find((x) => x.code === s.plan)
        if (s.status === 'active' && pl) track('purchase', { product: s.product, plan: s.plan, value: s.interval === 'year' ? pl.price_year : pl.price })
        await refresh()
        toast(tr('¡Pago confirmado! Gracias.', 'Payment confirmed! Thank you.'))
        nav(`/app/${product}`)
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="stack">
      <h2>{tr('Confirmando tu pago…', 'Confirming your payment…')}</h2>
      {error ? (
        <>
          <ErrorBox error={error} />
          <p className="muted">{tr('Si PayPal ya te cobró, el plan se activará en unos minutos automáticamente.', 'If PayPal already charged you, the plan will activate automatically in a few minutes.')}</p>
          <Link className="btn" to="/app/billing">
            {tr('Volver', 'Back')}
          </Link>
        </>
      ) : (
        <Spinner />
      )}
    </div>
  )
}

export function MoreApps() {
  useLang()
  const { me, refresh } = useAuth()
  const catalog = useCatalog()
  const nav = useNavigate()
  const { busy, run } = useAction()
  if (!me || !catalog) return <Spinner />
  const isAdmin = me.role !== 'member'
  return (
    <div>
      <PageHead title={tr('Todas las apps', 'All apps')} subtitle={tr('Activa la prueba gratis de cualquier app con tu misma cuenta.', 'Start a free trial of any app with the same account.')} />
      <div className="grid grid-3">
        {catalog.products.map((p) => {
          const s = me.subscriptions.find((x) => x.product === p.slug)
          return (
            <div key={p.slug} className="card stack">
              <div className="row">
                <div className="product-icon" style={{ background: `${p.color}1a` }}>
                  {p.icon}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{p.name}</h3>
                  {s && <StatusBadge s={s} />}
                </div>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {pick(p.tagline)}
              </p>
              <div className="grow" />
              {s ? (
                <Link className="btn" to={`/app/${p.slug}`}>
                  {tr('Abrir', 'Open')}
                </Link>
              ) : (
                <button
                  className="btn primary"
                  disabled={busy || !isAdmin}
                  onClick={() =>
                    run(() => api(`/api/auth/activate/${p.slug}`, { method: 'POST' }), tr('Prueba activada', 'Trial started')).then(async (r) => {
                      if (r) {
                        await refresh()
                        nav(`/app/${p.slug}`)
                      }
                    })
                  }
                >
                  {tr('Probar gratis', 'Try free')}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Team() {
  useLang()
  const { me } = useAuth()
  const list = useAsync(() => api<any[]>('/api/team'), [])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'member' })
  const { busy, run } = useAction()
  const isAdmin = me?.role !== 'member'
  return (
    <div>
      <PageHead
        title={tr('Equipo', 'Team')}
        subtitle={tr('Usuarios de tu empresa con acceso a todas tus apps.', 'Users in your company with access to all your apps.')}
        actions={
          isAdmin && (
            <button className="btn primary" onClick={() => setOpen(true)}>
              + {tr('Invitar', 'Invite')}
            </button>
          )
        }
      />
      <ErrorBox error={list.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{tr('Nombre', 'Name')}</th>
              <th>{tr('Correo', 'Email')}</th>
              <th>{tr('Rol', 'Role')}</th>
              <th>{tr('Último ingreso', 'Last login')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <Badge>{u.role}</Badge>
                </td>
                <td>{fmtDateTime(u.last_login_at)}</td>
                <td className="right">
                  {isAdmin && u.role !== 'owner' && (
                    <button
                      className="btn sm ghost danger"
                      onClick={() => confirm(tr('¿Quitar usuario?', 'Remove user?')) && run(() => api(`/api/team/${u.id}`, { method: 'DELETE' })).then(list.reload)}
                    >
                      🗑
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <Modal title={tr('Invitar usuario', 'Invite user')} onClose={() => setOpen(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              run(() => api('/api/team', { body: form }), tr('Invitación enviada', 'Invitation sent')).then((r) => {
                if (r) {
                  setOpen(false)
                  setForm({ name: '', email: '', role: 'member' })
                  list.reload()
                }
              })
            }}
          >
            <label className="field">
              {tr('Nombre', 'Name')}
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              {tr('Correo', 'Email')}
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="field">
              {tr('Rol', 'Role')}
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="member">{tr('Miembro', 'Member')}</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button className="btn primary" disabled={busy}>
              {tr('Enviar invitación', 'Send invitation')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

export function Profile() {
  useLang()
  const { me, refresh } = useAuth()
  const [form, setForm] = useState({ name: me?.name || '', company: me?.tenant.name || '', current_password: '', new_password: '' })
  const { busy, run } = useAction()
  return (
    <div style={{ maxWidth: 520 }}>
      <PageHead title={tr('Mi perfil', 'Profile')} />
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault()
          const body: any = { name: form.name, company: form.company }
          if (form.new_password) Object.assign(body, { current_password: form.current_password, new_password: form.new_password })
          run(() => api('/api/auth/me', { method: 'PATCH', body }), tr('Perfil actualizado', 'Profile updated')).then(refresh)
        }}
      >
        <label className="field">
          {tr('Nombre', 'Name')}
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">
          {tr('Empresa', 'Company')}
          <input value={form.company} disabled={me?.role === 'member'} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </label>
        <label className="field">
          {tr('Contraseña actual', 'Current password')}
          <input type="password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} />
        </label>
        <label className="field">
          {tr('Nueva contraseña', 'New password')}
          <input type="password" minLength={8} value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} />
        </label>
        <button className="btn primary" disabled={busy}>
          {tr('Guardar', 'Save')}
        </button>
      </form>
    </div>
  )
}
