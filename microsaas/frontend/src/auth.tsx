import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken } from './api'

export type Sub = {
  id: number
  product: string
  product_name: string
  plan: string
  interval: 'month' | 'year'
  status: string
  trial_ends_at: string | null
  current_period_end: string | null
  has_access: boolean
  limits: Record<string, number>
  paypal_linked: boolean
  comp: boolean
}

export type Me = {
  id: number
  name: string
  email: string
  role: 'owner' | 'admin' | 'member'
  is_superadmin: boolean
  tenant: { id: number; name: string; lang: string; country: string; public_key: string }
  subscriptions: Sub[]
}

type AuthCtx = {
  me: Me | null
  loading: boolean
  refresh: () => Promise<void>
  loginWith: (token: string, me: Me) => void
  logout: () => void
  sub: (product: string) => Sub | undefined
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null)
      setLoading(false)
      return
    }
    try {
      setMe(await api<Me>('/api/auth/me'))
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const loginWith = (token: string, data: Me) => {
    setToken(token)
    setMe(data)
  }
  const logout = () => {
    setToken(null)
    setMe(null)
    location.href = '/'
  }
  const sub = (product: string) => me?.subscriptions.find((s) => s.product === product)

  return <Ctx.Provider value={{ me, loading, refresh, loginWith, logout, sub }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
