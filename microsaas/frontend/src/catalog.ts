import { useEffect, useState } from 'react'
import { api } from './api'

type L<T> = { es: T; en: T }

export type Plan = {
  code: string
  name: string
  price: number
  price_year: number
  limits: Record<string, number>
  features: L<string[]>
  trial: boolean
}

export type Product = {
  slug: string
  name: string
  color: string
  icon: string
  market: 'global' | 'co'
  tagline: L<string>
  description: L<string>
  features: L<string[]>
  faq: L<[string, string][]>
  plans: Plan[]
}

export type Catalog = { products: Product[]; trial_days: number; annual_multiplier: number; payments: string }

let cache: Catalog | null = null
let pending: Promise<Catalog> | null = null

export function loadCatalog(): Promise<Catalog> {
  if (cache) return Promise.resolve(cache)
  pending = pending || api<Catalog>('/api/public/catalog').then((c) => (cache = c))
  return pending
}

export function useCatalog(): Catalog | null {
  const [c, setC] = useState<Catalog | null>(cache)
  useEffect(() => {
    if (!cache) loadCatalog().then(setC).catch(() => setC(null))
  }, [])
  return c
}

export function useProduct(slug: string | undefined): Product | undefined {
  const c = useCatalog()
  return c?.products.find((p) => p.slug === slug)
}
