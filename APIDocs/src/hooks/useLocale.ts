import { useState, useCallback, createContext, useContext, createElement } from 'react'
import type { ReactNode } from 'react'
import type { Locale } from '../content/types'
import { STORAGE_KEYS } from '../utils/constants'

const uiModules = import.meta.glob('../content/ui/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, Record<string, string>>

function getUiStrings(locale: Locale): Record<string, string> {
  return uiModules[`../content/ui/${locale}.json`] ?? uiModules['../content/ui/en.json'] ?? {}
}

const SUPPORTED_LOCALES: Locale[] = ['en', 'es']
const DEFAULT_LOCALE: Locale = 'en'

function detectLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const stored = localStorage.getItem(STORAGE_KEYS.LOCALE)
  if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) return stored as Locale
  const lang = navigator.language.split('-')[0].toLowerCase()
  if (SUPPORTED_LOCALES.includes(lang as Locale)) return lang as Locale
  return DEFAULT_LOCALE
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  const strings = getUiStrings(locale)

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEYS.LOCALE, next)
    setLocaleState(next)
  }, [])

  const t = useCallback((key: string, params?: Record<string, string>): string => {
    let str = strings[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params))
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
    }
    return str
  }, [strings])

  return { locale, setLocale, t }
}

interface LocaleContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, params?: Record<string, string>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const value = useLocale()
  return createElement(LocaleContext.Provider, { value }, children)
}

export function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocaleContext must be used within a LocaleProvider')
  return ctx
}
