import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { Me, useAuth } from '../auth'
import { useCatalog } from '../catalog'
import { getLang, tr, useLang } from '../i18n'
import { ErrorBox } from '../components/ui'
import { PublicLayout } from './Public'

type TokenRes = { access_token: string; user: Me }

function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

export function Login() {
  useLang()
  const nav = useNavigate()
  const { loginWith } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, submit } = useSubmit()
  return (
    <PublicLayout>
      <div className="auth-box">
        <div className="card stack">
          <h2>{tr('Ingresar', 'Log in')}</h2>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              submit(async () => {
                const r = await api<TokenRes>('/api/auth/login', { body: { email, password } })
                loginWith(r.access_token, r.user)
                nav('/app')
              })
            }}
          >
            <label className="field">
              {tr('Correo', 'Email')}
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="field">
              {tr('Contraseña', 'Password')}
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
            <ErrorBox error={error} />
            <button className="btn primary block" disabled={busy}>
              {busy ? '…' : tr('Ingresar', 'Log in')}
            </button>
          </form>
          <div className="row between small">
            <Link to="/forgot">{tr('¿Olvidaste tu contraseña?', 'Forgot password?')}</Link>
            <Link to="/signup">{tr('Crear cuenta', 'Sign up')}</Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}

export function Signup() {
  useLang()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const catalog = useCatalog()
  const { loginWith } = useAuth()
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '', product: params.get('product') || 'licencialens', country: 'CO' })
  const { busy, error, submit } = useSubmit()
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const p = catalog?.products.find((x) => x.slug === form.product)
  return (
    <PublicLayout product={p}>
      <div className="auth-box">
        <div className="card stack">
          <h2>{tr('Empieza tu prueba gratis', 'Start your free trial')}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {tr(`${catalog?.trial_days ?? 14} días gratis, sin tarjeta.`, `${catalog?.trial_days ?? 14} days free, no card.`)}
          </p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              submit(async () => {
                const r = await api<TokenRes>('/api/auth/signup', { body: { ...form, lang: getLang() } })
                loginWith(r.access_token, r.user)
                nav(`/app/${form.product}`)
              })
            }}
          >
            <label className="field">
              App
              <select value={form.product} onChange={set('product')}>
                {catalog?.products.map((x) => (
                  <option key={x.slug} value={x.slug}>
                    {x.icon} {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {tr('Tu nombre', 'Your name')}
              <input required minLength={2} value={form.name} onChange={set('name')} autoComplete="name" />
            </label>
            <label className="field">
              {tr('Empresa', 'Company')}
              <input required minLength={2} value={form.company} onChange={set('company')} autoComplete="organization" />
            </label>
            <label className="field">
              {tr('Correo de trabajo', 'Work email')}
              <input type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
            </label>
            <label className="field">
              {tr('Contraseña (mín. 8)', 'Password (min. 8)')}
              <input type="password" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" />
            </label>
            <label className="field">
              {tr('País', 'Country')}
              <select value={form.country} onChange={set('country')}>
                {COUNTRIES.map(([c, n]) => (
                  <option key={c} value={c}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <ErrorBox error={error} />
            <button className="btn primary block" disabled={busy}>
              {busy ? '…' : tr('Crear cuenta gratis', 'Create free account')}
            </button>
            <p className="muted small" style={{ margin: 0 }}>
              {tr('Al registrarte aceptas los', 'By signing up you accept the')} <Link to="/terminos">{tr('términos', 'terms')}</Link> {tr('y la', 'and')}{' '}
              <Link to="/privacidad">{tr('política de privacidad', 'privacy policy')}</Link>.
            </p>
          </form>
          <div className="small">
            {tr('¿Ya tienes cuenta?', 'Already have an account?')} <Link to="/login">{tr('Ingresar', 'Log in')}</Link>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}

export function Forgot() {
  useLang()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const { busy, error, submit } = useSubmit()
  return (
    <PublicLayout>
      <div className="auth-box">
        <div className="card stack">
          <h2>{tr('Recuperar contraseña', 'Reset password')}</h2>
          {sent ? (
            <div className="alert ok">{tr('Si el correo existe, te enviamos un enlace para crear una nueva contraseña.', 'If the email exists, we sent you a link to set a new password.')}</div>
          ) : (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault()
                submit(async () => {
                  await api('/api/auth/forgot', { body: { email } })
                  setSent(true)
                })
              }}
            >
              <label className="field">
                {tr('Correo', 'Email')}
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <ErrorBox error={error} />
              <button className="btn primary block" disabled={busy}>
                {tr('Enviar enlace', 'Send link')}
              </button>
            </form>
          )}
        </div>
      </div>
    </PublicLayout>
  )
}

export function Reset() {
  useLang()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const { loginWith } = useAuth()
  const [password, setPassword] = useState('')
  const { busy, error, submit } = useSubmit()
  return (
    <PublicLayout>
      <div className="auth-box">
        <div className="card stack">
          <h2>{tr('Nueva contraseña', 'New password')}</h2>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault()
              submit(async () => {
                const r = await api<TokenRes>('/api/auth/reset', { body: { token: params.get('token'), password } })
                loginWith(r.access_token, r.user)
                nav('/app')
              })
            }}
          >
            <label className="field">
              {tr('Contraseña (mín. 8)', 'Password (min. 8)')}
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <ErrorBox error={error} />
            <button className="btn primary block" disabled={busy}>
              {tr('Guardar e ingresar', 'Save and log in')}
            </button>
          </form>
        </div>
      </div>
    </PublicLayout>
  )
}

const COUNTRIES: [string, string][] = [
  ['CO', 'Colombia'],
  ['MX', 'México'],
  ['PE', 'Perú'],
  ['CL', 'Chile'],
  ['EC', 'Ecuador'],
  ['AR', 'Argentina'],
  ['PA', 'Panamá'],
  ['CR', 'Costa Rica'],
  ['GT', 'Guatemala'],
  ['DO', 'República Dominicana'],
  ['UY', 'Uruguay'],
  ['BO', 'Bolivia'],
  ['PY', 'Paraguay'],
  ['VE', 'Venezuela'],
  ['ES', 'España'],
  ['US', 'United States'],
  ['CA', 'Canada'],
  ['GB', 'United Kingdom'],
  ['XX', 'Otro / Other'],
]
