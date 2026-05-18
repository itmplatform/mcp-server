import { useState, useCallback } from 'react'
import { STORAGE_KEYS } from '../utils/constants'

export function useCompanySlug() {
  const [companySlug, setSlugState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEYS.COMPANY_SLUG) ?? '',
  )

  const setCompanySlug = useCallback((slug: string) => {
    const trimmed = slug.trim().toLowerCase()
    localStorage.setItem(STORAGE_KEYS.COMPANY_SLUG, trimmed)
    setSlugState(trimmed)
  }, [])

  return { companySlug, setCompanySlug }
}
